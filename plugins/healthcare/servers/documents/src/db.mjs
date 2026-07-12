import { mkdirSync, existsSync, renameSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const schemaSql = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Paths & identifier rules
// ---------------------------------------------------------------------------

// Plugin-wide convention: $CLAUDE_HEALTHCARE_DATA overrides the parent dir;
// each component appends its own name (see plugins/healthcare/CLAUDE.md).
const DATA_ROOT =
  process.env.CLAUDE_HEALTHCARE_DATA ??
  join(process.env.HOME ?? ".", ".claude", "data", "healthcare");
// Data lived under "contracts" before the engine went generic; migrate once.
const LEGACY_DATA = join(DATA_ROOT, "contracts");
export const DATA = join(DATA_ROOT, "documents");
if (existsSync(LEGACY_DATA) && !existsSync(DATA)) renameSync(LEGACY_DATA, DATA);
export const DB_PATH = join(DATA, "data.sqlite");
export const PARSED = join(DATA, "parsed");

// Identifiers are used in filesystem paths, so they must not contain "..".
export const RUN_ID_RE = /^(?!.*\.\.)[A-Za-z0-9_.:-]{1,64}$/;
export const NAME_RE = /^(?!.*\.\.)[A-Za-z0-9_.-]{1,64}$/;
export const SCHEMA_VERSION = 4;

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

mkdirSync(DATA, { recursive: true, mode: 0o700 });

// Loaded at evaluation time, not link time: a static `import "node:sqlite"`
// would fail during ESM linking on old node, before requirements.ts can
// print its friendly version message.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
export const db = new DatabaseSync(DB_PATH);
// 30s, and set before anything that can take a lock: other sessions' MCP
// servers share this file, and on a fresh database the WAL conversion below
// needs an exclusive lock — without the timeout a concurrent open bounces.
db.exec("PRAGMA busy_timeout = 30000");
db.exec("PRAGMA foreign_keys = ON");
// node:sqlite reports EXTENDED result codes (261 SQLITE_BUSY_RECOVERY, 517
// SQLITE_BUSY_SNAPSHOT, ...); the primary code is the low byte.
const isBusy = (e) => ((e.errcode ?? 0) & 0xff) === 5;
// Converting a fresh database to WAL bypasses the busy handler, so when
// first-opens race the losers see SQLITE_BUSY while the winner converts.
// WAL is persistent in the file: only one process ever needs this to
// succeed, so losing the race is fine and anything else still throws.
try {
  db.exec("PRAGMA journal_mode = WAL");
} catch (e) {
  if (!isBusy(e)) throw e;
}
db.exec("PRAGMA synchronous = NORMAL");

/** [table, column, declaration] — applied when missing. Additive only; a
 *  dropped column or a moved primary key still needs a version bump. */
const ADDITIVE_COLUMNS = [
  ["audits", "doc_id", "INTEGER REFERENCES documents(id) ON DELETE CASCADE"],
  ["audits", "start_off", "INTEGER"],
  ["audits", "end_off", "INTEGER"],
];

// Schema: every statement in schema.sql is idempotent (tables IF NOT EXISTS;
// views and triggers dropped then recreated), so run it on EVERY open. That is
// the only way an added trigger, a fixed view, or DDL damaged at runtime ever
// reaches a database that already exists — a skip-when-current fast path
// shipped briefly and was dropped: it froze accidental damage in place and
// trusted a marker that older plugin versions sharing this file never
// maintain.
//
// user_version stays as the gate for genuinely BREAKING changes (a column
// dropped, a primary key moved): those can't be patched in place, and the user
// has to delete the file.
//
// Probe and apply run as ONE immediate transaction: every client (each
// Desktop window, the Cowork device bridge, every CLI session) spawns its own
// server process against this shared file, often within the same millisecond;
// unserialized, the DROP/CREATE pairs race ("view already exists") and the
// version probe can read another process's half-applied state and misdiagnose
// a current database as a stale one.
try {
  tx(() => {
    const version = db.prepare("PRAGMA user_version").get().user_version;
    const hasTables = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents'")
      .get();
    if (version !== SCHEMA_VERSION && !(version === 0 && !hasTables)) {
      const msg =
        `schema version ${version} != ${SCHEMA_VERSION} — the database at ${DB_PATH} is from an older alpha. ` +
        `Delete ${DB_PATH} (the parsed/ cache can stay) and re-ingest.`;
      // The MCP host only shows "server failed to start" — put the remedy
      // on stderr where the MCP log (and a curious human) can find it.
      process.stderr.write(`mcp-server-documents: ${msg}\n`);
      throw new Error(msg);
    }
    db.exec(schemaSql);
    // Columns can't be added with IF NOT EXISTS. Add them here so an
    // additive change reaches databases that already exist, instead of
    // forcing a wipe.
    for (const [table, col, decl] of ADDITIVE_COLUMNS) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!cols.some((c) => c.name === col))
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
    }
  });
} catch (e) {
  if (isBusy(e))
    process.stderr.write(
      `mcp-server-documents: database is busy — another session is mid-write (likely a long ingest); retry once it finishes\n`,
    );
  throw e;
}

// The schema transaction serialized us behind any concurrent first-open, so
// the journal mode is settled: a non-WAL reading here is real degradation
// (backup restored without conversion, conversion blocked by a long-lived
// reader) that runs readers-block-writers — log it, or it's invisible.
{
  // In a delete-mode db this read can itself go busy behind a writer —
  // which is the very contention being reported, so warn rather than die.
  let journal_mode = "unreadable (locked)";
  try {
    journal_mode = db.prepare("PRAGMA journal_mode").get().journal_mode;
  } catch (e) {
    if (!isBusy(e)) throw e;
  }
  if (journal_mode !== "wal")
    process.stderr.write(
      `mcp-server-documents: journal_mode is "${journal_mode}", not "wal" — concurrent sessions will contend until a restart with no other sessions running converts it\n`,
    );
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** All statements in fn commit together or not at all. */
export function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // already rolled back
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Write validation
// ---------------------------------------------------------------------------

/** Tables that allow in-place updates, and which columns may be set. */
export const setSchemas = {
  runs: { pk: "run_id", cols: ["status", "round", "session_id"] },
  briefs: { pk: "id", cols: ["status"] },
  queue_items: { pk: "id", cols: ["status", "answer", "answered_by", "answered_at"] },
  knowledge: { pk: "id", cols: ["status", "ratified_by"] },
};

/** Insert validation per table; the key set is also the insert allowlist.
 *  Plain JSON Schema, checked by src/validate.ts — same grammar as the tool
 *  schemas, one validator for everything. `nullable` fields use type arrays
 *  (internal only; nothing here is emitted on the wire). */
const str = { type: "string" };
const int = { type: "integer" };
const nstr = { type: ["string", "null"] };
const nint = { type: ["integer", "null"] };
const row = (required, properties) => ({ type: "object", required, properties });

export const writeSchemas = {
  runs: row(["run_id", "question", "corpus"], {
    run_id: { type: "string", pattern: RUN_ID_RE.source },
    question: str,
    corpus: str,
    status: str,
    round: int,
    session_id: nstr,
  }),
  briefs: row(["run_id", "version", "rubric", "assumptions", "done_criteria", "scope_intent"], {
    run_id: str,
    version: int,
    rubric: str,
    assumptions: str,
    done_criteria: str,
    scope_intent: str,
    status: str,
  }),
  scopes: row(["run_id", "brief_id", "predicate", "terms", "rationale"], {
    run_id: str,
    brief_id: int,
    predicate: str,
    terms: str,
    cap: nint,
    excluded_count: int,
    rationale: str,
  }),
  shard_coverage: row(["scope_id", "doc_id", "worker", "status"], {
    scope_id: int,
    doc_id: int,
    worker: str,
    status: { type: "string", enum: ["read", "error"] },
    note: nstr,
  }),
  scope_documents: row(["scope_id", "doc_id", "rank"], { scope_id: int, doc_id: int, rank: int }),
  findings: row(["run_id", "brief_id", "round", "worker", "kind", "claim"], {
    run_id: str,
    brief_id: int,
    round: int,
    worker: str,
    kind: { type: "string", enum: ["finding", "unknown"] },
    claim: str,
  }),
  finding_citations: row(["finding_id", "citation_id"], { finding_id: int, citation_id: int }),
  queue_items: row(["run_id", "brief_id", "round", "question"], {
    run_id: str,
    brief_id: int,
    round: int,
    question: str,
    context: str,
    blocking: { type: "integer", minimum: 0, maximum: 1 },
    status: str,
    answer: nstr,
    answered_by: nstr,
    answered_at: nstr,
  }),
  queue_citations: row(["queue_item_id", "citation_id"], { queue_item_id: int, citation_id: int }),
  reports: row(["run_id", "brief_id", "body"], { run_id: str, brief_id: int, body: str }),
  report_claims: row(["report_id", "claim"], { report_id: int, claim: str }),
  claim_citations: row(["claim_id", "citation_id"], { claim_id: int, citation_id: int }),
  knowledge: row(["corpus", "fact"], {
    corpus: str,
    fact: str,
    status: str,
    ratified_by: nstr,
    source_run_id: nstr,
    source_queue_item_id: nint,
  }),
  knowledge_citations: row(["knowledge_id", "citation_id"], {
    knowledge_id: int,
    citation_id: int,
  }),
  audits: row(["kind", "result"], {
    doc_id: int,
    start_off: int,
    end_off: int,
    run_id: nstr,
    corpus: nstr,
    kind: {
      type: "string",
      enum: ["mechanical", "semantic_sample", "recall_sample", "citation_judge", "preprocess"],
    },
    sample_n: int,
    result: str,
  }),
};
