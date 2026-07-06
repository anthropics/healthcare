# Citations

Every fact FKs to a `citations` row; citations verify against `documents.content` (never disk) at insert time and are immutable after. The `cite` tool mints them — **batch with `rows` when composition needs several** (they come back as `{minted, rejected}` with per-row errors; resend only the rejected). Sweep workers use `find`, which does cite + finding + link per row in one call.

## Two paths

- **Exact** — the quote is a contiguous substring of `documents.content` (whitespace runs, NBSP, curly-vs-straight quotes, and dashes are normalized for matching; the stored quote is the document's own text). Don't supply offsets; the tool locates it — pass `near` when the quote is short or boilerplate. Aim for this.
- **Judged** — tables, two-column definition schedules, anything where the contiguous string genuinely doesn't exist. **You** verify, then cite — and judged citations cluster, so run the cluster together: spawn ALL the judge Agents in ONE message (`model: "haiku"`, each passed its span and quote, prompt *"Is every value/label/term in QUOTE faithfully present in PASSAGE with the same meaning? Paraphrases are NOT present. Reply {present, reason}."*). For the present ones, ONE `write` (`table: "audits"`, `rows`: each `kind: "citation_judge"`, `result`: the reason, one line), then ONE `cite` call (`rows`: each with its `span` and `audit: <id>`). The trigger requires that audit FK for `kind='judged'`.

## What makes a good quote

- **Verbatim from the document.** Not your summary of it.
- **Complete.** A definition or enumeration ending in a colon followed by (a)/(b)/(i) sub-items — quote **through** the sub-items. Stopping at the colon omits the operative content and is useless evidence.
- **Self-locating.** Include enough surrounding words that the quote is unambiguous in the document (a bare "5.5%" appears in fifty places).

## After minting

`cite` returns `{id, kind, start_off, end_off}` (batch form: `minted` carries them per row). Link them in ONE `write` (`rows`) to `finding_citations` / `queue_citations` / `knowledge_citations` as fits.
