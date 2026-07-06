import { mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";

import { z } from "zod";

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

/** Insert validation per table; the key set is also the insert allowlist. */
export const writeSchemas = {
  runs: z.object({
    run_id: z.string().regex(RUN_ID_RE),
    question: z.string(),
    corpus: z.string(),
    status: z.string().optional(),
    round: z.number().int().optional(),
    session_id: z.string().nullish(),
  }),
  briefs: z.object({
    run_id: z.string(),
    version: z.number().int(),
    rubric: z.string(),
    assumptions: z.string(),
    done_criteria: z.string(),
    scope_intent: z.string(),
    status: z.string().optional(),
  }),
  scopes: z.object({
    run_id: z.string(),
    brief_id: z.number().int(),
    predicate: z.string(),
    terms: z.string(),
    cap: z.number().int().nullish(),
    excluded_count: z.number().int().optional(),
    rationale: z.string(),
  }),
  shard_coverage: z.object({
    scope_id: z.number().int(),
    doc_id: z.number().int(),
    worker: z.string(),
    status: z.enum(["read", "error"]),
    note: z.string().nullish(),
  }),
  scope_documents: z.object({
    scope_id: z.number().int(),
    doc_id: z.number().int(),
    rank: z.number().int(),
  }),
  findings: z.object({
    run_id: z.string(),
    brief_id: z.number().int(),
    round: z.number().int(),
    worker: z.string(),
    kind: z.enum(["finding", "unknown"]),
    claim: z.string(),
  }),
  finding_citations: z.object({ finding_id: z.number().int(), citation_id: z.number().int() }),
  queue_items: z.object({
    run_id: z.string(),
    brief_id: z.number().int(),
    round: z.number().int(),
    question: z.string(),
    context: z.string().optional(),
    blocking: z.number().int().min(0).max(1).optional(),
    status: z.string().optional(),
    answer: z.string().nullish(),
    answered_by: z.string().nullish(),
    answered_at: z.string().nullish(),
  }),
  queue_citations: z.object({ queue_item_id: z.number().int(), citation_id: z.number().int() }),
  reports: z.object({ run_id: z.string(), brief_id: z.number().int(), body: z.string() }),
  report_claims: z.object({ report_id: z.number().int(), claim: z.string() }),
  claim_citations: z.object({ claim_id: z.number().int(), citation_id: z.number().int() }),
  knowledge: z.object({
    corpus: z.string(),
    fact: z.string(),
    status: z.string().optional(),
    ratified_by: z.string().nullish(),
    source_run_id: z.string().nullish(),
    source_queue_item_id: z.number().int().nullish(),
  }),
  knowledge_citations: z.object({ knowledge_id: z.number().int(), citation_id: z.number().int() }),
  audits: z.object({
    doc_id: z.number().int().optional(),
    start_off: z.number().int().optional(),
    end_off: z.number().int().optional(),
    run_id: z.string().nullish(),
    corpus: z.string().nullish(),
    kind: z.enum(["mechanical", "semantic_sample", "recall_sample", "citation_judge", "preprocess"]),
    sample_n: z.number().int().optional(),
    result: z.string(),
  }),
} as const;
export type WritableTable = keyof typeof writeSchemas;
