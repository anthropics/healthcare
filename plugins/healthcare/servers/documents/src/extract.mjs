import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Extraction is async so a corpus can be extracted in parallel: it is one
// subprocess per document, CPU-bound, and OCR on a scanned page costs seconds.
// Sequential spawnSync used one core of however many the machine has.
const pexec = promisify(execFile);

// Extraction must run BEHIND the user's work, not on top of it. Measured on an
// 18-core machine: 8 lanes of liteparse (which threads internally) drove the
// load average past 200 and the machine unusable for the whole ingest. Two
// caps: each child's internal thread pools are limited via the env vars the
// Rust/OpenMP runtimes respect, and the whole child runs at low priority so
// interactive work preempts it. `nice` is POSIX; on Windows children just run
// unniced.
// Allowlist, not a spread of process.env: the extractors parse untrusted
// document bytes and `lit` is a third-party binary — neither needs the API
// keys or tokens the server was launched with. What they do need: binary
// resolution (PATH + Windows basics), the tesseract model cache (HOME /
// TESSDATA_PREFIX), temp space, and proxy vars for OCR's one-time
// traineddata download.
const CHILD_ENV = Object.fromEntries(
  [
    "PATH",
    "HOME",
    "USERPROFILE",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SYSTEMROOT",
    "COMSPEC",
    // tesseract-rs resolves its model cache via XDG on Linux; a user who set
    // these explicitly (containers, read-only HOME) must not lose them.
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "TESSDATA_PREFIX",
    "LITEPARSE_PATH",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ]
    .filter((k) => process.env[k] !== undefined)
    .map((k) => [k, process.env[k]]),
);
CHILD_ENV.RAYON_NUM_THREADS = "2";
CHILD_ENV.OMP_THREAD_LIMIT = "2";
CHILD_ENV.TOKIO_WORKER_THREADS = "2";
let niceMissing = false;
const run = async (cmd, args, opts = {}) => {
  const o = { ...opts, env: CHILD_ENV };
  if (process.platform === "win32" || niceMissing) return pexec(cmd, args, o);
  try {
    return await pexec("nice", ["-n", "10", cmd, ...args], o);
  } catch (e) {
    // ENOENT here is `nice` itself missing — a missing cmd under nice exits
    // 127 instead. A missing nicety must not read as N parse failures.
    if (e?.code !== "ENOENT") throw e;
    niceMissing = true;
    process.stderr.write("extract: `nice` not found — running extraction at normal priority\n");
    return pexec(cmd, args, o);
  }
};

// NOTE: skills/doc-extract/scripts/extract.ts is the sibling copy of this file
// and is deliberately still synchronous — it extracts one file on demand, where
// concurrency buys nothing. Port real fixes to both; do NOT port this file's
// async signatures, or its callers will silently get a Promise where they
// expect a string.
//
// Extraction runs entirely locally: liteparse's `lit` binary if the user has
// it (the server's own node_modules, $LITEPARSE_PATH, or PATH — see
// litCandidates below), else `pdftotext -layout` for PDFs. The server itself
// never touches the network.

const MAX_BUFFER = 256 * 1024 * 1024;

const pageMarker = (page, text) => `\n\n=== [page ${page}] ===\n\n${text}`;

// Order matters. $LITEPARSE_PATH is an explicit operator choice. The plugin's
// own node_modules is the DECLARED dependency and outranks PATH, because `lit`
// on PATH is a name collision waiting to happen — the popular `lit` package
// (LitElement web components) ships a bin that would pass a --version probe and
// then be handed a contract to "parse". The node_modules copy is not extra
// trust: it lives in the same tree as this file, which node is already running.
// preprocess reports the resolved path in `extractor.path`, so which binary ran
// is always on the record.
//
// Where `lit` can be. The server declares @llamaindex/liteparse as its own
// optional dependency (`npm install` in this server's directory; .npmrc pins
// the public registry), so the binary lands in ../node_modules. Silently
// falling back to pdftotext when lit is missing matters: pdftotext cannot
// OCR, so a scanned contract extracts to nothing, gets filed "empty", and
// drops out of the answer while the user is told it "didn't scan readably".
const litCandidates = () => [
  process.env.LITEPARSE_PATH,
  // The server's own dependency (npm install here) — the canonical location.
  fileURLToPath(new URL("../node_modules/.bin/lit", import.meta.url)),
  "lit",
];

export function resolveLit() {
  return litCandidates()
    .filter((p) => !!p)
    .find((p) => spawnSync(p, ["--version"], { stdio: "ignore" }).status === 0);
}

async function extractWithLiteparse(lit, src) {
  // OCR on by default; retry --no-ocr so text-layer extraction still lands if the OCR path fails.
  // --format json, not text: liteparse 2.x emits no page boundaries in text/markdown output,
  // so page anchors can only be rebuilt from the JSON pages array.
  for (const extra of [[], ["--no-ocr"]]) {
    let stdout;
    try {
      ({ stdout } = await run(
        lit,
        ["parse", src, "--format", "json", "--max-pages", "2000", ...extra],
        {
          maxBuffer: MAX_BUFFER,
        },
      ));
    } catch (e) {
      // Oversized stdout is a cap we set, not a document defect — name it.
      if (/maxBuffer/i.test(String(e?.message)))
        process.stderr.write(`extract: ${src} output exceeded the ${MAX_BUFFER}-byte cap\n`);
      continue; // non-zero exit — try the next variant, then the pdftotext fallback
    }
    if (!stdout.trim()) continue;
    try {
      const pages = JSON.parse(stdout).pages ?? [];
      const text = pages.map((p) => pageMarker(p.page, p.text)).join("");
      if (text.trim()) return { text, method: "liteparse" };
    } catch {
      // unparseable stdout — try the next variant, then the pdftotext fallback
    }
  }
  return null;
}

async function extractWithPdftotext(src) {
  let stdout;
  try {
    ({ stdout } = await run("pdftotext", ["-layout", src, "-"], { maxBuffer: MAX_BUFFER }));
  } catch (e) {
    if (/maxBuffer/i.test(String(e?.message)))
      process.stderr.write(`extract: ${src} output exceeded the ${MAX_BUFFER}-byte cap\n`);
    return null;
  }
  const text = stdout
    .split("\f")
    .map((page, i) => pageMarker(i + 1, page))
    .join("");
  return { text, method: "pdftotext" };
}

export async function extractWithMethod(lit, src, isPdf = /\.pdf$/i.test(src)) {
  if (lit) {
    const extracted = await extractWithLiteparse(lit, src);
    if (extracted) return extracted;
  }
  // Only PDFs have a no-liteparse fallback.
  return isPdf ? await extractWithPdftotext(src) : null;
}

export async function extract(lit, src) {
  return (await extractWithMethod(lit, src))?.text ?? null;
}
