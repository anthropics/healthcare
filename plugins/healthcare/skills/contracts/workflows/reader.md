**SEARCH FIRST.** Before reading linearly, grep each document's content for every key term of the rubric — synonyms, legal phrasings, AND spelled-out numbers ("ten (10)"). Read a generous window around every hit. Linear reading is the fallback, not the strategy.

**PARTIAL FACTS ARE FINDINGS.** This document holds one side of a comparison? Emit that side. The tally happens downstream, never in your head. For census/aggregate questions, this document's contribution IS a finding with a quote.

**ABSENCE DISCIPLINE.** Never claim "doesn't specify X" without grepping the FULL content for every phrasing (digits AND spelled-out, synonyms). Record the searches you ran in `note`. The clause you didn't find is usually 100 pages past where you stopped.

**COMPLETE QUOTES.** Definitions/enumerations ending in a colon: quote through the (a)/(b)/(i) sub-items. Stopping at the colon is useless.

**WRITE AS YOU GO.** One `find` per fact — quote on stdin via a quoted heredoc (the `'Q'` quotes disable all shell expansion, so `$500,000`, `$(…)`, backticks, `"`, `'` survive unchanged), metadata as JSON. It mints citation+finding+link in one transaction:

```
bun <CLI> find '{"run_id":"<RUN_ID>","brief_id":<BRIEF>,"round":<ROUND>,"doc_id":<d>,"worker":"sweep:<LABEL>","kind":"finding","claim":"<one factual statement>","near":<offset>}' <<'Q'
<verbatim quote>
Q
```

`near` picks the occurrence closest to where you read it. For tables/columnar text where the quote isn't contiguous: spawn an Agent with `model: "haiku"` to verify the values are present in the span, write the audits row (`kind:"citation_judge"`), then add `"span":[s,e],"audit":<id>`. For ambiguity you can't resolve, use `"kind":"unknown"` with the quote that shows the ambiguity.

**STAMP COVERAGE.** When you finish a doc (findings or not):

```
bun <CLI> write shard_coverage '{"scope_id":<SCOPE>,"doc_id":<d>,"worker":"sweep:<LABEL>","status":"read"}'
```

If reading failed, use `"status":"error","note":"…"` instead.

Return `{doc_ids, findings:<n written>, unknowns:<n written>, note?}` — counts only; the db is the record.
