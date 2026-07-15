import { checkAndStrip } from "../../shared/validate.mjs";
import { db, tx } from "./db.mjs";
import { die } from "./die.mjs";
import { isPlaceholder } from "./ingest.mjs";

// THE GUARANTEE: no citation exists unless its text is verifiably in
// documents.content, and no finding exists without one. The schema trigger
// backstops every path here.

// Words and numbers only — punctuation the worker added while reconstructing
// a table row ('12%,' for '12%') must not make a faithful quote look invented.
const citeTokens = (s) => s.toLowerCase().match(/[a-z0-9%$]+/g) ?? [];

/** Every word of the quote, in order, inside the judged span. A judged citation
 *  covers non-contiguous evidence (a table row, a reflowed clause), so the quote
 *  won't be a substring — but its words must still be *there*. Without this, a
 *  span-bound verdict still lets an invented sentence through. */
function spanSupportsQuote(spanText, quote) {
  const tokens = citeTokens(quote);
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

// Fold what breaks verbatim matching between a worker's grep window and
// documents.content: whitespace runs, NBSP, curly quotes, dashes, markdown *.
// The offset map walks a normalized hit back to the original span, so the
// stored quote stays verbatim and kind stays 'exact'.
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
  const ambiguous = () =>
    die(
      `cite: quote appears more than once in this document — pass 'near' (an approximate offset) so the right occurrence is cited`,
    );
  const at = nearestIndex(content, quote, near);
  if (at === -2) ambiguous();
  if (at >= 0) return [at, at + quote.length];
  const h = contentNorm ?? normalizeWithMap(content);
  const { norm: nq } = normalizeWithMap(quote.trim());
  if (!nq) return null;
  const nearN = near === undefined ? undefined : lowerBound(h.map, near);
  const atN = nearestIndex(h.norm, nq, nearN);
  // Ambiguous-after-normalization is still ambiguity — "not found" would send
  // the sender re-transcribing text that was found twice.
  if (atN === -2) ambiguous();
  if (atN < 0) return null;
  const s = h.map[atN];
  const endN = atN + nq.length - 1;
  const e = h.map[endN] + 1;
  return [s, e];
}

/** span arrives as a validated length-2 array; `asSpan` narrows it. */
export const asSpan = (s) => (s ? [s[0], s[1]] : undefined);

// One cap for every located span — judged citations and line-resolved spans
// alike. Past this the "quote" stops being a passage and starts being a
// chapter. (Verbatim quotes stay uncapped: typing 4000+ chars is its own
// proof of intent.)
const SPAN_CAP = 4000;

// Cites per finding. One is the norm; two is a contradiction; past a handful
// the "finding" is really several. Engine-side only — a wire cap would fail
// the whole 50-row call instead of rejecting the one row (see findMany).
const MAX_CITES = 8;

// A ±150-char content window for self-correcting rejections — the same
// courtesy dieQuoteNotFound extends to quotes.
const ctxWindow = (content, off) =>
  `«${content.slice(Math.max(0, off - 150), off + 150).replace(/\s+/g, " ")}»`;

// 1-indexed line-start offsets, memoized on the doc cache entry beside norm —
// dump writes documents.content verbatim, so the line numbers a worker saw in
// its Read output map exactly onto stored content.
function lineStarts(doc) {
  if (doc.lineStarts) return doc.lineStarts;
  const a = [0];
  for (let i = doc.content.indexOf("\n"); i !== -1; i = doc.content.indexOf("\n", i + 1))
    a.push(i + 1);
  // A trailing newline opens an empty segment cat -n never shows; counting it
  // would let workers cite a phantom line and skew the out-of-range message.
  if (a.length > 1 && a[a.length - 1] === doc.content.length) a.pop();
  return (doc.lineStarts = a);
}

// Lines are positional, so no twin-passage ambiguity — but a bare range
// verifies nothing, hence `has`: the claim's load-bearing fragment must appear
// inside the sliced lines. A transposed range fails loudly instead of quietly
// citing the wrong clause.
function resolveLines(doc, lines, has) {
  const [first, last] = lines;
  const starts = lineStarts(doc);
  if (first < 1 || last < first)
    die(`lines must be [first, last] with 1 <= first <= last, got [${first}, ${last}]`);
  if (last > starts.length)
    die(`lines [${first}, ${last}] out of range — this document has ${starts.length} lines`);
  const s = starts[first - 1];
  // End of line `last`: its terminating newline, or EOF.
  const nl = doc.content.indexOf("\n", starts[last - 1]);
  const e = nl === -1 ? doc.content.length : nl;
  if (e - s > SPAN_CAP)
    die(
      `lines [${first}, ${last}] span ${e - s} chars; cap is ${SPAN_CAP}. Narrow to the passage's own lines.`,
    );
  // spanSupportsQuote matches words in order, not contiguously — that's what
  // lets a table-row has ("B-3 14%") match a whitespace-columned line. A has
  // with no matchable tokens would fail every range; name that separately so
  // the worker fixes the fragment, not the range.
  if (!citeTokens(has).length)
    die(
      `'has' contains no verifiable characters (letters, digits, %, $) — pick a fragment with words or numbers from the passage`,
    );
  const text = doc.content.slice(s, e);
  if (!spanSupportsQuote(text, has))
    die(
      `'has' words not found in order within lines ${first}-${last} — the range points somewhere else. Content there starts: ${ctxWindow(doc.content, s + 150)}`,
    );
  return { span: [s, e], text };
}

// The content snippet below goes only to the local invoking process, which
// already has unrestricted read access to this document via sql/dump — no
// boundary is crossed. Do not route cite errors to any shared or remote sink.
function dieQuoteNotFound(content, nearOff) {
  const hint =
    nearOff !== undefined ? ` Content near offset ${nearOff}: ${ctxWindow(content, nearOff)}` : "";
  die(
    `cite: quote not found, even after whitespace/quote normalization. For non-contiguous content (tables, reflow): write an audits row (kind='citation_judge') attesting the values are present, then retry with the span and audit id.${hint}`,
  );
}

// Sized to the cite cap: one finding can cite several documents, and anything
// smaller evicts on every mint. Content is sha256-pinned, so re-deriving the
// surrogate index / norm / line starts per cite is pure waste.
const docCache = [];

function loadDoc(docId) {
  const i = docCache.findIndex((d) => d.docId === docId);
  if (i >= 0) {
    // Promote: eviction must take the cold doc, not the hot one a
    // multi-cite finding keeps returning to.
    const [hit] = docCache.splice(i, 1);
    docCache.unshift(hit);
    return hit;
  }
  const doc = db.prepare(`SELECT content, sha256 FROM documents WHERE id = ?`).get(docId);
  if (!doc) die(`cite: unknown doc_id ${docId}`);
  // A placeholder is technically citable — it IS documents.content — which is
  // exactly why it must be refused here, at the one gate every citation
  // passes. Checked on content, not parse_status, so legacy rows with a NULL
  // status are caught too.
  if (isPlaceholder(doc.content))
    die(
      `cite: doc ${docId} has no extracted text (its content is an extraction placeholder) — it cannot back a citation. Route it to the triage visual pass instead.`,
    );
  // Sorted UTF-16 indices of high surrogates — one per astral code point.
  const surrogates = [];
  for (let k = 0; k < doc.content.length; k++) {
    const unit = doc.content.charCodeAt(k);
    if (unit >= 0xd800 && unit <= 0xdbff) surrogates.push(k);
  }
  const entry = { docId, sha256: doc.sha256, content: doc.content, surrogates };
  docCache.unshift(entry);
  if (docCache.length > MAX_CITES) docCache.pop();
  return entry;
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
  // Line-resolved spans arrive already located; the quote is the document's
  // own slice at [s,e), so re-running locate() over the whole document would
  // only rediscover what is true by construction (the DB trigger re-verifies).
  if (opts.resolved) return ins("exact", quote, opts.resolved[0], opts.resolved[1], null);
  const nearOff = opts.near ?? opts.span?.[0];
  const span = locate(doc.content, quote, nearOff, normOf(doc));
  // Store the canonical slice: on a normalized match the worker's quote differs
  // in whitespace/punctuation, and citations.quote must be verbatim content.
  if (span) return ins("exact", doc.content.slice(span[0], span[1]), span[0], span[1], null);
  if (opts.span && opts.audit) {
    const [s, e] = opts.span; // UTF-16, from the caller's own reading; converted in ins()
    if (e - s > SPAN_CAP)
      die(`cite: span is ${e - s} chars; cap is ${SPAN_CAP}. Narrow to the passage.`);
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
// ONE citation. doc_id belongs here, not on the finding: `findings` has no
// doc_id column and never did. A finding rests on one span or several — a
// contradiction cites both clauses, across documents if it spans an amendment
// — which finding_citations has always modelled.
// `has` is looser here than at the wire on purpose: a wire violation fails the
// whole call, while this rejects the one row (see findMany).
const citeSchema = {
  type: "object",
  required: ["doc_id"],
  properties: {
    doc_id: { type: "integer" },
    quote: { type: "string", minLength: 1 },
    lines: spanSchema,
    has: { type: "string", minLength: 4 },
    near: { type: "integer" },
    span: spanSchema,
    audit: { type: "integer" },
  },
};
const findRowSchema = {
  type: "object",
  required: ["kind", "claim", "cites"],
  properties: {
    kind: { type: "string", enum: ["finding", "unknown"] },
    claim: { type: "string" },
    cites: { type: "array", items: citeSchema, minItems: 1, maxItems: MAX_CITES },
  },
};
const findSchema = {
  type: "object",
  required: ["run_id", "brief_id", "round", "worker", "kind", "claim", "cites"],
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

// No transaction of its own — callers own it (find wraps one row in tx,
// findMany savepoints each). Without that, a failed findings insert leaves the
// citation behind with a non-NULL brief_id that drop's orphan sweep never
// reclaims.
function mintOneCite(briefId, by, c) {
  if (c.quote !== undefined) {
    if (c.lines !== undefined || c.has !== undefined)
      die(`pass exactly one citation form — quote, or lines+has`);
    return mintCitation(c.doc_id, briefId, by, c.quote, {
      near: c.near,
      span: asSpan(c.span),
      audit: c.audit,
    });
  }
  if (c.lines === undefined || c.has === undefined)
    die(
      `cite with quote, or with BOTH lines: [first, last] AND has (a fragment from the claim that must appear in those lines)`,
    );
  // Silently dropping any of these would teach workers a field that does
  // nothing (near) or break judged-citation provenance (span/audit).
  if (c.span !== undefined || c.audit !== undefined || c.near !== undefined)
    die(`near/span/audit belong to quote citations — lines locate themselves`);
  const doc = loadDoc(c.doc_id);
  const { span, text } = resolveLines(doc, c.lines, c.has);
  return mintCitation(c.doc_id, briefId, by, text, { resolved: span });
}

function findCore(m) {
  // Mint every cite BEFORE the finding: the enclosing tx/savepoint would roll a
  // stray finding back anyway, but failing first keeps the error about the
  // citation rather than the insert.
  const minted = [];
  for (const [i, c] of m.cites.entries()) {
    try {
      minted.push(mintOneCite(m.brief_id, m.worker, c));
    } catch (e) {
      // Say which cite failed and prefix like every other find error: with
      // several spans per finding, an unlabelled error sends the worker to fix
      // the wrong one.
      const which = m.cites.length > 1 ? `cites[${i}] (doc ${c.doc_id}): ` : "";
      die(`find: ${which}${e.message ?? e}`);
    }
  }
  const f = db
    .prepare(
      `INSERT INTO findings (run_id,brief_id,round,worker,kind,claim) VALUES (?,?,?,?,?,?) RETURNING id`,
    )
    .get(m.run_id, m.brief_id, m.round, m.worker, m.kind, m.claim);
  const link = db.prepare(`INSERT INTO finding_citations (finding_id,citation_id) VALUES (?,?)`);
  for (const c of minted) link.run(f.id, c.id);
  // One entry per cite, in the order given: `start_off` is what a worker checks
  // when a quote repeats, and reporting only the first cite's would leave every
  // later one unverifiable.
  return {
    finding_id: f.id,
    cites: minted.map((c) => ({ citation_id: c.id, kind: c.kind, start_off: c.start_off })),
  };
}

/** Record one finding with its citation(s). m: run_id, brief_id, round, worker, kind, claim, cites: [{doc_id, quote | lines+has}, …]. */
export function find(m) {
  return tx(() => findCore(m));
}

/** Many findings, partial success: each row runs in its own savepoint through
 *  the SAME path as the single form. Good rows commit; bad rows come back in
 *  `rejected` with their index and error. ctx: run_id, brief_id, round, worker. */
export function findMany(ctx, rows) {
  if (!rows.length) die(`find: rows is empty`);
  return tx(() => {
    const inserted = [];
    const rejected = [];
    rows.forEach((raw, index) => {
      db.exec("SAVEPOINT find_row");
      try {
        // Validate INSIDE the per-row savepoint: a schema-invalid row must
        // reject that row, never fail the batch — 49 good findings dying for
        // one bad field breaks the documented partial-success contract.
        const r = checkFindRow(raw);
        const res = findCore({ ...ctx, ...r });
        db.exec("RELEASE find_row");
        inserted.push({ index, ...res });
      } catch (e) {
        db.exec("ROLLBACK TO find_row");
        db.exec("RELEASE find_row");
        rejected.push({
          index,
          doc_ids: raw?.cites?.map((c) => c?.doc_id),
          error: String(e.message ?? e),
        });
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
    for (const r of all) {
      try {
        stmt.run(r.scope_id, r.doc_id, r.worker, r.status, r.note ?? null);
      } catch (e) {
        // Raw "FOREIGN KEY constraint failed" tells a worker nothing about
        // which id was wrong or what to do next.
        die(
          `coverage: could not stamp scope ${r.scope_id} / doc ${r.doc_id} — ${String(e.message ?? e)}. Both must exist: the scope_id is the one in your prompt, and the doc_id must be a document in it.`,
        );
      }
    }
    return { ok: true, stamped: all.length };
  });
}

// ---------------------------------------------------------------------------

/** Forget cached document text. The run machinery calls this on drop: a
 *  deleted doc id can be reused by a re-ingest, and a stale entry would then
 *  verify a citation against the wrong document. */
export function forgetDocs() {
  docCache.length = 0;
}
