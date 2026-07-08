#!/usr/bin/env node

// src/requirements.ts
var [maj = 0, min = 0] = process.versions.node.split(".").map(Number);
if (maj < 22 || maj === 22 && min < 13) {
  process.stderr.write(`mcp-server-documents: node ${process.versions.node} is too old — this server needs node >= 22.13 (node:sqlite with columns()). ` + `Install a current node (https://nodejs.org) and retry.
`);
  process.exit(1);
}

// src/engine.ts
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync as existsSync2,
  mkdirSync as mkdirSync2,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { extname, join as join2, relative, sep } from "node:path";

// ../shared/validate.ts
function fail(path, msg) {
  throw new Error(`${path || "arguments"} ${msg}`);
}
var TYPE = {
  string: (v) => typeof v === "string",
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null
};
function check(schema, v, path = "") {
  if (Array.isArray(schema.anyOf)) {
    const errs = [];
    for (const sub of schema.anyOf) {
      try {
        check(sub, v, path);
        return;
      } catch (e) {
        errs.push(e.message);
      }
    }
    fail(path, `matches none of the allowed forms (${errs.join(" | ")})`);
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some((t) => TYPE[t]?.(v)))
    fail(path, `must be ${types.join(" or ")}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(v))
    fail(path, `must be one of: ${schema.enum.join(", ")}`);
  if (typeof v === "string") {
    if (typeof schema.minLength === "number" && v.length < schema.minLength)
      fail(path, `must be at least ${schema.minLength} character(s)`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(v))
      fail(path, `does not match required pattern ${schema.pattern}`);
  }
  if (typeof v === "number") {
    if (typeof schema.minimum === "number" && v < schema.minimum)
      fail(path, `must be >= ${schema.minimum}`);
    if (typeof schema.maximum === "number" && v > schema.maximum)
      fail(path, `must be <= ${schema.maximum}`);
  }
  if (Array.isArray(v)) {
    if (typeof schema.minItems === "number" && v.length < schema.minItems)
      fail(path, `needs at least ${schema.minItems} item(s)`);
    if (typeof schema.maxItems === "number" && v.length > schema.maxItems)
      fail(path, `allows at most ${schema.maxItems} item(s)`);
    if (schema.items)
      v.forEach((x, i) => check(schema.items, x, `${path}[${i}]`));
  }
  if (TYPE.object(v) && schema.properties) {
    const obj = v;
    for (const k of schema.required ?? [])
      if (obj[k] === undefined)
        fail(path, `is missing required field '${k}'`);
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (obj[k] !== undefined)
        check(sub, obj[k], path ? `${path}.${k}` : k);
    }
  }
}
function checkAndStrip(name, schema, value) {
  const v = value ?? {};
  try {
    check(schema, v);
  } catch (e) {
    throw new Error(`${name}: ${e.message}`);
  }
  const out = {};
  for (const k of Object.keys(schema.properties ?? {}))
    if (v[k] !== undefined)
      out[k] = v[k];
  return out;
}

// src/db.ts
import { mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// schema.sql
var schema_default = `PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Content-addressed: identical parsed text = one row, regardless of which corpus it came from.
-- documents.content is canonical; disk (corpora/ and parsed/) is cache. Citations verify against this table.
CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY,
  content       TEXT    NOT NULL,
  sha256        TEXT    NOT NULL UNIQUE,    -- sha256(content); dedup key; what citations verify against
  family        TEXT    NOT NULL,           -- folder-per-deal grouping hint (first-ingest path; per-doc by design)
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Corpus membership: the same document can belong to many corpora without duplicating content.
-- Path (uri) and MANIFEST provenance are per-membership — the same doc may appear at different
-- paths or with different attributions in different corpora.
CREATE TABLE IF NOT EXISTS corpus_documents (
  corpus      TEXT    NOT NULL,
  uri         TEXT    NOT NULL,             -- path relative to this corpus's root
  doc_id      INTEGER NOT NULL REFERENCES documents(id),
  -- sha256(source file bytes); keys the parsed/ cache and lets sync detect changes.
  -- Per-membership because the same parsed content can come from different source files.
  source_sha256 TEXT,
  -- Parse outcome for this membership's source file (NULL for direct .txt/.md/.html).
  parse_status TEXT CHECK (parse_status IN ('ok','empty','failed')),
  parsed_at    TEXT,
  publisher   TEXT,
  category    TEXT,
  dated       TEXT,
  source_url  TEXT,
  -- PK on (corpus, uri), not (corpus, doc_id): the same content can appear at two
  -- paths in one corpus (duplicate files), and both paths should be recorded.
  PRIMARY KEY (corpus, uri)
);
CREATE INDEX IF NOT EXISTS corpus_documents_doc ON corpus_documents(doc_id);
CREATE INDEX IF NOT EXISTS corpus_documents_corpus_doc ON corpus_documents(corpus, doc_id);

-- Convenience view: what most queries used to get from \`documents WHERE corpus=?\`.
DROP VIEW IF EXISTS v_corpus_documents;
CREATE VIEW v_corpus_documents AS
-- No raw content here: this view is the conductor's query surface, and one
-- SELECT * would otherwise drag the whole corpus into model context.
SELECT cd.corpus, d.id, cd.uri, d.sha256, cd.source_sha256,
       cd.parse_status, cd.parsed_at,
       cd.publisher, cd.category, cd.dated, cd.source_url, d.family, d.created_at,
       length(d.content) AS bytes, length(d.content) AS chars,
       (length(d.content) - length(replace(d.content, '=== [page ', ''))) / length('=== [page ') AS pages
FROM corpus_documents cd JOIN documents d ON d.id = cd.doc_id;

CREATE TABLE IF NOT EXISTS runs (
  run_id      TEXT    PRIMARY KEY,
  question    TEXT    NOT NULL,
  corpus      TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued','running','awaiting_human','awaiting_batch','done','failed')),
  round       INTEGER NOT NULL DEFAULT 0,
  session_id  TEXT,
  cost_usd    REAL    NOT NULL DEFAULT 0,
  turns       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS briefs (
  id            INTEGER PRIMARY KEY,
  run_id        TEXT    NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  rubric        TEXT    NOT NULL,
  assumptions   TEXT    NOT NULL,
  done_criteria TEXT    NOT NULL,
  scope_intent  TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, version)
);

CREATE TABLE IF NOT EXISTS scopes (
  id             INTEGER PRIMARY KEY,
  run_id         TEXT    NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  brief_id       INTEGER NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  predicate      TEXT    NOT NULL,
  terms          TEXT    NOT NULL,
  cap            INTEGER,
  excluded_count INTEGER NOT NULL DEFAULT 0,
  rationale      TEXT    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scope_documents (
  scope_id INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  doc_id   INTEGER NOT NULL REFERENCES documents(id),
  rank     INTEGER NOT NULL,
  PRIMARY KEY (scope_id, doc_id)
);

-- Read-receipts so "nothing relevant" is distinguishable from "worker crashed".
CREATE TABLE IF NOT EXISTS shard_coverage (
  scope_id   INTEGER NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  doc_id     INTEGER NOT NULL REFERENCES documents(id),
  worker     TEXT    NOT NULL,
  status     TEXT    NOT NULL CHECK (status IN ('read','error')),
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (scope_id, doc_id, worker)
);

CREATE TABLE IF NOT EXISTS audits (
  id        INTEGER PRIMARY KEY,
  -- run_id is NULL for kind='preprocess' (ingest runs before a run exists).
  run_id    TEXT    REFERENCES runs(run_id) ON DELETE CASCADE,
  corpus    TEXT,
  kind      TEXT    NOT NULL CHECK (kind IN ('mechanical','semantic_sample','recall_sample','citation_judge','preprocess')),
  sample_n  INTEGER NOT NULL DEFAULT 0,
  result    TEXT    NOT NULL,
  -- A citation_judge verdict is about ONE span of ONE document. Recording which
  -- is what stops a verdict on some other passage from authorizing this quote.
  doc_id    INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  start_off INTEGER,
  end_off   INTEGER,
  created_at TEXT   NOT NULL DEFAULT (datetime('now')),
  CHECK ((kind = 'preprocess' AND corpus IS NOT NULL) OR (kind != 'preprocess' AND run_id IS NOT NULL)),
  CHECK (kind != 'citation_judge' OR (doc_id IS NOT NULL AND start_off IS NOT NULL AND end_off IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS citations (
  id                 INTEGER PRIMARY KEY,
  doc_id             INTEGER NOT NULL REFERENCES documents(id),
  -- SET NULL so citations backing ratified knowledge survive run drops.
  brief_id           INTEGER REFERENCES briefs(id) ON DELETE SET NULL,
  kind               TEXT    NOT NULL CHECK (kind IN ('exact','judged')),
  quote              TEXT    NOT NULL CHECK (length(quote) > 0),
  start_off          INTEGER NOT NULL CHECK (start_off >= 0),
  end_off            INTEGER NOT NULL CHECK (end_off > start_off),
  doc_sha256         TEXT    NOT NULL,
  judgement_audit_id INTEGER REFERENCES audits(id) ON DELETE SET NULL,
  created_by         TEXT    NOT NULL,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS citations_doc ON citations(doc_id);

-- An unverifiable citation cannot exist.
DROP TRIGGER IF EXISTS citations_verify;
CREATE TRIGGER citations_verify BEFORE INSERT ON citations
BEGIN
  SELECT CASE
    WHEN (SELECT sha256 FROM documents WHERE id = NEW.doc_id) IS NULL
      THEN RAISE(ABORT, 'cite: unknown doc_id')
    WHEN (SELECT sha256 FROM documents WHERE id = NEW.doc_id) != NEW.doc_sha256
      THEN RAISE(ABORT, 'cite: doc_sha256 stale (document content changed since read)')
    WHEN NEW.end_off > length((SELECT content FROM documents WHERE id = NEW.doc_id))
      THEN RAISE(ABORT, 'cite: end_off beyond document length')
    WHEN NEW.kind = 'exact'
     AND substr((SELECT content FROM documents WHERE id = NEW.doc_id),
                NEW.start_off + 1, NEW.end_off - NEW.start_off) != NEW.quote
      THEN RAISE(ABORT, 'cite: exact quote does not match documents.content at [start_off,end_off)')
    WHEN NEW.kind = 'judged' AND NEW.judgement_audit_id IS NULL
      THEN RAISE(ABORT, 'cite: judged kind requires judgement_audit_id (model verdict)')
    -- A judged citation is only as good as the verdict behind it, and a verdict
    -- is about one span of one document. Without this, any citation_judge row
    -- authorizes any quote on any document — which is the whole promise, gone.
    WHEN NEW.kind = 'judged' AND NOT EXISTS (
      SELECT 1 FROM audits a
       WHERE a.id = NEW.judgement_audit_id
         AND a.kind = 'citation_judge'
         AND a.doc_id = NEW.doc_id
         AND a.start_off = NEW.start_off
         AND a.end_off = NEW.end_off)
      THEN RAISE(ABORT, 'cite: judged citation must reference a citation_judge audit of the SAME document and span')
  END;
END;

-- Write-once; column-scoped so FK SET NULL on judgement_audit_id doesn't abort.
DROP TRIGGER IF EXISTS citations_no_update;
CREATE TRIGGER citations_no_update
BEFORE UPDATE OF doc_id, kind, quote, start_off, end_off, doc_sha256, created_by ON citations
BEGIN SELECT RAISE(ABORT, 'citations are immutable'); END;

CREATE TABLE IF NOT EXISTS findings (
  id        INTEGER PRIMARY KEY,
  run_id    TEXT    NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  brief_id  INTEGER NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  round     INTEGER NOT NULL,
  worker    TEXT    NOT NULL,
  kind      TEXT    NOT NULL CHECK (kind IN ('finding','unknown')),
  claim     TEXT    NOT NULL,
  created_at TEXT   NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS finding_citations (
  finding_id  INTEGER NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  citation_id INTEGER NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
  PRIMARY KEY (finding_id, citation_id)
);

CREATE TABLE IF NOT EXISTS queue_items (
  id          INTEGER PRIMARY KEY,
  run_id      TEXT    NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  brief_id    INTEGER NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  round       INTEGER NOT NULL,
  question    TEXT    NOT NULL,
  context     TEXT    NOT NULL DEFAULT '',
  blocking    INTEGER NOT NULL DEFAULT 0 CHECK (blocking IN (0,1)),
  status      TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','self_resolved')),
  answer      TEXT,
  answered_by TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT
);
CREATE TABLE IF NOT EXISTS queue_citations (
  queue_item_id INTEGER NOT NULL REFERENCES queue_items(id) ON DELETE CASCADE,
  citation_id   INTEGER NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
  PRIMARY KEY (queue_item_id, citation_id)
);

DROP TRIGGER IF EXISTS queue_self_resolved_upd;
CREATE TRIGGER queue_self_resolved_upd BEFORE UPDATE OF status ON queue_items
WHEN NEW.status = 'self_resolved' AND NEW.answered_by IS NULL
BEGIN
  SELECT RAISE(ABORT, 'queue: self_resolved requires answered_by (set to ''agent'')');
END;
DROP TRIGGER IF EXISTS queue_self_resolved_ins;
CREATE TRIGGER queue_self_resolved_ins BEFORE INSERT ON queue_items
WHEN NEW.status = 'self_resolved' AND NEW.answered_by IS NULL
BEGIN
  SELECT RAISE(ABORT, 'queue: self_resolved requires answered_by (set to ''agent'')');
END;

CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY,
  run_id     TEXT    NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  brief_id   INTEGER NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS report_claims (
  id        INTEGER PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  claim     TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS claim_citations (
  claim_id    INTEGER NOT NULL REFERENCES report_claims(id) ON DELETE CASCADE,
  citation_id INTEGER NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
  PRIMARY KEY (claim_id, citation_id)
);

CREATE TABLE IF NOT EXISTS knowledge (
  id                   INTEGER PRIMARY KEY,
  corpus               TEXT    NOT NULL,
  fact                 TEXT    NOT NULL,
  status               TEXT    NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','ratified','rejected')),
  ratified_by          TEXT,
  source_run_id        TEXT    REFERENCES runs(run_id) ON DELETE SET NULL,
  source_queue_item_id INTEGER REFERENCES queue_items(id) ON DELETE SET NULL,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS knowledge_citations (
  knowledge_id INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
  citation_id  INTEGER NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
  PRIMARY KEY (knowledge_id, citation_id)
);

DROP TRIGGER IF EXISTS knowledge_ratify_guard;
CREATE TRIGGER knowledge_ratify_guard BEFORE UPDATE OF status ON knowledge
WHEN NEW.status = 'ratified' AND (NEW.ratified_by IS NULL OR trim(NEW.ratified_by) = '')
BEGIN
  SELECT RAISE(ABORT, 'knowledge: ratified requires ratified_by (a human identifier)');
END;

CREATE TABLE IF NOT EXISTS run_events (
  id        INTEGER PRIMARY KEY,
  run_id    TEXT    NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  from_status TEXT  NOT NULL,
  to_status   TEXT  NOT NULL,
  at          TEXT  NOT NULL DEFAULT (datetime('now'))
);
DROP TRIGGER IF EXISTS runs_log_status;
CREATE TRIGGER runs_log_status AFTER UPDATE OF status ON runs
WHEN OLD.status != NEW.status
BEGIN
  INSERT INTO run_events(run_id, from_status, to_status) VALUES (NEW.run_id, OLD.status, NEW.status);
  UPDATE runs SET updated_at = datetime('now') WHERE run_id = NEW.run_id;
END;

DROP VIEW IF EXISTS v_run_status;
CREATE VIEW v_run_status AS
SELECT r.run_id, r.status, r.round, r.question, r.corpus, r.session_id, r.cost_usd, r.turns, r.updated_at,
       (SELECT id FROM briefs b WHERE b.run_id = r.run_id AND b.status='active'
        ORDER BY version DESC LIMIT 1) AS brief_id,
       (SELECT count(*) FROM corpus_documents cd WHERE cd.corpus = r.corpus) AS docs,
       (SELECT count(*) FROM findings f WHERE f.run_id = r.run_id) AS findings,
       (SELECT count(*) FROM queue_items q WHERE q.run_id = r.run_id AND q.status='open') AS open_queue,
       (SELECT count(*) FROM queue_items q WHERE q.run_id = r.run_id AND q.status='open' AND q.blocking=1) AS blocking_queue,
       (SELECT count(*) FROM reports p WHERE p.run_id = r.run_id) AS reports,
       (SELECT count(*) FROM v_uncited_claims uc WHERE uc.run_id = r.run_id) AS uncited_claims,
       (SELECT count(*) FROM v_uncited_findings uf WHERE uf.run_id = r.run_id) AS uncited_findings
FROM runs r;

DROP VIEW IF EXISTS v_uncited_claims;
CREATE VIEW v_uncited_claims AS
SELECT rc.id AS claim_id, rc.report_id, r.run_id, rc.claim
FROM report_claims rc JOIN reports r ON r.id = rc.report_id
WHERE NOT EXISTS (SELECT 1 FROM claim_citations cc WHERE cc.claim_id = rc.id);

DROP VIEW IF EXISTS v_uncited_findings;
CREATE VIEW v_uncited_findings AS
SELECT f.id AS finding_id, f.run_id, f.worker, f.kind, f.claim
FROM findings f
WHERE NOT EXISTS (SELECT 1 FROM finding_citations fc WHERE fc.finding_id = f.id);

-- Computed (never agent-supplied) so recall_sample can't be skipped by omission.
DROP VIEW IF EXISTS v_scope_excluded;
CREATE VIEW v_scope_excluded AS
SELECT s.id AS scope_id, s.run_id,
       (SELECT count(*) FROM corpus_documents cd WHERE cd.corpus = r.corpus)
       - (SELECT count(*) FROM scope_documents sd WHERE sd.scope_id = s.id) AS excluded
FROM scopes s JOIN runs r ON r.run_id = s.run_id;

DROP VIEW IF EXISTS v_coverage_gaps;
CREATE VIEW v_coverage_gaps AS
SELECT s.run_id, sd.scope_id, sd.doc_id, cd.uri
FROM scope_documents sd
JOIN scopes s ON s.id = sd.scope_id
JOIN runs r ON r.run_id = s.run_id
JOIN corpus_documents cd ON cd.doc_id = sd.doc_id AND cd.corpus = r.corpus
WHERE NOT EXISTS (
  SELECT 1 FROM shard_coverage sc
  WHERE sc.scope_id = sd.scope_id AND sc.doc_id = sd.doc_id AND sc.status = 'read'
);

-- Uncited claims/findings are surfaced, not enforced — a hard gate would wedge on uncitable synthesis.

-- Registered corpus roots: the only place a filesystem path enters the system.
-- corpus_register canonicalizes and validates the directory before writing here;
-- every other operation resolves paths through this table.
CREATE TABLE IF NOT EXISTS corpora (
  name       TEXT PRIMARY KEY,
  root       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- queue_items.answered_at was always NULL: nothing set it, so human latency was
-- only recoverable by joining run_events. Stamp it where it can't be forgotten.
DROP TRIGGER IF EXISTS queue_answered_stamp;
CREATE TRIGGER queue_answered_stamp
AFTER UPDATE OF status ON queue_items
WHEN NEW.status = 'answered' AND NEW.answered_at IS NULL
BEGIN
  UPDATE queue_items SET answered_at = datetime('now') WHERE id = NEW.id;
END;

-- Bump on any breaking change; db.ts checks this against SCHEMA_VERSION and fails
-- with a clear "delete <DATA> and re-ingest" message rather than a cryptic SQL error.
PRAGMA user_version = 4;
`;

// src/db.ts
var DATA_ROOT = process.env.CLAUDE_HEALTHCARE_DATA ?? join(process.env.HOME ?? ".", ".claude", "data", "healthcare");
var LEGACY_DATA = join(DATA_ROOT, "contracts");
var DATA = join(DATA_ROOT, "documents");
if (existsSync(LEGACY_DATA) && !existsSync(DATA))
  renameSync(LEGACY_DATA, DATA);
var DB_PATH = join(DATA, "data.sqlite");
var PARSED = join(DATA, "parsed");
var RUN_ID_RE = /^(?!.*\.\.)[A-Za-z0-9_.:-]{1,64}$/;
var NAME_RE = /^(?!.*\.\.)[A-Za-z0-9_.-]{1,64}$/;
var SCHEMA_VERSION = 4;
mkdirSync(DATA, { recursive: true, mode: 448 });
var { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
var db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA busy_timeout = 30000");
var ADDITIVE_COLUMNS = [
  ["audits", "doc_id", "INTEGER REFERENCES documents(id) ON DELETE CASCADE"],
  ["audits", "start_off", "INTEGER"],
  ["audits", "end_off", "INTEGER"]
];
{
  const version = db.prepare("PRAGMA user_version").get().user_version;
  const hasTables = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents'").get();
  const isFresh = version === 0 && !hasTables;
  if (isFresh || version === SCHEMA_VERSION) {
    db.exec(schema_default);
    for (const [table, col, decl] of ADDITIVE_COLUMNS) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!cols.some((c) => c.name === col))
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
    }
  } else {
    const msg = `schema version ${version} != ${SCHEMA_VERSION} — the database at ${DB_PATH} is from an older alpha. ` + `Delete ${DB_PATH} (the parsed/ cache can stay) and re-ingest.`;
    process.stderr.write(`mcp-server-documents: ${msg}
`);
    throw new Error(msg);
  }
}
function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  }
}
var setSchemas = {
  runs: { pk: "run_id", cols: ["status", "round", "session_id"] },
  briefs: { pk: "id", cols: ["status"] },
  queue_items: { pk: "id", cols: ["status", "answer", "answered_by", "answered_at"] },
  knowledge: { pk: "id", cols: ["status", "ratified_by"] }
};
var str = { type: "string" };
var int = { type: "integer" };
var nstr = { type: ["string", "null"] };
var nint = { type: ["integer", "null"] };
var row = (required, properties) => ({ type: "object", required, properties });
var writeSchemas = {
  runs: row(["run_id", "question", "corpus"], {
    run_id: { type: "string", pattern: RUN_ID_RE.source },
    question: str,
    corpus: str,
    status: str,
    round: int,
    session_id: nstr
  }),
  briefs: row(["run_id", "version", "rubric", "assumptions", "done_criteria", "scope_intent"], {
    run_id: str,
    version: int,
    rubric: str,
    assumptions: str,
    done_criteria: str,
    scope_intent: str,
    status: str
  }),
  scopes: row(["run_id", "brief_id", "predicate", "terms", "rationale"], {
    run_id: str,
    brief_id: int,
    predicate: str,
    terms: str,
    cap: nint,
    excluded_count: int,
    rationale: str
  }),
  shard_coverage: row(["scope_id", "doc_id", "worker", "status"], {
    scope_id: int,
    doc_id: int,
    worker: str,
    status: { type: "string", enum: ["read", "error"] },
    note: nstr
  }),
  scope_documents: row(["scope_id", "doc_id", "rank"], { scope_id: int, doc_id: int, rank: int }),
  findings: row(["run_id", "brief_id", "round", "worker", "kind", "claim"], {
    run_id: str,
    brief_id: int,
    round: int,
    worker: str,
    kind: { type: "string", enum: ["finding", "unknown"] },
    claim: str
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
    answered_at: nstr
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
    source_queue_item_id: nint
  }),
  knowledge_citations: row(["knowledge_id", "citation_id"], { knowledge_id: int, citation_id: int }),
  audits: row(["kind", "result"], {
    doc_id: int,
    start_off: int,
    end_off: int,
    run_id: nstr,
    corpus: nstr,
    kind: { type: "string", enum: ["mechanical", "semantic_sample", "recall_sample", "citation_judge", "preprocess"] },
    sample_n: int,
    result: str
  })
};

// src/extract.ts
import { spawnSync } from "node:child_process";
var MAX_BUFFER = 256 * 1024 * 1024;
var pageMarker = (page, text) => `

=== [page ${page}] ===

${text}`;
function resolveLit() {
  const candidates = [process.env.LITEPARSE_PATH, "lit"].filter((p) => !!p);
  return candidates.find((p) => spawnSync(p, ["--version"], { stdio: "ignore" }).status === 0);
}
function extractWithLiteparse(lit, src) {
  for (const extra of [[], ["--no-ocr"]]) {
    const r = spawnSync(lit, ["parse", src, "--format", "json", "--max-pages", "2000", ...extra], {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER
    });
    if (r.status !== 0 || !r.stdout.trim())
      continue;
    try {
      const pages = JSON.parse(r.stdout).pages ?? [];
      const text = pages.map((p) => pageMarker(p.page, p.text)).join("");
      if (text.trim())
        return { text, method: "liteparse" };
    } catch {}
  }
  return null;
}
function extractWithPdftotext(src) {
  const r = spawnSync("pdftotext", ["-layout", src, "-"], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER
  });
  if (r.status !== 0)
    return null;
  const text = r.stdout.split("\f").map((page, i) => pageMarker(i + 1, page)).join("");
  return { text, method: "pdftotext" };
}
function extractWithMethod(lit, src, isPdf = /\.pdf$/i.test(src)) {
  if (lit) {
    const extracted = extractWithLiteparse(lit, src);
    if (extracted)
      return extracted;
  }
  return isPdf ? extractWithPdftotext(src) : null;
}
function extract(lit, src) {
  return extractWithMethod(lit, src)?.text ?? null;
}

// src/engine.ts
function die(msg) {
  throw new Error(msg);
}
function corpusRegister(name, dir) {
  if (!NAME_RE.test(name))
    die(`corpus_register: invalid corpus name '${name}'`);
  let root;
  try {
    root = realpathSync(dir);
  } catch {
    die(`corpus_register: ${dir} not found`);
  }
  if (!statSync(root).isDirectory())
    die(`corpus_register: ${root} is not a directory`);
  db.prepare(`INSERT INTO corpora (name, root) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET root = excluded.root`).run(name, root);
  const files = scanCorpus(root);
  return {
    corpus: name,
    root,
    sources: files.filter((f) => f.kind === "source").length,
    text_files: files.filter((f) => f.kind === "text").length
  };
}
function corpusRoot(name) {
  const row2 = db.prepare(`SELECT root FROM corpora WHERE name = ?`).get(name);
  if (!row2)
    die(`unknown corpus '${name}' — call corpus_register first`);
  if (!existsSync2(row2.root))
    die(`corpus '${name}' root ${row2.root} no longer exists — re-register`);
  return row2.root;
}
function spanSupportsQuote(spanText, quote) {
  const tokens = quote.toLowerCase().match(/[a-z0-9%$]+/g) ?? [];
  if (!tokens.length)
    return false;
  const hay = spanText.toLowerCase();
  let at = 0;
  for (const tok of tokens) {
    const found = hay.indexOf(tok, at);
    if (found === -1)
      return false;
    at = found + tok.length;
  }
  return true;
}
function nearestIndex(haystack, needle, near) {
  if (near === undefined) {
    const first = haystack.indexOf(needle);
    if (first !== -1 && haystack.indexOf(needle, first + 1) !== -1)
      return -2;
    return first;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = haystack.indexOf(needle);i >= 0; i = haystack.indexOf(needle, i + 1)) {
    const d = Math.abs(i - near);
    if (d < bestD) {
      best = i;
      bestD = d;
    } else if (best >= 0)
      break;
  }
  return best;
}
function normalizeWithMap(s) {
  const norm = [];
  const map = [];
  let lastWasSpace = false;
  for (let i = 0;i < s.length; i++) {
    let c = s[i];
    if (c === "*")
      continue;
    if (/\s| /.test(c)) {
      if (lastWasSpace)
        continue;
      c = " ";
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      if (c === "‘" || c === "’")
        c = "'";
      else if (c === "“" || c === "”")
        c = '"';
      else if (c === "–" || c === "—")
        c = "-";
    }
    norm.push(c);
    map.push(i);
  }
  return { norm: norm.join(""), map };
}
function lowerBound(sorted, target) {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (sorted[mid] < target)
      lo = mid + 1;
    else
      hi = mid;
  }
  return lo;
}
function locate(content, quote, near, contentNorm) {
  const at = nearestIndex(content, quote, near);
  if (at === -2)
    die(`cite: quote appears more than once in this document — pass 'near' (an approximate offset) so the right occurrence is cited`);
  if (at >= 0)
    return [at, at + quote.length];
  const h = contentNorm ?? normalizeWithMap(content);
  const { norm: nq } = normalizeWithMap(quote.trim());
  if (!nq)
    return null;
  const nearN = near === undefined ? undefined : lowerBound(h.map, near);
  const atN = nearestIndex(h.norm, nq, nearN);
  if (atN < 0)
    return null;
  const s = h.map[atN];
  const endN = atN + nq.length - 1;
  const e = h.map[endN] + 1;
  return [s, e];
}
var asSpan = (s) => s ? [s[0], s[1]] : undefined;
function dieQuoteNotFound(content, nearOff) {
  const hint = nearOff !== undefined ? ` Content near offset ${nearOff}: «${content.slice(Math.max(0, nearOff - 150), nearOff + 150).replace(/\s+/g, " ")}»` : "";
  die(`cite: quote not found, even after whitespace/quote normalization. For non-contiguous content (tables, reflow): write an audits row (kind='citation_judge') attesting the values are present, then retry with the span and audit id.${hint}`);
}
var docCache = null;
function loadDoc(docId) {
  if (docCache && docCache.docId === docId)
    return docCache;
  const doc = db.prepare(`SELECT content, sha256 FROM documents WHERE id = ?`).get(docId);
  if (!doc)
    die(`cite: unknown doc_id ${docId}`);
  const surrogates = [];
  for (let i = 0;i < doc.content.length; i++) {
    const c = doc.content.charCodeAt(i);
    if (c >= 55296 && c <= 56319)
      surrogates.push(i);
  }
  docCache = { docId, sha256: doc.sha256, content: doc.content, surrogates };
  return docCache;
}
function normOf(doc) {
  return doc.norm ??= normalizeWithMap(doc.content);
}
function toCodePoints(doc, utf16) {
  const a = doc.surrogates;
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (a[mid] < utf16)
      lo = mid + 1;
    else
      hi = mid;
  }
  return utf16 - lo;
}
function mintCitation(docId, briefId, by, quote, opts) {
  const doc = loadDoc(docId);
  const ins = (kind, q, s, e, j) => db.prepare(`INSERT INTO citations (doc_id,brief_id,kind,quote,start_off,end_off,doc_sha256,judgement_audit_id,created_by)
         VALUES ($d,$b,$k,$q,$s,$e,$h,$j,$by) RETURNING id, kind, start_off, end_off`).get({
    d: docId,
    b: briefId,
    k: kind,
    q,
    s: toCodePoints(doc, s),
    e: toCodePoints(doc, e),
    h: doc.sha256,
    j,
    by
  });
  const nearOff = opts.near ?? opts.span?.[0];
  const span = locate(doc.content, quote, nearOff, normOf(doc));
  if (span)
    return ins("exact", doc.content.slice(span[0], span[1]), span[0], span[1], null);
  if (opts.span && opts.audit) {
    const [s, e] = opts.span;
    if (e - s > 4000)
      die(`cite: span is ${e - s} chars; cap is 4000. Narrow to the passage.`);
    const a = db.prepare(`SELECT id, doc_id, start_off, end_off FROM audits WHERE id=? AND kind='citation_judge'`).get(opts.audit);
    if (!a)
      die(`cite: audit ${opts.audit} not found or not kind=citation_judge`);
    if (a.doc_id !== docId || toCodePoints(doc, s) !== a.start_off || toCodePoints(doc, e) !== a.end_off)
      die(`cite: audit ${opts.audit} judged doc ${a.doc_id} [${a.start_off},${a.end_off}) — ` + `not this document and span. Write an audit for the span you actually read.`);
    if (!spanSupportsQuote(doc.content.slice(s, e), quote))
      die(`cite: the judged span doesn't contain the words of this quote — you cannot cite what isn't there`);
    return ins("judged", quote, s, e, opts.audit);
  }
  dieQuoteNotFound(doc.content, nearOff);
}
function cite(docId, briefId, by, quote, opts) {
  return mintCitation(docId, briefId, by, quote, opts);
}
function citeMany(briefId, by, rows) {
  const minted = [];
  const rejected = [];
  rows.forEach((r, index) => {
    try {
      const c = mintCitation(r.doc_id, briefId, by, r.quote, {
        near: r.near,
        span: asSpan(r.span),
        audit: r.audit
      });
      minted.push({ index, ...c });
    } catch (e) {
      rejected.push({ index, doc_id: r.doc_id, error: String(e.message ?? e) });
    }
  });
  return { minted, rejected };
}
var spanSchema = { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 };
var findRowSchema = {
  type: "object",
  required: ["kind", "claim", "doc_id", "quote"],
  properties: {
    kind: { type: "string", enum: ["finding", "unknown"] },
    claim: { type: "string" },
    doc_id: { type: "integer" },
    quote: { type: "string", minLength: 1 },
    near: { type: "integer" },
    span: spanSchema,
    audit: { type: "integer" }
  }
};
var findSchema = {
  type: "object",
  required: ["run_id", "brief_id", "round", "worker", "kind", "claim", "doc_id", "quote"],
  properties: {
    run_id: { type: "string" },
    brief_id: { type: "integer" },
    round: { type: "integer" },
    worker: { type: "string" },
    ...findRowSchema.properties
  }
};
var checkFind = (v) => checkAndStrip("find", findSchema, v);
var checkFindRow = (v) => checkAndStrip("find row", findRowSchema, v);
function findCore(m) {
  const c = mintCitation(m.doc_id, m.brief_id, m.worker, m.quote, {
    near: m.near,
    span: asSpan(m.span),
    audit: m.audit
  });
  const f = db.prepare(`INSERT INTO findings (run_id,brief_id,round,worker,kind,claim) VALUES (?,?,?,?,?,?) RETURNING id`).get(m.run_id, m.brief_id, m.round, m.worker, m.kind, m.claim);
  db.prepare(`INSERT INTO finding_citations (finding_id,citation_id) VALUES (?,?)`).run(f.id, c.id);
  return { citation_id: c.id, finding_id: f.id, kind: c.kind, start_off: c.start_off };
}
function find(m) {
  return tx(() => findCore(m));
}
function findMany(ctx, rows) {
  if (!rows.length)
    die(`find: rows is empty`);
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
function coverage(m, rows) {
  if (m === undefined === (rows === undefined))
    die(`coverage: pass exactly one of row fields or rows`);
  const all = m ? [m] : rows ?? [];
  if (!all.length)
    die(`coverage: rows is empty`);
  const stmt = db.prepare(`INSERT INTO shard_coverage (scope_id, doc_id, worker, status, note) VALUES (?,?,?,?,?)
     ON CONFLICT(scope_id, doc_id, worker) DO UPDATE SET status = excluded.status, note = excluded.note`);
  return tx(() => {
    for (const r of all)
      stmt.run(r.scope_id, r.doc_id, r.worker, r.status, r.note ?? null);
    return { ok: true, stamped: all.length };
  });
}
function schema() {
  return db.prepare(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name`).all();
}
function sql(query) {
  const stmt = db.prepare(query.trim());
  const banned = stmt.columns().find((c) => c.column === "content" || c.name === "content");
  if (banned)
    die(`sql: this query returns the 'content' column — full document text through a tool result ` + `blows up the context. SELECT other columns, or use doc_search / doc_text / dump.`);
  if (stmt.columns().length === 0) {
    const r = stmt.run();
    return { changes: Number(r.changes), last_insert_rowid: Number(r.lastInsertRowid) };
  }
  return stmt.all();
}
function sqlMany(queries) {
  if (!queries.length)
    die(`sql: queries is empty`);
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
  if (!ws)
    die(`write: unknown table '${table}' (allow: ${Object.keys(writeSchemas).join(", ")})`);
  const row2 = checkAndStrip(`write ${table}`, ws, rowJson);
  const cols = Object.keys(row2).filter((k) => row2[k] !== undefined);
  return db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => `$${c}`).join(",")}) RETURNING rowid AS id, *`).get(Object.fromEntries(cols.map((c) => [c, row2[c] ?? null])));
}
function write(table, rowJson, rowsJson) {
  if (rowJson === undefined === (rowsJson === undefined))
    die(`write: pass exactly one of row or rows`);
  if (rowJson !== undefined)
    return insertRow(table, rowJson);
  const rows = rowsJson ?? [];
  if (!rows.length)
    die(`write: rows is empty`);
  if (rows.length > 1000)
    die(`write: ${rows.length} rows; cap is 1000`);
  return tx(() => ({
    inserted: rows.length,
    ids: rows.map((r) => insertRow(table, r).id)
  }));
}
function set(table, id, col, val) {
  const t = setSchemas[table];
  if (!t?.cols?.includes(col))
    die(`set: ${table}.${col} not in allowlist`);
  const r = db.prepare(`UPDATE ${table} SET ${col} = $v WHERE ${t.pk} = $id RETURNING *`).get({ v: val, id: t.pk === "id" ? Number(id) : id });
  if (!r)
    die(`set: no ${table} row ${id}`);
  return r;
}
function setMany(updates) {
  if (!updates.length)
    die(`set: updates is empty`);
  return tx(() => ({ updated: updates.map((u) => set(u.table, u.id, u.col, u.value)) }));
}
function assertRunId(op, id) {
  if (!RUN_ID_RE.test(id) || id === ".")
    die(`${op}: invalid run_id '${id}'`);
}
function drop(runIds, prefix) {
  const ids = prefix ? db.prepare(`SELECT run_id FROM runs WHERE run_id GLOB ? || '*'`).all(prefix).map((r) => r.run_id) : runIds;
  if (!ids.length)
    die("drop: nothing matched");
  for (const id of ids)
    assertRunId("drop", id);
  const del = db.prepare(`DELETE FROM runs WHERE run_id = ?`);
  const orphans = tx(() => {
    ids.forEach((id) => del.run(id));
    const citations = db.prepare(`DELETE FROM citations WHERE brief_id IS NULL
             AND id NOT IN (SELECT citation_id FROM finding_citations)
             AND id NOT IN (SELECT citation_id FROM queue_citations)
             AND id NOT IN (SELECT citation_id FROM claim_citations)
             AND id NOT IN (SELECT citation_id FROM knowledge_citations)
           RETURNING id`).all().length;
    const documents = db.prepare(`DELETE FROM documents WHERE id NOT IN (SELECT doc_id FROM corpus_documents)
             AND id NOT IN (SELECT doc_id FROM citations) RETURNING id`).all().length;
    return { citations, documents };
  });
  for (const id of ids)
    rmSync(join2(DATA, "shards", id), { recursive: true, force: true });
  return { dropped: ids, ...orphans.citations || orphans.documents ? { swept: orphans } : {} };
}
function docSearch(corpus, pattern, opts = {}) {
  if (!NAME_RE.test(corpus))
    die(`doc_search: invalid corpus '${corpus}'`);
  if (!pattern.trim())
    die(`doc_search: pattern is empty`);
  const maxDocs = Math.min(Math.max(1, opts.max_docs ?? 50), 200);
  const maxPer = Math.min(Math.max(1, opts.max_per_doc ?? 5), 20);
  const fold = opts.ignore_case ?? true;
  const escaped = pattern.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = db.prepare(`SELECT d.id, d.content, cd.uri FROM documents d
       JOIN corpus_documents cd ON cd.doc_id = d.id
       WHERE cd.corpus = $corpus
         AND ${fold ? `d.content LIKE '%' || $like || '%' ESCAPE '\\'` : `instr(d.content, $raw) > 0`}
       ORDER BY d.id LIMIT $lim`).all({
    corpus,
    [fold ? "like" : "raw"]: fold ? escaped : pattern,
    lim: maxDocs + 1
  });
  const truncated = rows.length > maxDocs;
  let snippetBudget = 20000;
  const needle = fold ? pattern.toLowerCase() : pattern;
  const hits = rows.slice(0, maxDocs).map((r) => {
    const hay = fold ? r.content.toLowerCase() : r.content;
    const matches = [];
    let total = 0;
    for (let at = hay.indexOf(needle);at !== -1; at = hay.indexOf(needle, at + needle.length)) {
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
  const searched = db.prepare(`SELECT count(*) AS n FROM corpus_documents WHERE corpus = ?`).get(corpus);
  if (!searched.n)
    die(`doc_search: corpus '${corpus}' has no documents`);
  return {
    corpus,
    pattern,
    docs_searched: searched.n,
    docs_matched: hits.length,
    truncated,
    ...snippetBudget <= 0 ? { snippets_truncated: true } : {},
    hits
  };
}
function docText(docId, offset = 0, limit = 40000) {
  if (!Number.isInteger(docId))
    die(`doc_text: doc_id must be an integer`);
  if (!Number.isInteger(offset) || offset < 0)
    die(`doc_text: bad offset`);
  const take = Math.min(Math.max(1, limit), 60000);
  const doc = db.prepare(`SELECT d.id, d.content, cd.uri, d.family
       FROM documents d JOIN corpus_documents cd ON cd.doc_id = d.id
       WHERE d.id = ? LIMIT 1`).get(docId);
  if (!doc)
    die(`doc_text: unknown doc_id ${docId}`);
  const total = doc.content.length;
  if (offset >= total && total > 0)
    die(`doc_text: offset ${offset} past end (${total})`);
  const text = doc.content.slice(offset, offset + take);
  const next = offset + text.length;
  return {
    doc_id: doc.id,
    uri: doc.uri,
    family: doc.family,
    offset,
    chars: text.length,
    total_chars: total,
    next_offset: next < total ? next : null,
    text
  };
}
function docTextMany(docs, limit = 40000) {
  if (!docs.length)
    die(`doc_text: docs is empty`);
  let budget = Math.min(Math.max(1, limit), 60000);
  const out = docs.map((d) => {
    const offset = d.offset ?? 0;
    if (budget <= 0)
      return {
        doc_id: d.doc_id,
        offset,
        chars: 0,
        next_offset: offset,
        text: "",
        budget_exhausted: true
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
function dumpShard(runId, label, ids) {
  assertRunId("dump", runId);
  if (!NAME_RE.test(label))
    die(`dump: invalid label '${label}'`);
  if (!db.prepare(`SELECT 1 FROM runs WHERE run_id = ?`).get(runId))
    die(`dump: unknown run_id '${runId}'`);
  const dir = join2(DATA, "shards", runId, label);
  mkdirSync2(dir, { recursive: true, mode: 448 });
  const q = db.prepare(`SELECT d.id, d.content, cd.uri, d.family
     FROM documents d JOIN corpus_documents cd ON cd.doc_id = d.id
     WHERE d.id = ? AND cd.corpus = (SELECT corpus FROM runs WHERE run_id = ?)`);
  const written = [];
  const missing = [];
  for (const id of ids) {
    const doc = q.get(id, runId);
    if (!doc) {
      missing.push(id);
      continue;
    }
    const path = join2(dir, `doc${id}.txt`);
    writeFileSync(path, doc.content, { mode: 384 });
    written.push({ doc_id: id, path, chars: doc.content.length, uri: doc.uri, family: doc.family });
  }
  return { written, ...missing.length ? { missing } : {} };
}
var PREPROCESS_EXTS = ["pdf", "docx", "xlsx", "pptx"];
var PREPROCESS_EXT = new RegExp(`\\.(${PREPROCESS_EXTS.join("|")})$`, "i");
var DIRECT_TEXT_EXT = /\.(txt|md|html?)$/i;
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}
function parsedPath(srcSha) {
  return join2(PARSED, srcSha.slice(0, 2), `${srcSha}.txt`);
}
function cachedStatus(path) {
  const head = readFileSync(path, "utf8").slice(0, 60);
  if (head.startsWith("[no text extracted") || head.startsWith("[image-only"))
    return "empty";
  if (head.startsWith("[extraction failed"))
    return "failed";
  return "ok";
}
function scanCorpus(dir) {
  const all = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join2(d, e.name);
      if (e.isDirectory())
        walk(p);
      else if (e.name !== "MANIFEST.jsonl")
        all.push({ path: p, rel: relative(dir, p), name: e.name });
    }
  };
  walk(dir);
  const textStems = new Set(all.filter((f) => DIRECT_TEXT_EXT.test(f.name)).map((f) => f.rel.replace(DIRECT_TEXT_EXT, "")));
  const out = [];
  for (const f of all) {
    if (PREPROCESS_EXT.test(f.name)) {
      const override = textStems.has(f.rel.replace(PREPROCESS_EXT, ""));
      out.push({
        path: f.path,
        rel: f.rel,
        kind: "source",
        srcSha: sha256(readFileSync(f.path)),
        override
      });
    } else if (DIRECT_TEXT_EXT.test(f.name)) {
      out.push({ path: f.path, rel: f.rel, kind: "text", srcSha: null });
    }
  }
  return out;
}
function preprocessFiles(files, force) {
  const lit = resolveLit();
  const extractor = lit ? `liteparse (${lit})` : "pdftotext -layout (liteparse not found — PDF only; .docx/.xlsx/.pptx require liteparse)";
  const sources = files.filter((f) => f.kind === "source" && !f.override && f.srcSha);
  const total = sources.length;
  const status = new Map;
  const t0 = performance.now();
  let done = 0, skipped = 0, failed = 0, empty = 0, lastReport = t0;
  const progress = (flush) => {
    const now = performance.now();
    if (!flush && now - lastReport < 2000)
      return;
    lastReport = now;
    const n = done + skipped + failed + empty;
    const rate = done / Math.max(1, (now - t0) / 1000);
    const eta = done > 0 && n < total ? ` · ~${Math.ceil((total - n) / rate)}s remaining` : "";
    process.stderr.write(`preprocess: ${n}/${total} (${done} extracted, ${skipped} cached, ${empty} empty, ${failed} failed) · ${rate.toFixed(1)} docs/s${eta}
`);
  };
  if (total > 0)
    process.stderr.write(`preprocess: ${total} source files · ${extractor}
`);
  for (const f of sources) {
    if (!f.srcSha)
      continue;
    const out = parsedPath(f.srcSha);
    if (!force && existsSync2(out)) {
      const cached = cachedStatus(out);
      if (!(lit && cached !== "ok")) {
        skipped++;
        status.set(f.srcSha, cached);
        progress();
        continue;
      }
    }
    mkdirSync2(join2(PARSED, f.srcSha.slice(0, 2)), { recursive: true });
    if (!lit && !/\.pdf$/i.test(f.rel)) {
      failed++;
      status.set(f.srcSha, "failed");
      writeFileSync(out, `[extraction failed — liteparse required for ${extname(f.rel)}; install liteparse (lit on PATH or $LITEPARSE_PATH), or supply ${f.rel.replace(PREPROCESS_EXT, ".txt")}]`);
      process.stderr.write(`preprocess: SKIP  ${f.rel} — liteparse required for .docx/.xlsx/.pptx
`);
      continue;
    }
    const text = extract(lit, f.path);
    if (text == null) {
      failed++;
      status.set(f.srcSha, "failed");
      writeFileSync(out, `[extraction failed — parse error on ${f.rel}]`);
      process.stderr.write(`preprocess: FAIL  ${f.rel}
`);
      continue;
    }
    if (text.replace(/\s|\[page \d+\]|=/g, "").length < 200) {
      empty++;
      status.set(f.srcSha, "empty");
      writeFileSync(out, `[no text extracted — page may be blank or unreadable after OCR]
${text}`);
      process.stderr.write(`preprocess: EMPTY ${f.rel} (liteparse/OCR returned no text)
`);
      continue;
    }
    writeFileSync(out, text);
    status.set(f.srcSha, "ok");
    done++;
    progress();
  }
  const elapsed_ms = Math.round(performance.now() - t0);
  if (total > 0)
    progress(true);
  return {
    extractor,
    parsed_dir: PARSED,
    extracted: done,
    skipped,
    empty,
    failed,
    elapsed_ms,
    status
  };
}
var promptPath = (runId, label) => join2(DATA, "shards", runId, `${label}.prompt.md`);
function shardPromptText(runId, sh, rubric, files, brief, round, scope) {
  const docs = files.map((f) => `  doc_id=${f.doc_id}  path=${f.path}  uri=${f.uri}  family=${f.family}`).join(`
`);
  return `RUN_ID=${runId}  brief_id=${brief}  round=${round}  scope_id=${scope}
worker=sweep:${sh.label}          <- use this exact string in every find/coverage call

<rubric>
${rubric}
</rubric>

Your shard — read every one:
${docs}
${sh.hunter ? `
This shard's document is large: grep it for the rubric's terms rather than reading it start to finish.
` : ""}
TURN PLAN — a model turn is the expensive unit; batch INTO the tool first, parallel calls second, never one call per turn:
1. FIRST message: Read every document above in parallel — EXCEPT any flagged large (grep those for the rubric's terms and Read windows around the hits instead). A truncated Read means keep reading from the reported offset; finishing a document is not re-reading it. If these paths won't open (this prompt reached you over a connection, not a shared disk): for a shard of five documents or fewer, ONE doc_text call with \`docs: [{doc_id, offset}, …]\`, paging each with its next_offset until it reports null; for a larger or flagged-large shard, doc_search (pattern takes an array — every probe in one call) and doc_text the hits, again via \`docs\`. Never treat one page as the whole document.
2. Per document, ONE \`find\` call with \`rows: [{kind, claim, doc_id, quote, near?}, …]\` — every finding for that document in one call; spill into a second call rather than trimming quotes. On a document you work through incrementally, flush a rows batch every ~10 findings as you go; never hold a long document's finds to the end.
3. \`find\` returns {inserted, rejected}: each rejected row carries its index, error, and hint. Resend ONLY the rejected rows, fixed, in your next call — alongside the next document's rows.
4. LAST message, after every find has landed or been retired: the \`coverage\` batch for every doc_id, one call. Never stamp coverage in a message that still carries find retries.
5. YOUR REPLY — exactly one line: \`shard=${sh.label} status=ok|partial|error\`. ok = every doc stamped 'read'; partial = some 'read', the rest stamped 'error'; error = nothing usable landed. Findings go in \`find\` rows and reasons in \`coverage\` notes (coverage's own status enum is 'read'|'error' — never these reply tokens), not in your reply. One exception: if the \`coverage\` call itself failed, append the reason to your reply line — otherwise it is recorded nowhere.`;
}
function dump(runId, shards, opts = {}) {
  if (!shards.length)
    die(`dump: no shards`);
  if (shards.length > 32)
    die(`dump: ${shards.length} shards; cap is 32`);
  mkdirSync2(join2(DATA, "shards", runId), { recursive: true, mode: 448 });
  const out = shards.map((sh) => {
    const res = dumpShard(runId, sh.label, sh.doc_ids);
    if (opts.rubric === undefined)
      return { label: sh.label, ...res };
    const text = shardPromptText(runId, sh, opts.rubric, res.written, opts.brief_id ?? 0, opts.round ?? 0, opts.scope_id ?? 0);
    const pp = promptPath(runId, sh.label);
    writeFileSync(pp, text, { mode: 384 });
    return { label: sh.label, prompt_path: pp, ...res };
  });
  return { shards: out };
}
function shardPrompt(runId, label) {
  assertRunId("shard_prompt", runId);
  if (!NAME_RE.test(label))
    die(`shard_prompt: invalid label '${label}'`);
  const pp = promptPath(runId, label);
  if (!existsSync2(pp))
    die(`shard_prompt: no prompt for shard '${label}' — was dump given a rubric?`);
  return { label, prompt: readFileSync(pp, "utf8") };
}
function corpusPrepare(name, dir, force = false) {
  corpusRegister(name, dir);
  const before = sync(name);
  const needsWork = force || before.new.length > 0 || before.changed.length > 0 || before.unparsed.length > 0;
  const done = needsWork ? ingest(name, force) : null;
  const docs = db.prepare(`SELECT count(*) AS n FROM corpus_documents WHERE corpus = ?`).get(name).n;
  return {
    corpus: name,
    documents: docs,
    already_current: !needsWork,
    ...done ? { ingested: done.ingested } : {},
    ...before.missing.length ? { missing: before.missing } : {}
  };
}
function sync(corpus) {
  const dir = corpusRoot(corpus);
  const files = scanCorpus(dir);
  const dbDocs = new Map(db.prepare(`SELECT uri, sha256, source_sha256 FROM v_corpus_documents WHERE corpus = ?`).all(corpus).map((r) => [r.uri, r]));
  const fresh = [];
  const changed = [];
  const unparsed = [];
  const seen = new Set;
  let current = 0;
  for (const f of files) {
    if (f.kind === "source" && f.override)
      continue;
    seen.add(f.rel);
    const row2 = dbDocs.get(f.rel);
    if (f.kind === "source" && f.srcSha && !existsSync2(parsedPath(f.srcSha)))
      unparsed.push(f.rel);
    if (!row2) {
      fresh.push(f.rel);
    } else if (f.kind === "source") {
      if (row2.source_sha256 === f.srcSha)
        current++;
      else
        changed.push(f.rel);
    } else {
      if (row2.sha256 === sha256(readFileSync(f.path, "utf8")))
        current++;
      else
        changed.push(f.rel);
    }
  }
  const missing = [...dbDocs.keys()].filter((u) => !seen.has(u));
  return { corpus, root: dir, current, new: fresh, changed, missing, unparsed };
}
function loadManifest(dir) {
  const manifest = new Map;
  for (const mf of [join2(dir, "MANIFEST.jsonl"), join2(dir, "..", "MANIFEST.jsonl")])
    if (existsSync2(mf))
      for (const line of readFileSync(mf, "utf8").split(`
`).filter(Boolean)) {
        const m = JSON.parse(line);
        manifest.set(m.file, m);
      }
  return manifest;
}
function ingest(corpus, force = false) {
  const dir = corpusRoot(corpus);
  const files = scanCorpus(dir);
  const { status, ...pre } = preprocessFiles(files, force);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO audits (run_id, corpus, kind, sample_n, result) VALUES (NULL, ?, 'preprocess', ?, ?)`).run(corpus, pre.extracted + pre.skipped + pre.empty + pre.failed, JSON.stringify(pre));
  const manifest = loadManifest(dir);
  const insDoc = db.prepare(`INSERT INTO documents (content, sha256, family) VALUES ($content, $sha256, $family)
     ON CONFLICT(sha256) DO UPDATE SET sha256 = sha256 RETURNING id`);
  const insCorpus = db.prepare(`INSERT INTO corpus_documents
       (corpus, uri, doc_id, source_sha256, parse_status, parsed_at, publisher, category, dated, source_url)
     VALUES ($corpus, $uri, $doc_id, $source_sha256, $parse_status, $parsed_at, $publisher, $category, $dated, $source_url)
     ON CONFLICT(corpus, uri) DO UPDATE SET
       doc_id = excluded.doc_id, source_sha256 = excluded.source_sha256,
       parse_status = excluded.parse_status, parsed_at = excluded.parsed_at,
       publisher = excluded.publisher, category = excluded.category,
       dated = excluded.dated, source_url = excluded.source_url`);
  let n = 0;
  const warnings = [];
  tx(() => {
    for (const f of files) {
      if (f.kind === "source" && f.override)
        continue;
      let content;
      if (f.kind === "text") {
        content = readFileSync(f.path, "utf8");
      } else if (f.srcSha && existsSync2(parsedPath(f.srcSha))) {
        content = readFileSync(parsedPath(f.srcSha), "utf8");
      } else {
        warnings.push(`unparsed: ${f.rel} (preprocess failed or liteparse unavailable)`);
        continue;
      }
      const contentSha = sha256(content);
      const stem = f.rel.replace(extname(f.rel), "");
      const m = manifest.get(f.rel) ?? PREPROCESS_EXTS.map((e) => manifest.get(`${stem}.${e}`)).find(Boolean) ?? {};
      const doc = insDoc.get({
        content,
        sha256: contentSha,
        family: f.rel.split(sep)[0] ?? ""
      });
      if (!doc)
        die(`ingest: upsert failed for ${f.rel}`);
      insCorpus.run({
        corpus,
        uri: f.rel,
        doc_id: doc.id,
        source_sha256: f.srcSha,
        parse_status: f.srcSha ? status.get(f.srcSha) ?? null : null,
        parsed_at: f.srcSha ? now : null,
        publisher: m.publisher ?? null,
        category: m.category ?? null,
        dated: m.dated ?? null,
        source_url: m.url ?? m.source_url ?? null
      });
      n++;
    }
  });
  return { preprocess: pre, ingested: n, corpus, root: dir, warnings };
}
function exportReport(runId) {
  if (!RUN_ID_RE.test(runId))
    die(`export_report: invalid run_id '${runId}'`);
  const run = db.prepare(`SELECT r.question, b.rubric, b.assumptions, b.done_criteria, b.scope_intent
       FROM runs r JOIN briefs b ON b.run_id = r.run_id
       WHERE r.run_id = ? AND b.status='active' ORDER BY b.version DESC LIMIT 1`).get(runId);
  if (!run)
    die(`export_report: no run/active brief for '${runId}'`);
  const report = db.prepare(`SELECT body FROM reports WHERE run_id=? ORDER BY id DESC LIMIT 1`).get(runId);
  if (!report)
    die(`export_report: no report rows for '${runId}'`);
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
    ``
  ].join(`
`);
  const dir = join2(DATA, "reports");
  mkdirSync2(dir, { recursive: true, mode: 448 });
  const path = join2(dir, `${runId}.md`);
  writeFileSync(path, md, { mode: 384 });
  return { path, body: report.body, chars: md.length };
}
var OBSERVATIONS_HEADER = `# /contracts observations

> Please share this file with your Anthropic contact. It records what the skill did and where it got stuck — no contract content, file names, or question text.
`;
function logObservation(entry) {
  const path = join2(DATA, "observations.md");
  if (!existsSync2(path))
    writeFileSync(path, OBSERVATIONS_HEADER, { mode: 384 });
  appendFileSync(path, `
${entry.trim()}
`);
  return { path };
}

// src/schemas.ts
var TOOLS = [
  {
    name: "corpus_register",
    title: "Registering your documents folder",
    description: "Register a corpus: give a name to a local folder of documents (pdf/docx/xlsx/pptx sources, txt/md/html direct text). The ONLY tool that accepts a filesystem path; the path is canonicalized and must be an existing directory. Re-registering a name updates its root. Never give to sweep workers.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "corpus name, e.g. 'acme-msa'"
        },
        dir: {
          type: "string",
          description: "path to the folder"
        }
      },
      required: [
        "name",
        "dir"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Registering your documents folder"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "corpus_prepare",
    title: "Getting your documents ready",
    description: "Register a folder of documents, check what changed, and read in anything new — in one call. Use this instead of corpus_register + corpus_sync + ingest, which is three model turns to say the same thing. Returns {documents, already_current, ingested?, missing?}. The ONLY tool besides corpus_register that accepts a filesystem path.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "corpus name, e.g. 'acme-msa'"
        },
        dir: {
          type: "string",
          description: "path to the folder"
        },
        force: {
          type: "boolean",
          description: "re-extract even cached files"
        }
      },
      required: [
        "name",
        "dir"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Getting your documents ready"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "ingest",
    title: "Reading in your documents",
    description: "Extract text from every source file in a registered corpus (liteparse if installed, pdftotext fallback for PDFs) and load it into the database. Idempotent; re-run after files change. force re-extracts cached files. Never give to sweep workers.",
    inputSchema: {
      type: "object",
      properties: {
        corpus: {
          type: "string"
        },
        force: {
          type: "boolean"
        }
      },
      required: [
        "corpus"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Reading in your documents"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "corpus_sync",
    title: "Checking your documents for changes",
    description: "Read-only diff of a registered corpus folder vs the database: which files are new, changed, missing, or unparsed. Run before answering to know whether an ingest is needed.",
    inputSchema: {
      type: "object",
      properties: {
        corpus: {
          type: "string"
        }
      },
      required: [
        "corpus"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Checking your documents for changes",
      readOnlyHint: true
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "find",
    title: "Saving what was found (with its quote)",
    description: "Record findings with span-verified citations. Each quote must appear verbatim in its document (whitespace/quote-style differences are normalized); the citation is rejected otherwise. **Batch with `rows`** — every finding for a document in ONE call, verified per row exactly like the single form: good rows commit, bad rows return in `rejected` with {index, error, hint}; resend only those. Single form: kind/claim/doc_id/quote at top level. For non-contiguous content, first write an audits row (kind='citation_judge'), then pass span + audit. This and coverage are the only write tools sweep workers hold.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: {
          type: "string"
        },
        brief_id: {
          type: "integer"
        },
        round: {
          type: "integer"
        },
        worker: {
          type: "string"
        },
        kind: {
          type: "string",
          enum: [
            "finding",
            "unknown"
          ]
        },
        claim: {
          type: "string"
        },
        doc_id: {
          type: "integer"
        },
        quote: {
          type: "string",
          minLength: 1
        },
        near: {
          type: "integer",
          description: "approximate character offset of the quote"
        },
        span: {
          type: "array",
          items: {
            type: "integer"
          },
          minItems: 2,
          maxItems: 2
        },
        audit: {
          type: "integer"
        },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: [
                  "finding",
                  "unknown"
                ]
              },
              claim: {
                type: "string"
              },
              doc_id: {
                type: "integer"
              },
              quote: {
                type: "string",
                minLength: 1
              },
              near: {
                type: "integer"
              },
              span: {
                type: "array",
                items: {
                  type: "integer"
                },
                minItems: 2,
                maxItems: 2
              },
              audit: {
                type: "integer"
              }
            },
            required: [
              "kind",
              "claim",
              "doc_id",
              "quote"
            ],
            additionalProperties: false
          },
          minItems: 1,
          maxItems: 50,
          description: "many findings in one call — returns {inserted, rejected} with per-row errors"
        }
      },
      required: [
        "run_id",
        "brief_id",
        "round",
        "worker"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Saving what was found (with its quote)"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "coverage",
    title: "Marking documents as read",
    description: "Read-receipt for shard documents: status 'read' (processed, even if nothing relevant) or 'error'. Distinguishes 'nothing relevant' from 'worker crashed'. Stamp your whole shard in one call with rows — one call per document wastes a turn each at the end of the sweep.",
    inputSchema: {
      type: "object",
      properties: {
        scope_id: {
          type: "integer"
        },
        doc_id: {
          type: "integer"
        },
        worker: {
          type: "string"
        },
        status: {
          type: "string",
          enum: [
            "read",
            "error"
          ]
        },
        note: {
          type: "string"
        },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scope_id: {
                type: "integer"
              },
              doc_id: {
                type: "integer"
              },
              worker: {
                type: "string"
              },
              status: {
                type: "string",
                enum: [
                  "read",
                  "error"
                ]
              },
              note: {
                type: "string"
              }
            },
            required: [
              "scope_id",
              "doc_id",
              "worker",
              "status"
            ],
            additionalProperties: false
          }
        }
      },
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Marking documents as read"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "cite",
    title: "Verifying a quote",
    description: "Mint standalone citations (brief_id, created_by, verbatim quotes). Same verification rules as find. **Batch with `rows`** — citations mint in clusters during composition, so pass them all in ONE call: good rows return in `minted`, bad rows in `rejected` with {index, error, hint}; resend only those. Single form: doc_id/quote at top level. Then attach via *_citations joins (write rows).",
    inputSchema: {
      type: "object",
      properties: {
        brief_id: {
          type: "integer"
        },
        by: {
          type: "string"
        },
        doc_id: {
          type: "integer"
        },
        quote: {
          type: "string",
          minLength: 1
        },
        near: {
          type: "integer"
        },
        span: {
          type: "array",
          items: {
            type: "integer"
          },
          minItems: 2,
          maxItems: 2
        },
        audit: {
          type: "integer"
        },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              doc_id: {
                type: "integer"
              },
              quote: {
                type: "string",
                minLength: 1
              },
              near: {
                type: "integer"
              },
              span: {
                type: "array",
                items: {
                  type: "integer"
                },
                minItems: 2,
                maxItems: 2
              },
              audit: {
                type: "integer"
              }
            },
            required: [
              "doc_id",
              "quote"
            ],
            additionalProperties: false
          },
          minItems: 1,
          maxItems: 50,
          description: "many citations in one call — returns {minted, rejected} with per-row errors"
        }
      },
      required: [
        "brief_id",
        "by"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Verifying a quote"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "write",
    title: "Saving progress",
    description: "Insert validated rows. Tables: runs, briefs, scopes, shard_coverage, scope_documents, findings, finding_citations, queue_items, queue_citations, reports, report_claims, claim_citations, knowledge, knowledge_citations, audits. Pass ONE of: row (returns the inserted row) or rows (an array — inserted in a single transaction, returns their ids). **Always batch with rows when you have more than one** — each tool call costs a full turn, so writing 40 rows one at a time wastes minutes. Never give to sweep workers.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          enum: [
            "runs",
            "briefs",
            "scopes",
            "shard_coverage",
            "scope_documents",
            "findings",
            "finding_citations",
            "queue_items",
            "queue_citations",
            "reports",
            "report_claims",
            "claim_citations",
            "knowledge",
            "knowledge_citations",
            "audits"
          ]
        },
        row: {
          type: "object",
          additionalProperties: {}
        },
        rows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: {}
          }
        }
      },
      required: [
        "table"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Saving progress"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "set",
    title: "Updating progress",
    description: "Update allowlisted columns: runs.{status,round,session_id}, briefs.status, queue_items.{status,answer,answered_by,answered_at}, knowledge.{status,ratified_by}. **Batch with `updates`** — a transition usually sets several (run status + round, a queue item's answer/answered_by/status): pass them all in ONE call, applied in one transaction. Single form: table/id/col/value at top level. Never give to sweep workers.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          enum: [
            "runs",
            "briefs",
            "queue_items",
            "knowledge"
          ]
        },
        id: {
          type: "string",
          description: "primary key value (run_id for runs, numeric id otherwise)"
        },
        col: {
          type: "string"
        },
        value: {
          type: "string"
        },
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              table: {
                type: "string",
                enum: [
                  "runs",
                  "briefs",
                  "queue_items",
                  "knowledge"
                ]
              },
              id: {
                type: "string"
              },
              col: {
                type: "string"
              },
              value: {
                type: "string"
              }
            },
            required: [
              "table",
              "id",
              "col",
              "value"
            ],
            additionalProperties: false
          },
          minItems: 1,
          maxItems: 100,
          description: "many updates in one transaction — all land or none do"
        }
      },
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Updating progress"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "sql",
    title: "Checking the records",
    description: "Run SQL against the documents database (SELECT returns rows; writes return {changes}). `query` takes an ARRAY — independent queries (prescan probes, status checks, triage pulls) go in ONE call, results keyed per query with per-query errors; a lone string works too. Never SELECT the content column of documents — full text overflows tool results; use dump instead. The schema's triggers still enforce citation verification and immutability. Conductor only — never expose to workers processing document content.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          anyOf: [
            {
              type: "string",
              minLength: 1
            },
            {
              type: "array",
              items: {
                type: "string",
                minLength: 1
              },
              minItems: 1,
              maxItems: 20
            }
          ]
        }
      },
      required: [
        "query"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Checking the records"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "db_schema",
    title: "Checking the filing system",
    description: "List the database schema (tables, views, triggers).",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {}
    },
    annotations: {
      title: "Checking the filing system",
      readOnlyHint: true
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "doc_search",
    title: "Searching your documents",
    description: "LITERAL substring search across a corpus's documents — no regex, no wildcards, no | alternation (a pipe is searched as a pipe character and will match nothing). `pattern` takes an ARRAY: pass each phrasing as its OWN entry ('service credit', 'indemnif', 'hold harmless') in ONE call; results come back keyed per pattern. A lone string works too. Case-insensitive by default, so prefer short stems ('indemnif' catches indemnify/indemnification). Use this BEFORE doc_text when you can't grep the dumped shard files, so you page in only the documents that hit. Case-insensitive by default.",
    inputSchema: {
      type: "object",
      properties: {
        corpus: {
          type: "string"
        },
        pattern: {
          anyOf: [
            {
              type: "string",
              minLength: 1
            },
            {
              type: "array",
              items: {
                type: "string",
                minLength: 1
              },
              minItems: 1,
              maxItems: 10
            }
          ]
        },
        ignore_case: {
          type: "boolean"
        },
        max_docs: {
          type: "integer"
        },
        max_per_doc: {
          type: "integer",
          description: "match snippets per document; capped at 20"
        }
      },
      required: [
        "corpus",
        "pattern"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Searching your documents",
      readOnlyHint: true
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "doc_text",
    title: "Reading a contract",
    description: "Read document text straight from the database, paginated (follow each next_offset until null). **Batch with `docs`** — page every document you're reading in ONE call: `docs: [{doc_id, offset?}, …]`, sharing one char budget (`limit`, same cap as a single call), consumed in array order; a doc the budget didn't reach returns chars:0 with next_offset unchanged — page it next call. Use ONLY when the dumped shard files aren't readable from where you run — otherwise Read the shard file, which is cheaper. Returns per doc {doc_id, uri, family, offset, chars, total_chars, next_offset, text}.",
    inputSchema: {
      type: "object",
      properties: {
        doc_id: {
          type: "integer"
        },
        offset: {
          type: "integer",
          minimum: 0
        },
        limit: {
          type: "integer",
          minimum: 1,
          description: "char budget for the call (shared across docs in batch form); capped at 60000"
        },
        docs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              doc_id: {
                type: "integer"
              },
              offset: {
                type: "integer",
                minimum: 0
              }
            },
            required: [
              "doc_id"
            ],
            additionalProperties: false
          },
          minItems: 1,
          maxItems: 20,
          description: "many documents in one call under one shared char budget"
        }
      },
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Reading a contract",
      readOnlyHint: true
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "dump",
    title: "Preparing the reading batches",
    description: "Write shard text to files for sweep workers, and (when given the rubric) each shard's ready-made worker prompt. Pass every shard in one call. Returns each shard's files and prompt_path. Give it the rubric: otherwise you retype the whole rubric into every reader's prompt, which costs more wall-clock than the reading does. Never give to sweep workers.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: {
          type: "string"
        },
        shards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string"
              },
              doc_ids: {
                type: "array",
                items: {
                  type: "integer"
                },
                minItems: 1
              },
              hunter: {
                type: "boolean"
              }
            },
            required: [
              "label",
              "doc_ids"
            ],
            additionalProperties: false
          },
          minItems: 1
        },
        rubric: {
          type: "string",
          description: "the brief's rubric, verbatim — written into each shard's prompt file"
        },
        brief_id: {
          type: "integer"
        },
        round: {
          type: "integer"
        },
        scope_id: {
          type: "integer"
        }
      },
      required: [
        "run_id",
        "shards"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Preparing the reading batches"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "shard_prompt",
    title: "Fetching reading instructions",
    description: "Fetch a shard's worker prompt as text (rubric + your documents). Use it when you can't open the prompt file dump wrote — i.e. the engine is on another machine. Never sweep without your rubric.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: {
          type: "string"
        },
        label: {
          type: "string"
        }
      },
      required: [
        "run_id",
        "label"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Fetching reading instructions",
      readOnlyHint: true
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "drop",
    title: "Removing old runs",
    description: "Delete runs (and sweep orphaned citations/documents). Pass run_ids, or prefix to glob-match. Citations backing ratified knowledge survive. Never give to sweep workers.",
    inputSchema: {
      type: "object",
      properties: {
        run_ids: {
          type: "array",
          items: {
            type: "string"
          }
        },
        prefix: {
          type: "string"
        }
      },
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Removing old runs",
      destructiveHint: true
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "export_report",
    title: "Assembling the report",
    description: "LEGACY — only runs from before answers moved to chat have report rows; new runs have none and this errors. Compose the run's self-contained markdown report (question + brief + report body) and write it to <data>/reports/<run_id>.md server-side — no filesystem permissions needed on the caller. Returns {path, body} (body so the caller can summarize without a second query).",
    inputSchema: {
      type: "object",
      properties: {
        run_id: {
          type: "string"
        }
      },
      required: [
        "run_id"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Assembling the report"
    },
    execution: {
      taskSupport: "forbidden"
    }
  },
  {
    name: "log_observation",
    title: "Logging run notes",
    description: "Append one de-identified entry to the observations log (<data>/observations.md), creating it with its header on first use. The entry must contain no contract text, file names, or question text. Returns the file path.",
    inputSchema: {
      type: "object",
      properties: {
        entry: {
          type: "string",
          minLength: 1
        }
      },
      required: [
        "entry"
      ],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    },
    annotations: {
      title: "Logging run notes"
    },
    execution: {
      taskSupport: "forbidden"
    }
  }
];

// ../shared/rpc.ts
import { createInterface } from "node:readline";
var PROTOCOL_VERSIONS = ["2024-11-05", "2025-06-18"];
function serve(cfg) {
  const toolIndex = new Map(cfg.tools.map((t) => [t.name, t]));
  const send = (msg) => void process.stdout.write(JSON.stringify(msg) + `
`);
  const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
  const replyError = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
  async function callTool(name, rawArgs) {
    const def = toolIndex.get(name);
    if (!def)
      throw Object.assign(new Error(`unknown tool: ${name}`), { rpcCode: -32602 });
    try {
      const args = checkAndStrip(name, def.inputSchema, rawArgs);
      const result = await cfg.handlers[name](args);
      if (result && typeof result === "object" && Array.isArray(result.content))
        return result;
      let summary;
      try {
        summary = cfg.summarize?.[name]?.(result, args);
      } catch {
        summary = undefined;
      }
      return {
        content: [
          ...summary ? [{ type: "text", text: summary }] : [],
          { type: "text", text: JSON.stringify(result ?? { ok: true }) }
        ]
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: String(e.message ?? e) }) }],
        isError: true
      };
    }
  }
  async function dispatch(msg) {
    const { id, method, params } = msg;
    const isRequest = id !== undefined && id !== null;
    try {
      switch (method) {
        case "initialize": {
          if (!isRequest)
            return;
          const asked = params?.protocolVersion ?? PROTOCOL_VERSIONS[0];
          reply(id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS.at(-1),
            capabilities: { tools: { listChanged: true } },
            serverInfo: cfg.serverInfo,
            ...cfg.instructions ? { instructions: cfg.instructions } : {}
          });
          return;
        }
        case "ping":
          if (isRequest)
            reply(id, {});
          return;
        case "tools/list":
          if (isRequest)
            reply(id, { tools: cfg.tools });
          return;
        case "tools/call":
          if (isRequest)
            reply(id, await callTool(params?.name, params?.arguments));
          return;
        default:
          if (isRequest)
            replyError(id, -32601, `method not found: ${method}`);
          return;
      }
    } catch (e) {
      const code = e.rpcCode ?? -32603;
      if (isRequest)
        replyError(id, code, String(e.message ?? e));
    }
  }
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed)
      return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      replyError(null, -32700, "parse error: invalid JSON");
      return;
    }
    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
      replyError(null, -32600, Array.isArray(msg) ? "batch requests are not supported" : "invalid request");
      return;
    }
    dispatch(msg);
  });
  rl.on("close", () => process.exit(0));
  process.stderr.write(`${cfg.serverInfo.name}: stdio ready
`);
}

// src/index.ts
var [mode] = process.argv.slice(2);
if (mode) {
  process.stderr.write(`mcp-server-documents: unknown mode "${mode}" — this server speaks MCP over stdio and takes no arguments
`);
  process.exit(1);
}
var SERVER_INFO = { name: "mcp-server-documents", version: "0.0.1" };
var INSTRUCTIONS = "Pre-release server for the /contracts skill; behavior and outputs may change. Do not surface tool or schema internals to end users — the skill translates.";
var HANDLERS = {
  corpus_register: (a) => corpusRegister(a.name, a.dir),
  corpus_prepare: (a) => corpusPrepare(a.name, a.dir, a.force ?? false),
  ingest: (a) => ingest(a.corpus, a.force),
  corpus_sync: (a) => sync(a.corpus),
  find: (a) => {
    const rows = a.rows;
    if (rows === undefined === (a.quote === undefined))
      die(`find: pass exactly one of rows or the single-finding fields`);
    if (rows) {
      const ctx = {
        run_id: a.run_id,
        brief_id: a.brief_id,
        round: a.round,
        worker: a.worker
      };
      return findMany(ctx, rows.map((r) => checkFindRow(r)));
    }
    return find(checkFind(a));
  },
  coverage: (a) => {
    const rows = a.rows;
    const { rows: _drop, ...one } = a;
    return coverage(rows ? undefined : one, rows);
  },
  cite: (a) => {
    const rows = a.rows;
    if (rows) {
      if (a.quote !== undefined || a.doc_id !== undefined)
        die(`cite: pass exactly one of rows or the single-citation fields`);
      return citeMany(a.brief_id, a.by, rows);
    }
    if (a.quote === undefined || a.doc_id === undefined)
      die(`cite: single form needs doc_id and quote (or pass rows)`);
    return cite(a.doc_id, a.brief_id, a.by, a.quote, {
      near: a.near,
      span: asSpan(a.span),
      audit: a.audit
    });
  },
  write: (a) => write(a.table, a.row, a.rows),
  set: (a) => {
    const updates = a.updates;
    if (updates) {
      if (a.table !== undefined || a.id !== undefined || a.col !== undefined || a.value !== undefined)
        die(`set: pass exactly one of updates or the single-update fields`);
      return setMany(updates);
    }
    if (a.table === undefined || a.id === undefined || a.col === undefined || a.value === undefined)
      die(`set: single form needs table, id, col, and value (or pass updates)`);
    return set(a.table, a.id, a.col, a.value);
  },
  sql: (a) => Array.isArray(a.query) ? sqlMany(a.query) : sql(a.query),
  db_schema: () => schema(),
  doc_search: (a) => {
    const patterns = Array.isArray(a.pattern) ? a.pattern : [a.pattern];
    const opts = {
      ignore_case: a.ignore_case,
      max_docs: a.max_docs,
      max_per_doc: a.max_per_doc
    };
    if (patterns.length === 1)
      return docSearch(a.corpus, patterns[0], opts);
    return Object.fromEntries(patterns.map((p) => [p, docSearch(a.corpus, p, opts)]));
  },
  doc_text: (a) => {
    const docs = a.docs;
    if (docs) {
      if (a.doc_id !== undefined || a.offset !== undefined)
        die(`doc_text: pass exactly one of docs or doc_id/offset`);
      return docTextMany(docs, a.limit ?? 40000);
    }
    if (a.doc_id === undefined)
      die(`doc_text: pass doc_id (or docs for a batch)`);
    return docText(a.doc_id, a.offset ?? 0, a.limit ?? 40000);
  },
  dump: (a) => dump(a.run_id, a.shards, {
    rubric: a.rubric,
    brief_id: a.brief_id,
    round: a.round,
    scope_id: a.scope_id
  }),
  shard_prompt: (a) => shardPrompt(a.run_id, a.label),
  drop: (a) => drop(a.run_ids ?? [], a.prefix),
  export_report: (a) => exportReport(a.run_id),
  log_observation: (a) => logObservation(a.entry)
};
var n = (v) => typeof v === "number" ? v : 0;
var SUMMARIZE = {
  corpus_prepare: (r) => {
    const x = r;
    return x.already_current ? `${n(x.documents)} documents ready — nothing new to read in.` : `${n(x.documents)} documents — read in ${n(x.ingested)} new or changed.`;
  },
  doc_search: (r, a) => {
    const pats = Array.isArray(a.pattern) ? a.pattern : [String(a.pattern)];
    const count = (x) => n(x?.docs_matched);
    if (pats.length === 1)
      return `"${pats[0]}" — found in ${count(r)} document${count(r) === 1 ? "" : "s"}.`;
    const keyed = r;
    return `Searched ${pats.length} phrasings — ${pats.map((p) => `"${p}" in ${count(keyed[p])}`).join(", ")}.`;
  },
  find: (r) => {
    const x = r;
    if (x.id !== undefined)
      return `Saved 1 finding with its quote verified.`;
    const ins = Array.isArray(x.inserted) ? x.inserted.length : 0;
    const rej = Array.isArray(x.rejected) ? x.rejected.length : 0;
    return rej ? `Saved ${ins} findings; ${rej} quote${rej === 1 ? "" : "s"} need a second look.` : `Saved ${ins} findings, every quote verified.`;
  },
  coverage: (r) => {
    const x = r;
    return `Marked ${n(x.stamped) || "the"} document${n(x.stamped) === 1 ? "" : "s"} as fully read.`;
  },
  dump: (r) => {
    const x = r;
    return Array.isArray(x) ? `Split the reading into ${x.length} batches.` : `Reading batches prepared.`;
  },
  doc_text: (r, a) => {
    if (Array.isArray(a.docs)) {
      const x2 = r;
      const got = Object.values(x2).filter((d) => n(d?.chars) > 0).length;
      return `Read ${got} document${got === 1 ? "" : "s"}.`;
    }
    const x = r;
    return x.done === false ? `Read part of the document — more to page through.` : `Read the document.`;
  }
};
serve({
  serverInfo: SERVER_INFO,
  instructions: INSTRUCTIONS,
  tools: TOOLS,
  handlers: HANDLERS,
  summarize: SUMMARIZE
});
