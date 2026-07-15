import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import { extname, join, relative, sep } from "node:path";

import { NAME_RE, PARSED, db, tx } from "./db.mjs";
import { die } from "./die.mjs";
import { extract, resolveLit } from "./extract.mjs";

// PLUMBING: bytes on disk → documents.content. Nothing here knows what a
// contract is.
//
// The ONLY place a filesystem path enters the system. registerRoot's
// realpathSync + isDirectory are what make corpusRoot() safe for every
// readFileSync below — keep both, and keep the throw.

/** Validate a directory and upsert the corpus row; returns the resolved root. No scan. */
function registerRoot(name, dir) {
  if (!NAME_RE.test(name)) die(`corpus_register: invalid corpus name '${name}'`);
  let root;
  try {
    root = realpathSync(dir);
  } catch {
    die(`corpus_register: ${dir} not found`);
  }
  if (!statSync(root).isDirectory()) die(`corpus_register: ${root} is not a directory`);
  db.prepare(
    `INSERT INTO corpora (name, root) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET root = excluded.root`,
  ).run(name, root);
  return root;
}

/** Register (or re-root) a corpus at a directory. */
export function corpusRegister(name, dir, files) {
  const root = registerRoot(name, dir);
  files ??= scanCorpus(root);
  return {
    corpus: name,
    root,
    sources: files.filter((f) => f.kind === "source").length,
    text_files: files.filter((f) => f.kind === "text").length,
  };
}

function corpusRoot(name) {
  const row = db.prepare(`SELECT root FROM corpora WHERE name = ?`).get(name);
  if (!row) die(`unknown corpus '${name}' — call corpus_register first`);
  if (!existsSync(row.root))
    die(`corpus '${name}' root ${row.root} no longer exists — re-register`);
  return row.root;
}

// What an extraction has to clear to count as text at all. Measured, not
// guessed: across 17 image-only scans, 14 extracted to 0 characters and the
// worst to 15, while healthy contracts run 24,000+. Anything in between is a
// real but short document — a one-line amendment, a notice — and the old
// threshold of 200 threw those away AND told the user they "didn't scan
// readably". 40 clears the worst observed scan with room to spare.
const MIN_EXTRACTED_CHARS = 40;

// Concurrent extraction subprocesses. NOT one per core: liteparse threads
// internally (~2.7 cores per process), so lanes multiply against that. Measured
// on 24 PDFs through liteparse on an 18-core machine: 1 lane 18.5s, 4 lanes
// 6.3s, 8 lanes 5.0s, 16 lanes 5.0s — the curve is flat past 8, and past that
// you only add memory (each lane buffers up to extract.mjs's MAX_BUFFER of
// stdout, which scanned pages fill far more of than text ones).
const EXTRACT_LANES = Math.max(1, Math.min(8, cpus().length - 1));

/** Characters that carry content: page anchors and layout are not text. */
const visibleChars = (text) => text.replace(/\s|\[page \d+\]|=/g, "").length;

const PREPROCESS_EXTS = ["pdf", "docx", "xlsx", "pptx"];
const PREPROCESS_EXT = new RegExp(`\\.(${PREPROCESS_EXTS.join("|")})$`, "i");
const DIRECT_TEXT_EXT = /\.(txt|md|html?)$/i;

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function parsedPath(srcSha) {
  return join(PARSED, srcSha.slice(0, 2), `${srcSha}.txt`);
}

// Empty/failed extractions are cached as placeholder files; classify by header.
// A cached extraction records its outcome in its own first line: the cache
// outlives the database (keyed by source sha, not doc id), so a rebuilt db must
// still tell a failed parse from a real document. Writer and reader must agree
// on the exact bytes — hence one table, never a hand-written string at a call
// site.
//
// Each status lists EVERY marker that has ever meant it, current first. Legacy
// markers are not dead code: the cache never expires, and db.mjs renames the
// pre-2.1.0 data dir into this one, so placeholders written by that version are
// still on disk today. Drop one and its documents read back "ok" with the
// placeholder as their text — cited, and silently wrong.
const CACHE_MARK = {
  failed: ["[extraction failed"],
  empty: ["[no text extracted", "[image-only"], // "[image-only …" — contracts <= 2.1.0
};
const failText = (why) => `${CACHE_MARK.failed[0]} — ${why}]`;
const emptyText = (why, text) => `${CACHE_MARK.empty[0]} — ${why}]\n${text}`;

/** True when this content is an extraction placeholder, not document text.
 *  Checked on content, not parse_status: rows ingested before parse_status
 *  existed carry placeholders under a NULL status. */
export function isPlaceholder(text) {
  const head = text.slice(0, 60);
  return Object.values(CACHE_MARK)
    .flat()
    .some((m) => head.startsWith(m));
}

// Reads only the first 60 bytes — a cached extraction can be megabytes, and the
// markers are ASCII so a byte-truncated head cannot corrupt the startsWith check.
function cachedStatus(path) {
  const buf = Buffer.alloc(60);
  const fd = openSync(path, "r");
  let n;
  try {
    n = readSync(fd, buf, 0, 60, 0);
  } finally {
    closeSync(fd);
  }
  const head = buf.toString("utf8", 0, n);
  for (const [status, marks] of Object.entries(CACHE_MARK))
    if (marks.some((m) => head.startsWith(m))) return status;
  return "ok";
}

// Walk a corpus dir once and classify every file. User-supplied text (.txt/.md/.html)
// for a basename overrides any sibling source file of the same stem — the user's
// extraction is preferred over ours.
function scanCorpus(dir) {
  const all = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name !== "MANIFEST.jsonl")
        all.push({ path: p, rel: relative(dir, p), name: e.name });
    }
  };
  walk(dir);
  const textStems = new Set(
    all.filter((f) => DIRECT_TEXT_EXT.test(f.name)).map((f) => f.rel.replace(DIRECT_TEXT_EXT, "")),
  );
  const out = [];
  for (const f of all) {
    if (PREPROCESS_EXT.test(f.name)) {
      const override = textStems.has(f.rel.replace(PREPROCESS_EXT, ""));
      out.push({
        path: f.path,
        rel: f.rel,
        kind: "source",
        srcSha: sha256(readFileSync(f.path)),
        override,
      });
    } else if (DIRECT_TEXT_EXT.test(f.name)) {
      out.push({ path: f.path, rel: f.rel, kind: "text", srcSha: null });
    }
  }
  return out;
}

// The corpus root is read-only input. Parsed text lands in <DATA>/parsed/<sha[:2]>/<sha>.txt,
// keyed by the SOURCE file's sha256 so identical files anywhere share one cache entry.
// Returns extractor stats plus status: Map of srcSha → outcome (not in JSON output).
async function preprocessFiles(files, force) {
  // Facts, not a sentence: the caller decides how to tell a human. `ocr` is the
  // load-bearing one — without liteparse a scanned PDF extracts to nothing, and
  // no other field here says why.
  const lit = resolveLit();
  const extractor = lit
    ? { tool: "liteparse", path: lit, ocr: true }
    : { tool: "pdftotext -layout", ocr: false };
  const sources = files.filter((f) => f.kind === "source" && !f.override && f.srcSha);
  const total = sources.length;
  const status = new Map();
  const t0 = performance.now();
  let done = 0,
    skipped = 0,
    failed = 0,
    empty = 0,
    lastReport = t0;
  const warnings = [];
  const progress = (flush) => {
    const now = performance.now();
    if (!flush && now - lastReport < 2000) return;
    lastReport = now;
    const n = done + skipped + failed + empty;
    const rate = done / Math.max(1, (now - t0) / 1000);
    const eta = done > 0 && n < total ? ` · ~${Math.ceil((total - n) / rate)}s remaining` : "";
    process.stderr.write(
      `preprocess: ${n}/${total} (${done} extracted, ${skipped} cached, ${empty} empty, ${failed} failed) · ${rate.toFixed(1)} docs/s${eta}\n`,
    );
  };
  if (total > 0) process.stderr.write(`preprocess: ${total} source files · ${extractor.tool}\n`);

  // One document per worker, EXTRACT_LANES at a time. Extraction is a CPU-bound
  // subprocess — sequential spawning used one core of however many the machine
  // has, which is invisible on text PDFs (milliseconds each) and dominant on
  // scanned ones, where OCR costs seconds per page.
  const queue = [...sources];
  // A corpus can hold the same bytes at two paths. Without this, both lanes
  // miss the cache, both OCR, and both write the same file — the work doubles
  // and the extracted/skipped counts we persist to audits go wrong.
  const inFlight = new Map();
  const one = (f) => {
    const running = inFlight.get(f.srcSha);
    if (running) return running.then(() => void (skipped++, progress()));
    const p = extractOne(f);
    inFlight.set(f.srcSha, p);
    return p;
  };
  const extractOne = async (f) => {
    const out = parsedPath(f.srcSha);
    const prior = existsSync(out) ? cachedStatus(out) : null;
    if (!force && prior !== null) {
      // Retry empty/failed placeholders when liteparse is available.
      if (!(lit && prior !== "ok")) {
        skipped++;
        status.set(f.srcSha, prior);
        return progress();
      }
    }
    // A re-extraction can come back worse than the cache — e.g. liteparse
    // vanished from PATH since the last run. Never overwrite a good extraction
    // with a placeholder: keep the text, and say the extractor regressed.
    const keepCached = (why) => {
      skipped++;
      status.set(f.srcSha, "ok");
      warnings.push(`${f.rel}: kept cached extraction — ${why}`);
      progress();
      return void process.stderr.write(`preprocess: KEEP  ${f.rel} — ${why}\n`);
    };
    mkdirSync(join(PARSED, f.srcSha.slice(0, 2)), { recursive: true });
    if (!lit && !/\.pdf$/i.test(f.rel)) {
      if (prior === "ok")
        return keepCached("re-extraction needs liteparse and it is no longer available");
      failed++;
      status.set(f.srcSha, "failed");
      writeFileSync(
        out,
        failText(
          `liteparse required for ${extname(f.rel)}; install liteparse (lit on PATH or $LITEPARSE_PATH), or supply ${f.rel.replace(PREPROCESS_EXT, ".txt")}`,
        ),
      );
      return void process.stderr.write(
        `preprocess: SKIP  ${f.rel} — liteparse required for .docx/.xlsx/.pptx\n`,
      );
    }
    const text = await extract(lit, f.path);
    if (text == null) {
      if (prior === "ok") return keepCached("re-extraction failed where the cached run succeeded");
      failed++;
      status.set(f.srcSha, "failed");
      writeFileSync(out, failText(`parse error on ${f.rel}`));
      return void process.stderr.write(`preprocess: FAIL  ${f.rel}\n`);
    }
    if (visibleChars(text) < MIN_EXTRACTED_CHARS) {
      if (prior === "ok")
        return keepCached("re-extraction returned no text where the cached run succeeded");
      empty++;
      status.set(f.srcSha, "empty");
      writeFileSync(out, emptyText("page may be blank or unreadable after OCR", text));
      return void process.stderr.write(
        `preprocess: EMPTY ${f.rel} (liteparse/OCR returned no text)\n`,
      );
    }
    writeFileSync(out, text);
    status.set(f.srcSha, "ok");
    done++;
    progress();
  };
  // A throw in one lane must drain the queue, or the other lanes keep spawning
  // subprocesses for a call that already returned an error.
  let stop = null;
  const lane = async () => {
    for (let f = queue.pop(); f && !stop; f = queue.pop()) {
      try {
        await one(f);
      } catch (e) {
        stop = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(EXTRACT_LANES, queue.length) }, lane));
  if (stop) throw stop;

  // Empty extractions with no OCR available is not a document problem, it is a
  // missing dependency — say which, or the caller reports the contract as
  // unscannable when it is merely unread.
  const needs_ocr = !extractor.ocr && empty > 0;
  if (needs_ocr)
    process.stderr.write(
      `preprocess: ${empty} document(s) extracted to nothing and OCR is unavailable — install liteparse (see the skill's README) and re-run with force\n`,
    );
  const elapsed_ms = Math.round(performance.now() - t0);
  if (total > 0) progress(true);
  return {
    extractor,
    ...(needs_ocr ? { needs_ocr: true } : {}),
    ...(warnings.length ? { warnings } : {}),
    parsed_dir: PARSED,
    extracted: done,
    skipped,
    empty,
    failed,
    elapsed_ms,
    status,
  };
}

/**
 * Register + sync + ingest in one call. Three tools meant three model turns to
 * say "get these documents ready", every run, before anything happened.
 * Idempotent: re-registering updates the root; ingest skips unchanged files.
 */
export async function corpusPrepare(name, dir, force = false) {
  // One scan (full read + sha256 of every source file) threaded through
  // register/sync/ingest — scanning in each step tripled the cost on
  // multi-GB corpora.
  const root = registerRoot(name, dir);
  const files = scanCorpus(root);
  const before = sync(name, files);
  // Empty/failed extractions are cached as placeholder files, so they are
  // invisible to new/changed/unparsed — without this check, installing
  // liteparse and re-running would report already_current forever instead of
  // re-extracting the scans (extractOne's no-force retry path).
  const retryable = () =>
    db
      .prepare(
        `SELECT substr(d.content, 1, 60) AS head
         FROM corpus_documents cd JOIN documents d ON d.id = cd.doc_id
         WHERE cd.corpus = ?`,
      )
      .all(name)
      .some((r) => isPlaceholder(r.head)) && !!resolveLit();
  const needsWork =
    force ||
    before.new.length > 0 ||
    before.changed.length > 0 ||
    before.unparsed.length > 0 ||
    retryable();
  const done = needsWork ? await ingest(name, force, files) : null;
  const docs = db
    .prepare(`SELECT count(*) AS n FROM corpus_documents WHERE corpus = ?`)
    .get(name).n;
  return {
    corpus: name,
    documents: docs,
    already_current: !needsWork,
    ...(done ? { ingested: done.ingested } : {}),
    ...(before.missing.length ? { missing: before.missing } : {}),
  };
}

/** Compare disk state under the corpus root to the DB (read-only). */
export function sync(corpus, files) {
  const dir = corpusRoot(corpus);
  files ??= scanCorpus(dir);
  const dbDocs = new Map(
    db
      .prepare(`SELECT uri, sha256, source_sha256 FROM v_corpus_documents WHERE corpus = ?`)
      .all(corpus)
      .map((r) => [r.uri, r]),
  );
  const fresh = [];
  const changed = [];
  const unparsed = [];
  const seen = new Set();
  let current = 0;
  for (const f of files) {
    if (f.kind === "source" && f.override) continue;
    seen.add(f.rel);
    const row = dbDocs.get(f.rel);
    if (f.kind === "source" && f.srcSha && !existsSync(parsedPath(f.srcSha))) unparsed.push(f.rel);
    if (!row) {
      fresh.push(f.rel);
    } else if (f.kind === "source") {
      if (row.source_sha256 === f.srcSha) current++;
      else changed.push(f.rel);
    } else {
      if (row.sha256 === sha256(readFileSync(f.path, "utf8"))) current++;
      else changed.push(f.rel);
    }
  }
  const missing = [...dbDocs.keys()].filter((u) => !seen.has(u));
  return { corpus, root: dir, current, new: fresh, changed, missing, unparsed };
}

function loadManifest(dir) {
  const manifest = new Map();
  for (const mf of [join(dir, "MANIFEST.jsonl"), join(dir, "..", "MANIFEST.jsonl")])
    if (existsSync(mf))
      for (const line of readFileSync(mf, "utf8").split("\n").filter(Boolean)) {
        const m = JSON.parse(line);
        manifest.set(m.file, m);
      }
  return manifest;
}

/** Preprocess and load a corpus's files into the documents tables. */
// Re-ingest is safe against citations.mjs's document cache WITHOUT invalidation:
// rows are content-addressed (sha256 UNIQUE), so identical text keeps its id and
// changed text gets a new one — a cached entry can never describe a doc id whose
// content moved under it. Any future path here that mutates content in place
// would break that, and must call forgetDocs().
export async function ingest(corpus, force = false, files) {
  const dir = corpusRoot(corpus);
  files ??= scanCorpus(dir);
  const { status, ...pre } = await preprocessFiles(files, force);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO audits (run_id, corpus, kind, sample_n, result) VALUES (NULL, ?, 'preprocess', ?, ?)`,
  ).run(corpus, pre.extracted + pre.skipped + pre.empty + pre.failed, JSON.stringify(pre));
  const manifest = loadManifest(dir);
  const insDoc = db.prepare(
    `INSERT INTO documents (content, sha256, family) VALUES ($content, $sha256, $family)
     ON CONFLICT(sha256) DO UPDATE SET sha256 = sha256 RETURNING id`,
  );
  const insCorpus = db.prepare(
    `INSERT INTO corpus_documents
       (corpus, uri, doc_id, source_sha256, parse_status, parsed_at, publisher, category, dated, source_url)
     VALUES ($corpus, $uri, $doc_id, $source_sha256, $parse_status, $parsed_at, $publisher, $category, $dated, $source_url)
     ON CONFLICT(corpus, uri) DO UPDATE SET
       doc_id = excluded.doc_id, source_sha256 = excluded.source_sha256,
       parse_status = excluded.parse_status, parsed_at = excluded.parsed_at,
       publisher = excluded.publisher, category = excluded.category,
       dated = excluded.dated, source_url = excluded.source_url`,
  );
  let n = 0;
  const warnings = [];
  tx(() => {
    for (const f of files) {
      if (f.kind === "source" && f.override) continue;
      let content;
      if (f.kind === "text") {
        content = readFileSync(f.path, "utf8");
      } else if (f.srcSha && existsSync(parsedPath(f.srcSha))) {
        content = readFileSync(parsedPath(f.srcSha), "utf8");
      } else {
        warnings.push(`unparsed: ${f.rel} (preprocess failed or liteparse unavailable)`);
        continue;
      }
      const contentSha = sha256(content);
      // Manifest keys: the file's own rel path, or (for user-supplied .txt) the source it stands in for.
      const stem = f.rel.replace(extname(f.rel), "");
      const m =
        manifest.get(f.rel) ??
        PREPROCESS_EXTS.map((e) => manifest.get(`${stem}.${e}`)).find(Boolean) ??
        {};
      const doc = insDoc.get({
        content,
        sha256: contentSha,
        family: f.rel.split(sep)[0] ?? "",
      });
      if (!doc) die(`ingest: upsert failed for ${f.rel}`);
      insCorpus.run({
        corpus,
        uri: f.rel,
        doc_id: doc.id,
        source_sha256: f.srcSha,
        parse_status: f.srcSha ? (status.get(f.srcSha) ?? null) : null,
        parsed_at: f.srcSha ? now : null,
        publisher: m.publisher ?? null,
        category: m.category ?? null,
        dated: m.dated ?? null,
        source_url: m.url ?? m.source_url ?? null,
      });
      n++;
    }
  });
  return { preprocess: pre, ingested: n, corpus, root: dir, warnings };
}
