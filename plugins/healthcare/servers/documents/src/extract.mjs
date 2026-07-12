import { spawnSync } from "node:child_process";

// Extraction runs entirely locally: liteparse's `lit` binary if the user has
// it (PATH or $LITEPARSE_PATH — the plugin manifest points the latter at the
// doc-extract skill's install), else `pdftotext -layout` for PDFs. The server
// itself never touches the network.

const MAX_BUFFER = 256 * 1024 * 1024;

const pageMarker = (page, text) => `\n\n=== [page ${page}] ===\n\n${text}`;

export function resolveLit() {
  const candidates = [process.env.LITEPARSE_PATH, "lit"].filter((p) => !!p);
  return candidates.find((p) => spawnSync(p, ["--version"], { stdio: "ignore" }).status === 0);
}

function extractWithLiteparse(lit, src) {
  // OCR on by default; retry --no-ocr so text-layer extraction still lands if the OCR path fails.
  // --format json, not text: liteparse 2.x emits no page boundaries in text/markdown output,
  // so page anchors can only be rebuilt from the JSON pages array.
  for (const extra of [[], ["--no-ocr"]]) {
    const r = spawnSync(lit, ["parse", src, "--format", "json", "--max-pages", "2000", ...extra], {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
    });
    if (r.status !== 0 || !r.stdout.trim()) continue;
    try {
      const pages = JSON.parse(r.stdout).pages ?? [];
      const text = pages.map((p) => pageMarker(p.page, p.text)).join("");
      if (text.trim()) return { text, method: "liteparse" };
    } catch {
      // unparseable stdout — try the next variant, then the pdftotext fallback
    }
  }
  return null;
}

function extractWithPdftotext(src) {
  const r = spawnSync("pdftotext", ["-layout", src, "-"], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  if (r.status !== 0) return null;
  const text = r.stdout
    .split("\f")
    .map((page, i) => pageMarker(i + 1, page))
    .join("");
  return { text, method: "pdftotext" };
}

export function extractWithMethod(lit, src, isPdf = /\.pdf$/i.test(src)) {
  if (lit) {
    const extracted = extractWithLiteparse(lit, src);
    if (extracted) return extracted;
  }
  // Only PDFs have a no-liteparse fallback.
  return isPdf ? extractWithPdftotext(src) : null;
}

export function extract(lit, src) {
  return extractWithMethod(lit, src)?.text ?? null;
}
