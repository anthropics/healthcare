import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { checkAndStrip } from "../../shared/validate.mjs";
import {
  DATA,
  NAME_RE,
  PARSED,
  RUN_ID_RE,
  db,
  setSchemas,
  tx,
  writeSchemas,
} from "./db.mjs";
import { extract, resolveLit } from "./extract.mjs";

/** Throw an Error with the given message. */
export function die(msg) {
  throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Corpus registration — the only place a filesystem path enters the system.
// The path is canonicalized (symlinks resolved) and must be a real directory;
// every other operation resolves paths through the corpora table.
// ---------------------------------------------------------------------------

/** Register (or re-root) a corpus at a directory. */
export function corpusRegister(name, dir) {
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
  const files = scanCorpus(root);
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

// ---------------------------------------------------------------------------
// Citation minting — a citation that can't be verified against documents.content
// cannot exist (schema trigger backstops this).
// ---------------------------------------------------------------------------

/** Every word of the quote, in order, inside the judged span. A judged citation
 *  covers non-contiguous evidence (a table row, a reflowed clause), so the quote
 *  won't be a substring — but its words must still be *there*. Without this, a
 *  span-bound verdict still lets an invented sentence through. */
function spanSupportsQuote(spanText, quote) {
  // Words and numbers only — punctuation the worker added while reconstructing
  // a table row ('12%,' for '12%') must not make a faithful quote look invented.
  const tokens = quote.toLowerCase().match(/[a-z0-9%$]+/g) ?? [];
  if (!tokens.length) return false;
  const hay = spanText.toLowerCase();
  let at = 0;
  for (const tok of tokens) {
    const found = hay.indexOf(tok, at);
    if (found === -1) return false;
    at = found + tok.length;
  }
  return true;
}

function nearestIndex(haystack, needle, near) {
  if (near === undefined) {
    const first = haystack.indexOf(needle);
    // A quote that occurs more than once is not a citation — it's a coin flip
    // between clauses, and the trigger can't tell the difference because both
    // offsets verify. Make the worker say which one it read.
    if (first !== -1 && haystack.indexOf(needle, first + 1) !== -1) return -2;
    return first;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
    const d = Math.abs(i - near);
    if (d < bestD) {
      best = i;
      bestD = d;
    } else if (best >= 0) break;
  }
  return best;
}

// Fold the differences that break verbatim matching between what a worker read
// (grep window, dumped file) and documents.content: NBSP and whitespace runs,
// curly vs straight quotes/dashes, markdown emphasis. Offset map lets a
// normalized hit resolve back to the original span, so the stored quote is
// still verbatim content and kind stays 'exact'.
function normalizeWithMap(s) {
  const norm = [];
  const map = [];
  let lastWasSpace = false;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c === "*") continue;
    if (/\s| /.test(c)) {
      if (lastWasSpace) continue;
      c = " ";
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      if (c === "‘" || c === "’") c = "'";
      else if (c === "“" || c === "”") c = '"';
      else if (c === "–" || c === "—") c = "-";
    }
    norm.push(c);
    map.push(i);
  }
  return { norm: norm.join(""), map };
}

// First index whose value is >= target, clamped to the last index.
function lowerBound(sorted, target) {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Exact match first; on miss, retry on normalized text and map the hit back to
// the original content span.
function locate(content, quote, near, contentNorm) {
  const at = nearestIndex(content, quote, near);
  if (at === -2)
    die(
      `cite: quote appears more than once in this document — pass 'near' (an approximate offset) so the right occurrence is cited`,
    );
  if (at >= 0) return [at, at + quote.length];
  const h = contentNorm ?? normalizeWithMap(content);
  const { norm: nq } = normalizeWithMap(quote.trim());
  if (!nq) return null;
  const nearN = near === undefined ? undefined : lowerBound(h.map, near);
  const atN = nearestIndex(h.norm, nq, nearN);
  if (atN < 0) return null;
  const s = h.map[atN];
  const endN = atN + nq.length - 1;
  const e = h.map[endN] + 1;
  return [s, e];
}

/** span arrives as a validated length-2 array; `asSpan` narrows it. */
export const asSpan = (s) => (s ? [s[0], s[1]] : undefined);

// The content snippet below goes only to the local invoking process, which
// already has unrestricted read access to this document via sql/dump — no
// boundary is crossed. Do not route cite errors to any shared or remote sink.
function dieQuoteNotFound(content, nearOff) {
  const hint =
    nearOff !== undefined
      ? ` Content near offset ${nearOff}: «${content
          .slice(Math.max(0, nearOff - 150), nearOff + 150)
          .replace(/\s+/g, " ")}»`
      : "";
  die(
    `cite: quote not found, even after whitespace/quote normalization. For non-contiguous content (tables, reflow): write an audits row (kind='citation_judge') attesting the values are present, then retry with the span and audit id.${hint}`,
  );
}

// One-entry document cache: a worker's finds cluster on one document, and
// content is immutable (sha256-pinned), so re-fetching and re-deriving the
// surrogate index / normalized form per cite is pure waste.
let docCache = null;

function loadDoc(docId) {
  if (docCache && docCache.docId === docId) return docCache;
  const doc = db.prepare(`SELECT content, sha256 FROM documents WHERE id = ?`).get(docId);
  if (!doc) die(`cite: unknown doc_id ${docId}`);
  // Sorted UTF-16 indices of high surrogates — one per astral code point.
  const surrogates = [];
  for (let i = 0; i < doc.content.length; i++) {
    const c = doc.content.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) surrogates.push(i);
  }
  docCache = { docId, sha256: doc.sha256, content: doc.content, surrogates };
  return docCache;
}

function normOf(doc) {
  return (doc.norm ??= normalizeWithMap(doc.content));
}

// JS string offsets are UTF-16 code units; SQLite's substr()/length() count
// code points, and the citations_verify trigger compares in that unit. Every
// astral character (emoji from OCR, some CJK) before an offset shifts the two
// apart, so stored offsets are converted here — code points are canonical.
function toCodePoints(doc, utf16) {
  // Count surrogate-pair starts strictly below utf16. NOT lowerBound(): that
  // helper is clamped to [0, len-1] for map translation and can never return
  // len, which undercounts when the offset is past the last astral char.
  const a = doc.surrogates;
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < utf16) lo = mid + 1;
    else hi = mid;
  }
  return utf16 - lo;
}

function mintCitation(docId, briefId, by, quote, opts) {
  const doc = loadDoc(docId);
  // s/e arrive as UTF-16 offsets from locate(); stored offsets are code points.
  const ins = (kind, q, s, e, j) =>
    db
      .prepare(
        `INSERT INTO citations (doc_id,brief_id,kind,quote,start_off,end_off,doc_sha256,judgement_audit_id,created_by)
         VALUES ($d,$b,$k,$q,$s,$e,$h,$j,$by) RETURNING id, kind, start_off, end_off`,
      )
      .get({
        d: docId,
        b: briefId,
        k: kind,
        q,
        s: toCodePoints(doc, s),
        e: toCodePoints(doc, e),
        h: doc.sha256,
        j,
        by,
      });
  const nearOff = opts.near ?? opts.span?.[0];
  const span = locate(doc.content, quote, nearOff, normOf(doc));
  // Store the canonical slice: on a normalized match the worker's quote differs
  // in whitespace/punctuation, and citations.quote must be verbatim content.
  if (span) return ins("exact", doc.content.slice(span[0], span[1]), span[0], span[1], null);
  if (opts.span && opts.audit) {
    const [s, e] = opts.span; // UTF-16, from the caller's own reading; converted in ins()
    if (e - s > 4000) die(`cite: span is ${e - s} chars; cap is 4000. Narrow to the passage.`);
    const a = db
      .prepare(
        `SELECT id, doc_id, start_off, end_off FROM audits WHERE id=? AND kind='citation_judge'`,
      )
      .get(opts.audit);
    if (!a) die(`cite: audit ${opts.audit} not found or not kind=citation_judge`);
    // The verdict must be about this document and this span — otherwise one
    // audit row authorizes anything. (The trigger enforces this too; this is
    // where the worker gets a sentence they can act on.)
    if (
      a.doc_id !== docId ||
      toCodePoints(doc, s) !== a.start_off ||
      toCodePoints(doc, e) !== a.end_off
    )
      die(
        `cite: audit ${opts.audit} judged doc ${a.doc_id} [${a.start_off},${a.end_off}) — ` +
          `not this document and span. Write an audit for the span you actually read.`,
      );
    if (!spanSupportsQuote(doc.content.slice(s, e), quote))
      die(
        `cite: the judged span doesn't contain the words of this quote — you cannot cite what isn't there`,
      );
    return ins("judged", quote, s, e, opts.audit);
  }
  dieQuoteNotFound(doc.content, nearOff);
}

/** Mint one citation. opts: near (occurrence hint), span ([start,end]), audit (audits row id). */
export function cite(docId, briefId, by, quote, opts) {
  return mintCitation(docId, briefId, by, quote, opts);
}

/** Mint many citations in one call. Each mint is a single INSERT, so rows are
 *  independent: good rows land, bad rows come back in `rejected` with the same
 *  error+hint the single form gives (quote-not-found includes the context window).
 *  @param rows {{doc_id, quote, near?, span?, audit?}[]} */
export function citeMany(briefId, by, rows) {
  const minted = [];
  const rejected = [];
  rows.forEach((r, index) => {
    try {
      const c = mintCitation(r.doc_id, briefId, by, r.quote, {
        near: r.near,
        span: asSpan(r.span),
        audit: r.audit,
      });
      minted.push({ index, ...c });
    } catch (e) {
      rejected.push({ index, doc_id: r.doc_id, error: String(e.message ?? e) });
    }
  });
  return { minted, rejected };
}

// ---------------------------------------------------------------------------
// Worker write surface: findings and coverage
// ---------------------------------------------------------------------------

// Validation for the two find forms — same JSON-schema grammar as everything
// else (src/validate.ts). span is a length-2 array, not a tuple: tuples emit
// draft-07's array-form `items`, which the wire validator rejects.
const spanSchema = { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 };
const findRowSchema = {
  type: "object",
  required: ["kind", "claim", "doc_id", "quote"],
  properties: {
    kind: { type: "string", enum: ["finding", "unknown"] },
    claim: { type: "string" },
    doc_id: { type: "integer" },
    quote: { type: "string", minLength: 1 },
    near: { type: "integer" },
    span: spanSchema,
    audit: { type: "integer" },
  },
};
const findSchema = {
  type: "object",
  required: ["run_id", "brief_id", "round", "worker", "kind", "claim", "doc_id", "quote"],
  properties: {
    run_id: { type: "string" },
    brief_id: { type: "integer" },
    round: { type: "integer" },
    worker: { type: "string" },
    ...findRowSchema.properties,
  },
};
/** Validate a full find input against the wire schema. */
export const checkFind = (v) => checkAndStrip("find", findSchema, v);
/** Validate a find row (per-document fields only) against the wire schema. */
export const checkFindRow = (v) => checkAndStrip("find row", findRowSchema, v);

// Citation + finding + link, no transaction of its own — the callers own it:
// find() wraps one row in tx; findMany() wraps all rows and savepoints each.
// Either way a failed findings insert (dropped run, bad brief FK) rolls the
// citation back too, or it lingers with a non-NULL brief_id that drop's
// orphan sweep never reclaims.
function findCore(m) {
  const c = mintCitation(m.doc_id, m.brief_id, m.worker, m.quote, {
    near: m.near,
    span: asSpan(m.span),
    audit: m.audit,
  });
  const f = db
    .prepare(
      `INSERT INTO findings (run_id,brief_id,round,worker,kind,claim) VALUES (?,?,?,?,?,?) RETURNING id`,
    )
    .get(m.run_id, m.brief_id, m.round, m.worker, m.kind, m.claim);
  db.prepare(`INSERT INTO finding_citations (finding_id,citation_id) VALUES (?,?)`).run(f.id, c.id);
  return { citation_id: c.id, finding_id: f.id, kind: c.kind, start_off: c.start_off };
}

/** Record one finding with its citation. m: run_id, brief_id, round, worker, kind, claim, doc_id, quote, near/span/audit optional. */
export function find(m) {
  return tx(() => findCore(m));
}

/** Many findings in one call, partial success: each row runs in its own
 *  savepoint through the SAME code path as the single form — same citation
 *  verification, same triggers, same quote-not-found hint. Good rows commit;
 *  bad rows come back in `rejected` with their index and error.
 *  ctx: run_id, brief_id, round, worker. */
export function findMany(ctx, rows) {
  if (!rows.length) die(`find: rows is empty`);
  return tx(() => {
    const inserted = [];
    const rejected = [];
    rows.forEach((r, index) => {
      db.exec("SAVEPOINT find_row");
      try {
        const res = findCore({ ...ctx, ...r });
        db.exec("RELEASE find_row");
        inserted.push({ index, ...res });
      } catch (e) {
        db.exec("ROLLBACK TO find_row");
        db.exec("RELEASE find_row");
        rejected.push({ index, doc_id: r.doc_id, error: String(e.message ?? e) });
      }
    });
    return { inserted, rejected };
  });
}

/** Worker-safe read-receipt: the only write surface sweep readers hold besides find.
 *  Takes one row or many — a worker stamps its whole shard at once instead of
 *  spending a model turn per document at the tail of the critical path. */
export function coverage(m, rows) {
  if ((m === undefined) === (rows === undefined))
    die(`coverage: pass exactly one of row fields or rows`);
  const all = m ? [m] : (rows ?? []);
  if (!all.length) die(`coverage: rows is empty`);
  const stmt = db.prepare(
    `INSERT INTO shard_coverage (scope_id, doc_id, worker, status, note) VALUES (?,?,?,?,?)
     ON CONFLICT(scope_id, doc_id, worker) DO UPDATE SET status = excluded.status, note = excluded.note`,
  );
  return tx(() => {
    for (const r of all)
      stmt.run(r.scope_id, r.doc_id, r.worker, r.status, r.note ?? null);
    return { ok: true, stamped: all.length };
  });
}

// ---------------------------------------------------------------------------
// Generic table access (conductor surface)
// ---------------------------------------------------------------------------

/** Return every object in sqlite_master that has SQL. */
export function schema() {
  return db
    .prepare(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name`)
    .all();
}

/** Run one SQL statement; readers return rows, writers return changes. */
export function sql(query) {
  const stmt = db.prepare(query.trim());
  // The one sentence in the tool description was the only thing stopping
  // `SELECT * FROM v_corpus_documents` from dumping the whole corpus (2MB at
  // 40 docs) into the model's context. Make it structural.
  const banned = stmt.columns().find((c) => c.column === "content" || c.name === "content");
  if (banned)
    die(
      `sql: this query returns the 'content' column — full document text through a tool result ` +
        `blows up the context. SELECT other columns, or use doc_search / doc_text / dump.`,
    );
  // columns() is empty for non-reader statements (INSERT/UPDATE/PRAGMA …);
  // branching on it beats sniffing driver error text, and node:sqlite's
  // all() would otherwise execute writes but swallow their changes count.
  if (stmt.columns().length === 0) {
    const r = stmt.run();
    return { changes: Number(r.changes), last_insert_rowid: Number(r.lastInsertRowid) };
  }
  return stmt.all();
}

/** Several queries in one call, results keyed by position. Each query runs
 *  independently (no shared transaction): a failed one returns {error} in its
 *  slot and the rest still execute — a prescan's probes shouldn't die together. */
export function sqlMany(queries) {
  if (!queries.length) die(`sql: queries is empty`);
  return queries.map((query) => {
    try {
      return { query, result: sql(query) };
    } catch (e) {
      return { query, error: String(e.message ?? e) };
    }
  });
}

function insertRow(table, rowJson) {
  const ws = writeSchemas[table];
  if (!ws) die(`write: unknown table '${table}' (allow: ${Object.keys(writeSchemas).join(", ")})`);
  const row = checkAndStrip(`write ${table}`, ws, rowJson);
  const cols = Object.keys(row).filter((k) => row[k] !== undefined);
  return db
    .prepare(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => `$${c}`).join(",")}) RETURNING rowid AS id, *`,
    )
    .get(Object.fromEntries(cols.map((c) => [c, row[c] ?? null])));
}

/**
 * One row, or many in a single transaction. Batching matters more than it
 * looks: every tool call is a model turn, so writing 40 scope rows one at a
 * time cost minutes of wall-clock before any document got read.
 */
export function write(table, rowJson, rowsJson) {
  if ((rowJson === undefined) === (rowsJson === undefined))
    die(`write: pass exactly one of row or rows`);
  if (rowJson !== undefined) return insertRow(table, rowJson);
  const rows = rowsJson ?? [];
  if (!rows.length) die(`write: rows is empty`);
  if (rows.length > 1000) die(`write: ${rows.length} rows; cap is 1000`);
  return tx(() => ({
    inserted: rows.length,
    ids: rows.map((r) => insertRow(table, r).id),
  }));
}

/** Update one allowlisted column on one row. @param val {string | number | null} */
export function set(table, id, col, val) {
  const t = setSchemas[table];
  if (!t?.cols?.includes(col)) die(`set: ${table}.${col} not in allowlist`);
  const r = db
    .prepare(`UPDATE ${table} SET ${col} = $v WHERE ${t.pk} = $id RETURNING *`)
    .get({ v: val, id: t.pk === "id" ? Number(id) : id });
  if (!r) die(`set: no ${table} row ${id}`);
  return r;
}

/** Several updates in one transaction — all land or none do. A transition
 *  (run status + round, or a batch of answered queue items) is one call.
 *  @param updates {{table, id, col, value}[]} */
export function setMany(updates) {
  if (!updates.length) die(`set: updates is empty`);
  return tx(() => ({ updated: updates.map((u) => set(u.table, u.id, u.col, u.value)) }));
}

// ---------------------------------------------------------------------------
// Run lifecycle: drop runs, dump shard text to files
// ---------------------------------------------------------------------------

function assertRunId(op, id) {
  if (!RUN_ID_RE.test(id) || id === ".") die(`${op}: invalid run_id '${id}'`);
}

/** Delete runs by id list or run_id prefix, sweeping orphaned citations/documents. */
export function drop(runIds, prefix) {
  const ids = prefix
    ? db
        .prepare(`SELECT run_id FROM runs WHERE run_id GLOB ? || '*'`)
        .all(prefix)
        .map((r) => r.run_id)
    : runIds;
  if (!ids.length) die("drop: nothing matched");
  for (const id of ids) assertRunId("drop", id);
  const del = db.prepare(`DELETE FROM runs WHERE run_id = ?`);
  // Run deletion SET-NULLs citations.brief_id (so ratified knowledge keeps its
  // provenance); sweep the ones nothing references, and the documents they pinned.
  const orphans = tx(() => {
    ids.forEach((id) => del.run(id));
    const citations = db
      .prepare(
        `DELETE FROM citations WHERE brief_id IS NULL
             AND id NOT IN (SELECT citation_id FROM finding_citations)
             AND id NOT IN (SELECT citation_id FROM queue_citations)
             AND id NOT IN (SELECT citation_id FROM claim_citations)
             AND id NOT IN (SELECT citation_id FROM knowledge_citations)
           RETURNING id`,
      )
      .all().length;
    const documents = db
      .prepare(
        `DELETE FROM documents WHERE id NOT IN (SELECT doc_id FROM corpus_documents)
             AND id NOT IN (SELECT doc_id FROM citations) RETURNING id`,
      )
      .all().length;
    return { citations, documents };
  });
  for (const id of ids) rmSync(join(DATA, "shards", id), { recursive: true, force: true });
  return { dropped: ids, ...(orphans.citations || orphans.documents ? { swept: orphans } : {}) };
}

/**
 * Substring search across a corpus's documents, for workers that can't grep the
 * dumped shard files (no shared filesystem with this server). Returns matching
 * documents with match offsets and a short context window each, so a worker can
 * narrow to the passages worth paging in — the tool-side equivalent of the
 * "search first, read what hits" rule readers follow on files.
 */
export function docSearch(corpus, pattern, opts = {}) {
  if (!NAME_RE.test(corpus)) die(`doc_search: invalid corpus '${corpus}'`);
  if (!pattern.trim()) die(`doc_search: pattern is empty`);
  const maxDocs = Math.min(Math.max(1, opts.max_docs ?? 50), 200);
  const maxPer = Math.min(Math.max(1, opts.max_per_doc ?? 5), 20);
  const fold = opts.ignore_case ?? true;

  // Filter in SQLite, not in JS: only matching documents' text is ever
  // materialized. LIKE is ASCII-case-insensitive by default (so it is the
  // ignore_case branch); instr() is the case-sensitive one. The pattern is
  // escaped so a literal % or _ can't turn into a wildcard.
  const escaped = pattern.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = db
    .prepare(
      `SELECT d.id, d.content, cd.uri FROM documents d
       JOIN corpus_documents cd ON cd.doc_id = d.id
       WHERE cd.corpus = $corpus
         AND ${fold ? `d.content LIKE '%' || $like || '%' ESCAPE '\\'` : `instr(d.content, $raw) > 0`}
       ORDER BY d.id LIMIT $lim`,
    )
    .all({
      corpus,
      [fold ? "like" : "raw"]: fold ? escaped : pattern,
      lim: maxDocs + 1,
    });

  const truncated = rows.length > maxDocs;
  let snippetBudget = 20_000; // total context chars across the reply; callers page, not slurp
  const needle = fold ? pattern.toLowerCase() : pattern;
  const hits = rows.slice(0, maxDocs).map((r) => {
    const hay = fold ? r.content.toLowerCase() : r.content;
    const matches = [];
    let total = 0;
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
      total++;
      if (matches.length < maxPer && snippetBudget > 0) {
        const from = Math.max(0, at - 120);
        const ctx = r.content.slice(from, at + needle.length + 120);
        snippetBudget -= ctx.length;
        matches.push({ offset: at, context: ctx });
      }
    }
    return { doc_id: r.id, uri: r.uri, matches, total };
  });

  const searched = db
    .prepare(`SELECT count(*) AS n FROM corpus_documents WHERE corpus = ?`)
    .get(corpus);
  if (!searched.n) die(`doc_search: corpus '${corpus}' has no documents`);
  return {
    corpus,
    pattern,
    docs_searched: searched.n,
    docs_matched: hits.length,
    truncated,
    ...(snippetBudget <= 0 ? { snippets_truncated: true } : {}),
    hits,
  };
}

/**
 * Paginated document text, for workers that can't read the dumped shard files
 * (no shared filesystem with this server — e.g. the server is bridged in from
 * a paired device). Pair it with doc_search: search to find the documents and
 * offsets worth reading, then page only those in.
 */
export function docText(docId, offset = 0, limit = 40_000) {
  if (!Number.isInteger(docId)) die(`doc_text: doc_id must be an integer`);
  if (!Number.isInteger(offset) || offset < 0) die(`doc_text: bad offset`);
  const take = Math.min(Math.max(1, limit), 60_000);
  const doc = db
    .prepare(
      `SELECT d.id, d.content, cd.uri, d.family
       FROM documents d JOIN corpus_documents cd ON cd.doc_id = d.id
       WHERE d.id = ? LIMIT 1`,
    )
    .get(docId);
  if (!doc) die(`doc_text: unknown doc_id ${docId}`);
  const total = doc.content.length;
  if (offset >= total && total > 0) die(`doc_text: offset ${offset} past end (${total})`);
  const text = doc.content.slice(offset, offset + take);
  const next = offset + text.length;
  return {
    doc_id: doc.id,
    uri: doc.uri,
    family: doc.family,
    offset,
    chars: text.length,
    total_chars: total,
    // Offsets are code points here only because content is sliced as JS sees
    // it; citations mint their own offsets from the full document, so a worker
    // must quote verbatim rather than arithmetic on these.
    next_offset: next < total ? next : null,
    text,
  };
}

/** Page several documents in one call under ONE shared char budget (the same
 *  per-call cap as the single form — a 10-doc call can't return 10× the text).
 *  The budget is consumed in array order; a doc the budget didn't reach comes
 *  back with chars:0 and next_offset unchanged, so the caller pages it next
 *  call. Unknown doc_ids report per-doc errors without killing the batch.
 *  @param docs {{doc_id: number, offset?: number}[]} */
export function docTextMany(docs, limit = 40_000) {
  if (!docs.length) die(`doc_text: docs is empty`);
  let budget = Math.min(Math.max(1, limit), 60_000);
  const out = docs.map((d) => {
    const offset = d.offset ?? 0;
    if (budget <= 0)
      return {
        doc_id: d.doc_id,
        offset,
        chars: 0,
        next_offset: offset,
        text: "",
        budget_exhausted: true,
      };
    try {
      const r = docText(d.doc_id, offset, budget);
      budget -= r.chars;
      return r;
    } catch (e) {
      return { doc_id: d.doc_id, offset, error: String(e.message ?? e) };
    }
  });
  return { docs: out };
}

// Sweep workers materialize their shard's text to files here instead of SELECTing
// full content through the tool-result channel, which overflows result limits.
// The dir lives under DATA and is run-scoped, so shard labels can't collide.
function dumpShard(runId, label, ids) {
  assertRunId("dump", runId);
  if (!NAME_RE.test(label)) die(`dump: invalid label '${label}'`);
  if (!db.prepare(`SELECT 1 FROM runs WHERE run_id = ?`).get(runId))
    die(`dump: unknown run_id '${runId}'`);
  const dir = join(DATA, "shards", runId, label);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const q = db.prepare(
    `SELECT d.id, d.content, cd.uri, d.family
     FROM documents d JOIN corpus_documents cd ON cd.doc_id = d.id
     WHERE d.id = ? AND cd.corpus = (SELECT corpus FROM runs WHERE run_id = ?)`,
  );
  const written = [];
  const missing = [];
  for (const id of ids) {
    const doc = q.get(id, runId);
    if (!doc) {
      missing.push(id);
      continue;
    }
    const path = join(dir, `doc${id}.txt`);
    writeFileSync(path, doc.content, { mode: 0o600 });
    written.push({ doc_id: id, path, chars: doc.content.length, uri: doc.uri, family: doc.family });
  }
  return { written, ...(missing.length ? { missing } : {}) };
}

// ---------------------------------------------------------------------------
// Ingest pipeline: scan → preprocess (extract to content-addressed cache) → load
// ---------------------------------------------------------------------------

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
function cachedStatus(path) {
  const head = readFileSync(path, "utf8").slice(0, 60);
  if (head.startsWith("[no text extracted") || head.startsWith("[image-only")) return "empty";
  if (head.startsWith("[extraction failed")) return "failed";
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
function preprocessFiles(files, force) {
  const lit = resolveLit();
  const extractor = lit
    ? `liteparse (${lit})`
    : "pdftotext -layout (liteparse not found — PDF only; .docx/.xlsx/.pptx require liteparse)";
  const sources = files.filter((f) => f.kind === "source" && !f.override && f.srcSha);
  const total = sources.length;
  const status = new Map();
  const t0 = performance.now();
  let done = 0,
    skipped = 0,
    failed = 0,
    empty = 0,
    lastReport = t0;
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
  if (total > 0) process.stderr.write(`preprocess: ${total} source files · ${extractor}\n`);
  for (const f of sources) {
    if (!f.srcSha) continue;
    const out = parsedPath(f.srcSha);
    if (!force && existsSync(out)) {
      const cached = cachedStatus(out);
      // Retry empty/failed placeholders when liteparse is available.
      if (!(lit && cached !== "ok")) {
        skipped++;
        status.set(f.srcSha, cached);
        progress();
        continue;
      }
    }
    mkdirSync(join(PARSED, f.srcSha.slice(0, 2)), { recursive: true });
    if (!lit && !/\.pdf$/i.test(f.rel)) {
      failed++;
      status.set(f.srcSha, "failed");
      writeFileSync(
        out,
        `[extraction failed — liteparse required for ${extname(f.rel)}; install liteparse (lit on PATH or $LITEPARSE_PATH), or supply ${f.rel.replace(PREPROCESS_EXT, ".txt")}]`,
      );
      process.stderr.write(
        `preprocess: SKIP  ${f.rel} — liteparse required for .docx/.xlsx/.pptx\n`,
      );
      continue;
    }
    const text = extract(lit, f.path);
    if (text == null) {
      failed++;
      status.set(f.srcSha, "failed");
      writeFileSync(out, `[extraction failed — parse error on ${f.rel}]`);
      process.stderr.write(`preprocess: FAIL  ${f.rel}\n`);
      continue;
    }
    if (text.replace(/\s|\[page \d+\]|=/g, "").length < 200) {
      empty++;
      status.set(f.srcSha, "empty");
      writeFileSync(
        out,
        `[no text extracted — page may be blank or unreadable after OCR]\n${text}`,
      );
      process.stderr.write(`preprocess: EMPTY ${f.rel} (liteparse/OCR returned no text)\n`);
      continue;
    }
    writeFileSync(out, text);
    status.set(f.srcSha, "ok");
    done++;
    progress();
  }
  const elapsed_ms = Math.round(performance.now() - t0);
  if (total > 0) progress(true);
  return {
    extractor,
    parsed_dir: PARSED,
    extracted: done,
    skipped,
    empty,
    failed,
    elapsed_ms,
    status,
  };
}

// Read-only: compare what's on disk under the registered root to what the DB holds.

// Dump several shards in one call — one model turn instead of one per shard.
// A shard spec is { label, doc_ids, hunter? }.

/** Where a shard's ready-made worker prompt lives. Outside the shard dir on
 *  purpose: readers Grep their shard, and a rubric-shaped file sitting next to
 *  doc*.txt is a guaranteed false hit with no doc_id behind it. */
const promptPath = (runId, label) =>
  join(DATA, "shards", runId, `${label}.prompt.md`);

function shardPromptText(runId, sh, rubric, files, brief, round, scope) {
  const docs = files
    .map((f) => `  doc_id=${f.doc_id}  path=${f.path}  uri=${f.uri}  family=${f.family}`)
    .join("\n");
  return `RUN_ID=${runId}  brief_id=${brief}  round=${round}  scope_id=${scope}
worker=sweep:${sh.label}          <- use this exact string in every find/coverage call

<rubric>
${rubric}
</rubric>

Your shard — read every one:
${docs}
${sh.hunter ? "\nThis shard's document is large: grep it for the rubric's terms rather than reading it start to finish.\n" : ""}
TURN PLAN — a model turn is the expensive unit; batch INTO the tool first, parallel calls second, never one call per turn:
1. FIRST message: Read every document above in parallel — EXCEPT any flagged large (grep those for the rubric's terms and Read windows around the hits instead). A truncated Read means keep reading from the reported offset; finishing a document is not re-reading it. If these paths won't open (this prompt reached you over a connection, not a shared disk): for a shard of five documents or fewer, ONE doc_text call with \`docs: [{doc_id, offset}, …]\`, paging each with its next_offset until it reports null; for a larger or flagged-large shard, doc_search (pattern takes an array — every probe in one call) and doc_text the hits, again via \`docs\`. Never treat one page as the whole document.
2. Per document, ONE \`find\` call with \`rows: [{kind, claim, doc_id, quote, near?}, …]\` — every finding for that document in one call; spill into a second call rather than trimming quotes. On a document you work through incrementally, flush a rows batch every ~10 findings as you go; never hold a long document's finds to the end.
3. \`find\` returns {inserted, rejected}: each rejected row carries its index, error, and hint. Resend ONLY the rejected rows, fixed, in your next call — alongside the next document's rows.
4. LAST message, after every find has landed or been retired: the \`coverage\` batch for every doc_id, one call. Never stamp coverage in a message that still carries find retries.
5. YOUR REPLY — exactly one line: \`shard=${sh.label} status=ok|partial|error\`. ok = every doc stamped 'read'; partial = some 'read', the rest stamped 'error'; error = nothing usable landed. Findings go in \`find\` rows and reasons in \`coverage\` notes (coverage's own status enum is 'read'|'error' — never these reply tokens), not in your reply. One exception: if the \`coverage\` call itself failed, append the reason to your reply line — otherwise it is recorded nowhere.`;
}

/**
 * Dump every shard in one call, and write each shard's worker prompt to disk.
 * The prompt file is the point: without it the spawner retypes the whole
 * rubric into ten agent prompts — thousands of output tokens emitted serially
 * before a single reader exists, which was the slowest stretch of a run.
 * @param shards {{label, doc_ids, hunter?}[]}
 */
export function dump(runId, shards, opts = {}) {
  if (!shards.length) die(`dump: no shards`);
  if (shards.length > 32) die(`dump: ${shards.length} shards; cap is 32`);
  mkdirSync(join(DATA, "shards", runId), { recursive: true, mode: 0o700 });

  const out = shards.map((sh) => {
    const res = dumpShard(runId, sh.label, sh.doc_ids);
    if (opts.rubric === undefined) return { label: sh.label, ...res };
    const text = shardPromptText(
      runId,
      sh,
      opts.rubric,
      res.written,
      opts.brief_id ?? 0,
      opts.round ?? 0,
      opts.scope_id ?? 0,
    );
    const pp = promptPath(runId, sh.label);
    writeFileSync(pp, text, { mode: 0o600 });
    return { label: sh.label, prompt_path: pp, ...res };
  });
  return { shards: out };
}

/**
 * The same prompt, as text. A worker whose session can't see the engine's
 * filesystem (the server is bridged in from another machine) would otherwise
 * sweep with no rubric at all — silently, with no error.
 */
export function shardPrompt(runId, label) {
  assertRunId("shard_prompt", runId);
  if (!NAME_RE.test(label)) die(`shard_prompt: invalid label '${label}'`);
  const pp = promptPath(runId, label);
  if (!existsSync(pp))
    die(`shard_prompt: no prompt for shard '${label}' — was dump given a rubric?`);
  return { label, prompt: readFileSync(pp, "utf8") };
}

/**
 * Register + sync + ingest in one call. Three tools meant three model turns to
 * say "get these documents ready", every run, before anything happened.
 * Idempotent: re-registering updates the root; ingest skips unchanged files.
 */
export function corpusPrepare(name, dir, force = false) {
  corpusRegister(name, dir);
  const before = sync(name);
  const needsWork =
    force || before.new.length > 0 || before.changed.length > 0 || before.unparsed.length > 0;
  const done = needsWork ? ingest(name, force) : null;
  const docs = db.prepare(`SELECT count(*) AS n FROM corpus_documents WHERE corpus = ?`).get(name)
    .n;
  return {
    corpus: name,
    documents: docs,
    already_current: !needsWork,
    ...(done ? { ingested: done.ingested } : {}),
    ...(before.missing.length ? { missing: before.missing } : {}),
  };
}

/** Compare disk state under the corpus root to the DB (read-only). */
export function sync(corpus) {
  const dir = corpusRoot(corpus);
  const files = scanCorpus(dir);
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
export function ingest(corpus, force = false) {
  const dir = corpusRoot(corpus);
  const files = scanCorpus(dir);
  const { status, ...pre } = preprocessFiles(files, force);
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

// ---------------------------------------------------------------------------
// Server-side file outputs: the server owns DATA, so reports and observations
// are written here — the chat side never needs filesystem write permissions.
// ---------------------------------------------------------------------------

/** Write a run's latest report (with brief header) to <DATA>/reports/<run_id>.md. */
export function exportReport(runId) {
  if (!RUN_ID_RE.test(runId)) die(`export_report: invalid run_id '${runId}'`);
  const run = db
    .prepare(
      `SELECT r.question, b.rubric, b.assumptions, b.done_criteria, b.scope_intent
       FROM runs r JOIN briefs b ON b.run_id = r.run_id
       WHERE r.run_id = ? AND b.status='active' ORDER BY b.version DESC LIMIT 1`,
    )
    .get(runId);
  if (!run) die(`export_report: no run/active brief for '${runId}'`);
  const report = db
    .prepare(`SELECT body FROM reports WHERE run_id=? ORDER BY id DESC LIMIT 1`)
    .get(runId);
  if (!report) die(`export_report: no report rows for '${runId}'`);
  const md = [
    `## Question`,
    `> ${run.question}`,
    ``,
    `## How it was understood`,
    `**Rubric** — ${run.rubric}`,
    `**Assumptions** — ${run.assumptions}`,
    `**Done when** — ${run.done_criteria}`,
    `**Scope** — ${run.scope_intent}`,
    ``,
    `---`,
    report.body,
    ``,
  ].join("\n");
  const dir = join(DATA, "reports");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${runId}.md`);
  writeFileSync(path, md, { mode: 0o600 });
  return { path, body: report.body, chars: md.length };
}

const OBSERVATIONS_HEADER = `# /contracts observations

> Please share this file with your Anthropic contact. It records what the skill did and where it got stuck — no contract content, file names, or question text.
`;

/** Append an entry to <DATA>/observations.md, creating it with its header if absent. */
export function logObservation(entry) {
  const path = join(DATA, "observations.md");
  if (!existsSync(path)) writeFileSync(path, OBSERVATIONS_HEADER, { mode: 0o600 });
  appendFileSync(path, `\n${entry.trim()}\n`);
  return { path };
}
