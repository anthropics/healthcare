import { mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";


import schemaSql from "../schema.sql";

// ---------------------------------------------------------------------------
// Paths & identifier rules
// ---------------------------------------------------------------------------

// Plugin-wide convention: $CLAUDE_HEALTHCARE_DATA overrides the parent dir;
// each component appends its own name (see plugins/healthcare/CLAUDE.md).
const DATA_ROOT =
  process.env.CLAUDE_HEALTHCARE_DATA ?? join(process.env.HOME ?? ".", ".claude", "data", "healthcare");
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
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncT;
};
export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
// 30s: other sessions' MCP servers share this file; a long ingest
// transaction must not bounce their writes.
db.exec("PRAGMA busy_timeout = 30000");

/** [table, column, declaration] — applied when missing. Additive only; a
 *  dropped column or a moved primary key still needs a version bump. */
const ADDITIVE_COLUMNS: [string, string, string][] = [
  ["audits", "doc_id", "INTEGER REFERENCES documents(id) ON DELETE CASCADE"],
  ["audits", "start_off", "INTEGER"],
  ["audits", "end_off", "INTEGER"],
];

// Schema: every statement in schema.sql is idempotent (tables IF NOT EXISTS;
// views and triggers dropped then recreated), so run it on EVERY open. That is
// the only way an added trigger or a fixed view ever reaches a database that
// already exists — running it just once, on a fresh db, meant every additive
// change silently shipped as dead source.
//
// user_version stays as the gate for genuinely BREAKING changes (a column
// dropped, a primary key moved): those can't be patched in place, and the user
// has to delete the file.
{
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
  const hasTables = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents'")
    .get();
  const isFresh = version === 0 && !hasTables;
  if (isFresh || version === SCHEMA_VERSION) {
    db.exec(schemaSql);
    // Columns can't be added with IF NOT EXISTS. Add them here so an additive
    // change reaches databases that already exist, instead of forcing a wipe.
    for (const [table, col, decl] of ADDITIVE_COLUMNS) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
    }
  } else {
    const msg =
      `schema version ${version} != ${SCHEMA_VERSION} — the database at ${DB_PATH} is from an older alpha. ` +
      `Delete ${DB_PATH} (the parsed/ cache can stay) and re-ingest.`;
    // The MCP host only shows "server failed to start" — put the remedy on
    // stderr where the MCP log (and a curious human) can find it.
    process.stderr.write(`mcp-server-documents: ${msg}\n`);
    throw new Error(msg);
  }
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** All statements in fn commit together or not at all. */
export function tx<T>(fn: () => T): T {
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
} as const satisfies Record<string, { pk: string; cols: readonly string[] }>;

/** Insert validation per table; the key set is also the insert allowlist.
 *  Plain JSON Schema, checked by src/validate.ts — same grammar as the tool
 *  schemas, one validator for everything. `nullable` fields use type arrays
 *  (internal only; nothing here is emitted on the wire). */
const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const nstr = { type: ["string", "null"] } as const;
const nint = { type: ["integer", "null"] } as const;
const row = (required: string[], properties: Record<string, unknown>) =>
  ({ type: "object", required, properties }) as Record<string, unknown>;

export const writeSchemas: Record<string, Record<string, unknown>> = {
  runs: row(["run_id", "question", "corpus"], {
    run_id: { type: "string", pattern: RUN_ID_RE.source },
    question: str, corpus: str, status: str, round: int, session_id: nstr,
  }),
  briefs: row(["run_id", "version", "rubric", "assumptions", "done_criteria", "scope_intent"], {
    run_id: str, version: int, rubric: str, assumptions: str,
    done_criteria: str, scope_intent: str, status: str,
  }),
  scopes: row(["run_id", "brief_id", "predicate", "terms", "rationale"], {
    run_id: str, brief_id: int, predicate: str, terms: str,
    cap: nint, excluded_count: int, rationale: str,
  }),
  shard_coverage: row(["scope_id", "doc_id", "worker", "status"], {
    scope_id: int, doc_id: int, worker: str,
    status: { type: "string", enum: ["read", "error"] }, note: nstr,
  }),
  scope_documents: row(["scope_id", "doc_id", "rank"], { scope_id: int, doc_id: int, rank: int }),
  findings: row(["run_id", "brief_id", "round", "worker", "kind", "claim"], {
    run_id: str, brief_id: int, round: int, worker: str,
    kind: { type: "string", enum: ["finding", "unknown"] }, claim: str,
  }),
  finding_citations: row(["finding_id", "citation_id"], { finding_id: int, citation_id: int }),
  queue_items: row(["run_id", "brief_id", "round", "question"], {
    run_id: str, brief_id: int, round: int, question: str, context: str,
    blocking: { type: "integer", minimum: 0, maximum: 1 }, status: str,
    answer: nstr, answered_by: nstr, answered_at: nstr,
  }),
  queue_citations: row(["queue_item_id", "citation_id"], { queue_item_id: int, citation_id: int }),
  reports: row(["run_id", "brief_id", "body"], { run_id: str, brief_id: int, body: str }),
  report_claims: row(["report_id", "claim"], { report_id: int, claim: str }),
  claim_citations: row(["claim_id", "citation_id"], { claim_id: int, citation_id: int }),
  knowledge: row(["corpus", "fact"], {
    corpus: str, fact: str, status: str, ratified_by: nstr,
    source_run_id: nstr, source_queue_item_id: nint,
  }),
  knowledge_citations: row(["knowledge_id", "citation_id"], { knowledge_id: int, citation_id: int }),
  audits: row(["kind", "result"], {
    doc_id: int, start_off: int, end_off: int, run_id: nstr, corpus: nstr,
    kind: { type: "string", enum: ["mechanical", "semantic_sample", "recall_sample", "citation_judge", "preprocess"] },
    sample_n: int, result: str,
  }),
};
export type WritableTable = string; // validated against writeSchemas keys at call time
