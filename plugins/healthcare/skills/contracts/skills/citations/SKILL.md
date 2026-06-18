---
name: citations
description: How to mint a citation. Every fact FKs to a citations row; citations verify against documents.content (never disk) at insert time and are immutable after.
---

# Citations

```
bun $ANT_CONTRACTS_CLI cite <doc_id> <brief_id> <by> - [start end] [--near <off>] <<'Q'
<quote>
Q
```

Quote goes on **stdin** (the `-` arg) via a **quoted heredoc** — the
`'Q'` quotes disable all shell expansion, so `$500,000`, `$(…)`,
backticks, `"Term"`, `it's` survive unchanged. `--near <offset>` picks the occurrence
closest to where you were reading — pass it whenever the quote is short
or boilerplate. `created_by` is your worker label. The trigger
re-verifies on insert; a bad cite ABORTs.

Sweep workers: prefer `bun $ANT_CONTRACTS_CLI find` (see the sweep skill) — it
does cite + finding + link in one transaction.

## Two paths

- **Exact** — the quote is a contiguous substring of `documents.content`.
  Don't supply offsets; `cite` locates it. Aim for this — quote what's
  literally there, including the document's whitespace and quote marks.
- **Judged** — tables, two-column definition schedules, anything where
  the contiguous string genuinely doesn't exist. **You** verify, then cite:
  spawn an Agent with `model: "haiku"`, pass the span and the quote, prompt
  *"Is every value/label/term in QUOTE faithfully present in PASSAGE with
  the same meaning? Paraphrases are NOT present. Reply {present, reason}."*
  If present, write the verdict:
  ```
  bun $ANT_CONTRACTS_CLI write audits '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","kind":"citation_judge","result":"<reason, one line>"}'
  ```
  then re-cite with the span and `--audit <id>`. The trigger requires that
  audit FK for `kind='judged'`.

## What makes a good quote

- **Verbatim from the document.** Not your summary of it.
- **Complete.** A definition or enumeration ending in a colon followed by
  (a)/(b)/(i) sub-items — quote **through** the sub-items. Stopping at the
  colon omits the operative content and is useless evidence.
- **Self-locating.** Include enough surrounding words that the quote is
  unambiguous in the document (a bare "5.5%" appears in fifty places).
- **The right family.** A clause from another deal's copy of shared
  template terms is the wrong source for deal-specific figures, even if
  the wording matches. Cite from the target family's own documents.

## After minting

`cite` returns `{id, kind, start_off, end_off}`. Link it:

```
bun $ANT_CONTRACTS_CLI write finding_citations '{"finding_id":<f>,"citation_id":<c>}'
```

(or `queue_citations` / `claim_citations` / `knowledge_citations` as fits.)
