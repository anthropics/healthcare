-- Connection pragmas live in db.ts: this file runs inside a transaction,
-- where foreign_keys silently no-ops and a journal_mode change would fail.

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

-- Convenience view: what most queries used to get from `documents WHERE corpus=?`.
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
