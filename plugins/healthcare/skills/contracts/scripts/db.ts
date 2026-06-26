import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

import { z } from "zod";

export const ROOT = dirname(dirname(new URL(import.meta.url).pathname));
export const CORPORA = process.env.ANT_CONTRACTS_CORPORA ?? join(process.cwd(), "corpora");
// User allowlists ~/.claude/data/healthcare via sandbox.filesystem.allowWrite
// (README quick-start); subagents and Workflow workers inherit it. Plugin-wide
// convention: $CLAUDE_HEALTHCARE_DATA overrides the parent dir; each skill
// appends its own name (see plugins/healthcare/CLAUDE.md).
const DATA_ROOT =
  process.env.CLAUDE_HEALTHCARE_DATA ??
  join(process.env.HOME ?? ".", ".claude", "data", "healthcare");
export const DATA = join(DATA_ROOT, "contracts");
export const DB_PATH = join(DATA, "data.sqlite");
export const PARSED = join(DATA, "parsed");
export const RUN_ID_RE = /^(?!.*\.\.)[A-Za-z0-9_.:-]{1,64}$/;
export const SCHEMA_VERSION = 3;

try {
  mkdirSync(DATA, { recursive: true, mode: 0o700 });
} catch {
  console.error(
    JSON.stringify({
      error: `FAIL: cannot create ${DATA}`,
      fix: `Bash sandbox is blocking writes. Allowlist this CLI once: /sandbox exclude "bun */contracts/scripts/cli.ts*"`,
    }),
  );
  process.exit(2);
}
export const db = new Database(DB_PATH, { create: true, strict: true });
db.run("PRAGMA foreign_keys = ON");
db.run("PRAGMA journal_mode = WAL"); // persists in file header; no-op after first set
db.run("PRAGMA synchronous = NORMAL"); // per-connection; safe under WAL
db.run("PRAGMA busy_timeout = 30000");
{
  // schema.sql is CREATE IF NOT EXISTS, so a pre-existing DB keeps its old table shapes.
  // v==0 means either a fresh DB or a pre-versioning one — distinguish by whether tables exist.
  const v = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  const hasTables = db
    .query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents'")
    .get();
  if (v === SCHEMA_VERSION) {
    // Already current — skip schema.sql so cold spawns under sweep don't each take a
    // write lock for the unconditional `PRAGMA user_version` at the end of the file.
  } else if (v === 0 && !hasTables) {
    db.run(readFileSync(join(ROOT, "schema.sql"), "utf8"));
  } else {
    console.error(
      JSON.stringify({
        error: `FAIL: schema version ${v} != ${SCHEMA_VERSION}`,
        fix: `The database at ${DB_PATH} is from an older alpha. Delete ${DB_PATH} (the parsed/ cache can stay) and re-run — the corpus will be re-ingested automatically.`,
      }),
    );
    process.exit(2);
  }
}

export const setSchemas = {
  runs: { pk: "run_id", cols: ["status", "round", "session_id"] },
  briefs: { pk: "id", cols: ["status"] },
  queue_items: { pk: "id", cols: ["status", "answer", "answered_by", "answered_at"] },
  knowledge: { pk: "id", cols: ["status", "ratified_by"] },
} as const satisfies Record<string, { pk: string; cols: readonly string[] }>;

export const MODELS = {
  main: process.env.ANT_CONTRACTS_MODEL_MAIN ?? "claude-opus-4-8",
  worker: process.env.ANT_CONTRACTS_MODEL_WORKER ?? "claude-opus-4-8",
} as const;

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
    run_id: z.string().nullish(),
    corpus: z.string().nullish(),
    kind: z.enum([
      "mechanical",
      "semantic_sample",
      "recall_sample",
      "citation_judge",
      "preprocess",
    ]),
    sample_n: z.number().int().optional(),
    result: z.string(),
  }),
} as const;
export type WritableTable = keyof typeof writeSchemas;
