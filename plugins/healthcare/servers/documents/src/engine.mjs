import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { checkAndStrip } from "../../shared/validate.mjs";
import { forgetDocs } from "./citations.mjs";
import { DATA, NAME_RE, RUN_ID_RE, db, setSchemas, tx, writeSchemas } from "./db.mjs";
import { die } from "./die.mjs";
import { isPlaceholder } from "./ingest.mjs";

// RUN MACHINERY: tables, document reading, shards, run lifecycle, file outputs.
// The parts with opinions live next door — citations.mjs (the guarantee),
// ingest.mjs (extraction) — and re-export through here so index.mjs has one
// import site.

export { die };
export {
  asSpan,
  checkFind,
  checkFindRow,
  cite,
  citeMany,
  coverage,
  find,
  findMany,
} from "./citations.mjs";
export { corpusPrepare, corpusRegister, ingest, sync } from "./ingest.mjs";

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

// Audit spans arrive in the caller's unit — UTF-16 JS string indices — but
// cite() and the citations_verify trigger compare them in code points
// (SQLite's substr/length unit). Convert at the write boundary so stored
// offsets are canonical; on content with no astral characters the units
// coincide, so offsets already given as code points pass through unchanged.
function auditSpanToCodePoints(row) {
  const doc = db.prepare(`SELECT content FROM documents WHERE id = ?`).get(row.doc_id);
  if (!doc)
    die(
      `write audits: unknown doc_id ${row.doc_id} — a citation_judge span must reference an ingested document`,
    );
  const cp = (i) => i - (doc.content.slice(0, i).match(/[\uD800-\uDBFF]/g)?.length ?? 0);
  return { ...row, start_off: cp(row.start_off), end_off: cp(row.end_off) };
}

function insertRow(table, rowJson) {
  const ws = writeSchemas[table];
  if (!ws) die(`write: unknown table '${table}' (allow: ${Object.keys(writeSchemas).join(", ")})`);
  let row = checkAndStrip(`write ${table}`, ws, rowJson);
  if (
    table === "audits" &&
    row.kind === "citation_judge" &&
    row.doc_id !== undefined &&
    row.start_off !== undefined &&
    row.end_off !== undefined
  )
    row = auditSpanToCodePoints(row);
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
  forgetDocs(); // a dropped doc id may be reused by re-ingest; never serve stale content
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
  // Default to the cap: doc count is cheap (the snippet budget below bounds
  // context, and past it a hit is just id+uri+total), while a short list
  // silently starves scoping.
  const maxDocs = Math.min(Math.max(1, opts.max_docs ?? 200), 200);
  const maxPer = Math.min(Math.max(1, opts.max_per_doc ?? 5), 20);
  const fold = opts.ignore_case ?? true;

  // Filter in SQLite, not in JS: only matching documents' text is ever
  // materialized. LIKE is ASCII-case-insensitive by default (so it is the
  // ignore_case branch); instr() is the case-sensitive one. The pattern is
  // escaped so a literal % or _ can't turn into a wildcard.
  const escaped = pattern.replace(/[\\%_]/g, (c) => `\\${c}`);
  // One WHERE fragment and one params object for BOTH queries below — if the
  // match semantics and the count ever diverge, docs_matched lies again.
  // Placeholder docs are excluded outright: an 'empty' extraction keeps its
  // sub-threshold OCR fragments below the marker, so rubric terms can match
  // inside them — and a bridged reader would then doc_text and cite a doc
  // that has no real text.
  const matchWhere = `cd.corpus = $corpus
         AND (cd.parse_status IS NULL OR cd.parse_status = 'ok')
         AND ${fold ? `d.content LIKE '%' || $like || '%' ESCAPE '\\'` : `instr(d.content, $raw) > 0`}`;
  const matchParams = { corpus, [fold ? "like" : "raw"]: fold ? escaped : pattern };
  const rows = db
    .prepare(
      `SELECT d.id, d.content, cd.uri FROM documents d
       JOIN corpus_documents cd ON cd.doc_id = d.id
       WHERE ${matchWhere}
       ORDER BY d.id LIMIT $lim`,
    )
    .all({ ...matchParams, lim: maxDocs + 1 });

  // The true match count, not the capped list length: a flag can be skimmed
  // past, but "docs_matched: 387" next to 50 hits cannot — a scope built from
  // a capped list must know what it's missing.
  const truncated = rows.length > maxDocs;
  const totalMatched = truncated
    ? db
        .prepare(
          `SELECT count(*) AS n FROM documents d
           JOIN corpus_documents cd ON cd.doc_id = d.id
           WHERE ${matchWhere}`,
        )
        .get(matchParams).n
    : rows.length;
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
    docs_matched: totalMatched,
    docs_returned: hits.length,
    ...(truncated
      ? {
          truncated: true,
          warning: `${totalMatched} documents match but only ${hits.length} are returned — a scope built from this list is INCOMPLETE. Raise max_docs (cap 200), narrow the pattern, or scope by sql count instead.`,
        }
      : {}),
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
  // Don't serve a placeholder as document text: on the bridged path this is
  // the reader's only view of the doc, and nothing else would warn it.
  if (isPlaceholder(doc.content))
    die(
      `doc_text: doc ${docId} (${doc.uri}) has no extracted text — extraction failed or found nothing. It cannot be read or cited; the conductor's triage step reviews it visually.`,
    );
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
  // A reused label must start clean — leftover doc files from a previous dump
  // would read as part of this shard.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const q = db.prepare(
    `SELECT d.id, d.content, cd.uri, d.family, cd.parse_status
     FROM documents d JOIN corpus_documents cd ON cd.doc_id = d.id
     WHERE d.id = ? AND cd.corpus = (SELECT corpus FROM runs WHERE run_id = ?)`,
  );
  const written = [];
  const missing = [];
  const unreadable = [];
  for (const id of ids) {
    const doc = q.get(id, runId);
    if (!doc) {
      missing.push(id);
      continue;
    }
    // A failed/empty extraction has only a placeholder for content. Shipping it
    // would hand a reader "[extraction failed …]" as contract text — and
    // loadDoc refuses to cite a placeholder, so the reader couldn't record a
    // single finding from it. Route these to the triage visual pass instead.
    if (
      doc.parse_status === "failed" ||
      doc.parse_status === "empty" ||
      isPlaceholder(doc.content)
    ) {
      // The content check catches legacy rows: placeholders written before
      // parse_status existed carry a NULL status.
      unreadable.push({
        doc_id: id,
        uri: doc.uri,
        parse_status: doc.parse_status ?? "legacy-placeholder",
      });
      continue;
    }
    const path = join(dir, `doc${id}.txt`);
    writeFileSync(path, doc.content, { mode: 0o600 });
    written.push({ doc_id: id, path, chars: doc.content.length, uri: doc.uri, family: doc.family });
  }
  return {
    written,
    ...(missing.length ? { missing } : {}),
    ...(unreadable.length ? { unreadable } : {}),
  };
}

// ---------------------------------------------------------------------------
// Ingest pipeline: scan → preprocess (extract to content-addressed cache) → load
// ---------------------------------------------------------------------------

/** Where a shard's ready-made worker prompt lives. Outside the shard dir on
 *  purpose: readers Grep their shard, and a rubric-shaped file sitting next to
 *  doc*.txt is a guaranteed false hit with no doc_id behind it. */
const promptPath = (runId, label) => join(DATA, "shards", runId, `${label}.prompt.md`);

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
2. ONE \`find\` call for the WHOLE shard: \`rows: [{kind, claim, cites: [{doc_id, lines, has}, …]}, …]\` mixes doc_ids freely, and after reading a normal-size shard you know every finding — emit them all in one call (cap 50 rows — a 51-row call is refused WHOLE, nothing lands; split and resend all of it, don't treat it as a partial rejection). Only a document you work through incrementally (large/flagged) earns its own calls — flush a rows batch every ~10 findings as you go; never hold a long document's finds to the end. **Cite by line numbers, not transcription** — your role file's citation rules govern what goes in each cite; follow them exactly.
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
    // No readable docs -> no prompt file and no prompt_path: the missing path
    // is the conductor's signal to drop this label instead of spawning a
    // reader with an empty document list.
    if (!res.written.length) return { label: sh.label, ...res };
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

// ---------------------------------------------------------------------------
// Server-side file outputs: the server owns DATA, so the observations log is
// written here — the chat side never needs filesystem write permissions.
// ---------------------------------------------------------------------------

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
