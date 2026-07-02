**SEARCH FIRST.** Grep each document ONCE with a combined alternation of the rubric’s key terms (synonyms, legal phrasings, spelled-out numbers) — e.g. `grep -binE "renew|evergreen|non-renewal|sixty \(60\)"` — and read windows around the hits. One wide grep beats many narrow ones; add a follow-up grep only when a hit points at a term you didn’t cover. Linear reading is the fallback, not the strategy.

**PARTIAL FACTS ARE FINDINGS.** This document holds one side of a comparison? Emit that side. The tally happens downstream, never in your head. For census/aggregate questions, this document's contribution IS a finding with a quote.

**ABSENCE DISCIPLINE.** Never claim “doesn’t specify X” without one FULL-content grep whose alternation covers the phrasings (digits AND spelled-out). That single search is sufficient evidence of absence — don’t re-verify hit-by-hit or re-grep term-by-term. Record the pattern you used in `note`.

**COMPLETE QUOTES.** Definitions/enumerations ending in a colon: quote through the (a)/(b)/(i) sub-items. Stopping at the colon is useless.

**WRITE AS YOU GO, IN BATCHES.** One `find` per fact — quote on stdin via a quoted heredoc (the `'Q'` quotes disable all shell expansion, so `$500,000`, `$(…)`, backticks, `"`, `'` survive unchanged), metadata as JSON. It mints citation+finding+link in one transaction. When you finish a document, emit ALL its `find` calls as parallel tool calls in ONE message — every call you hold back for its own turn adds a full model round-trip, and those round-trips, not the reading, dominate sweep wall-clock. On a very long document, flush every ~10 finds instead of holding everything to the end. If one call errors (quote not verbatim), retry just that one next turn.

```
<CLI> find '{"run_id":"<RUN_ID>","brief_id":<BRIEF>,"round":<ROUND>,"doc_id":<d>,"worker":"sweep:<LABEL>","kind":"finding","claim":"<one factual statement>","near":<offset>}' <<'Q'
<verbatim quote>
Q
```

`near` picks the occurrence closest to where you read it. The matcher tolerates whitespace runs, NBSP, curly-vs-straight quotes, and dashes — do NOT spend turns pre-verifying quotes byte-by-byte; just send what you read. For tables/columnar text where the quote isn't contiguous: spawn an Agent with `model: "haiku"` to verify the values are present in the span, write the audits row (`kind:"citation_judge"`), then add `"span":[s,e],"audit":<id>`. For ambiguity you can't resolve, use `"kind":"unknown"` with the quote that shows the ambiguity.

**STAMP COVERAGE.** After a doc’s finds have landed (check their results — the stamp asserts the doc is fully captured, so it must not ride in the same message as finds that might fail), stamp it; batch the stamp into your NEXT message’s calls:

```
<CLI> write shard_coverage '{"scope_id":<SCOPE>,"doc_id":<d>,"worker":"sweep:<LABEL>","status":"read"}'
```

If reading failed, use `"status":"error","note":"…"` instead.

Return `{doc_ids, findings:<n written>, unknowns:<n written>, note?}` — counts only; the db is the record.
