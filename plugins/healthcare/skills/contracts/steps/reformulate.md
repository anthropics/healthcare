# Reformulate → brief

A user question like "where are we paying different terms for the same thing?" is not yet answerable. Your job is to make it precise enough that independent workers reading different documents will agree on what counts.

## Inputs to consult

ONE `sql` call, all three queries in the array:

```
sql: query: [
  "SELECT fact FROM knowledge WHERE corpus='<corpus>' AND status='ratified'",
  "SELECT id,uri,family,publisher,category,dated FROM v_corpus_documents WHERE corpus='<corpus>' LIMIT 200",
  "SELECT uri FROM v_corpus_documents WHERE corpus='<corpus>' AND parse_status IN ('empty','failed')"
]
```

Learn the corpus before fixing terms — **searches only, no full reads, ALL probes in ONE `doc_search` call** (`pattern` takes an array; results come back keyed per pattern). One probe per call spends eight model turns on one turn's work. A multi-part question still gets at most 5 probes — one per distinct concept, not one per phrasing. An eval showed domain reasoning alone writes a conceptually sound brief; what it cannot supply, and what two or three `doc_search` probes buy in ~20 seconds, is: **who "us" is** (the customer party's actual names across contracts — resolve this every time, the question never says), **where the target clauses live** (which headings, whether rates sit in exhibit tables), and **which traps are real here** (an anniversary-gated exit, a heading like "Client Coverage"). Do not call `doc_text` in this phase — readers will read everything soon enough; a full-document skim buys the plan almost nothing.

**Granted-right vs boilerplate.** When an enumeration asks "which contracts have/can [X]" where X is a right or option (renewal option, termination-for-convenience, audit right, price-review), the rubric must require X is **granted as a defined mechanism** — a named option, a stated term length/count, an exercise procedure. A clause of the form "[X] is not automatic; any [X] requires a written amendment signed by both parties" is the general amendment clause restated, **not** a grant of X — classify it as no-[X]-provision. Give workers the discriminator: does the clause define what the renewed/exercised term *is* (length, count, carryover), or only how one would be created?

## The brief

Four parts, no schema beyond the table columns:

- **Rubric** — the comparison/judgment rules workers apply. **Say what counts as a finding** ("one per contract: its cap, or that it's uncapped" / "every distinct rate, with its service"). Be honest with yourself about breadth: a comparison question needs every comparable fact extracted, and that's what makes it cost more than a lookup — say so in the cost line rather than under-extracting to look fast. What identity must be resolved before comparing? What supersedes what (amendments win)? When does a worker return `unknown` instead of guessing?
- **Assumptions** — what you're treating as true that the user could correct. Active contracts only? A specific date window? A SKU treated as identical across vendors?
- **Done criteria** — what makes the run complete. Be concrete enough that you'll know when to stop sweeping.
- **Scope intent** — which slice of the corpus likely holds the answer, stated as an assumption ("Ohio Medicaid managed-care families, 2018-2024") the user can correct. The scope step turns this into the actual read set.

Write it with the `write` tool (`table: "briefs"`). Prior versions stay; write a new `version` when queue answers change the question. Every finding/citation downstream carries `brief_id`, so we always know which version of the question an answer was answering.

## Clarifications go to the queue

If the question is genuinely ambiguous in a way the corpus can't resolve, `write` a blocking `queue_items` row with the ambiguity stated plainly and the options you see. Don't dramatize; don't ask what's already obvious.

## Parse gaps

The parse-status query already ran in the inputs batch above. Anything it listed did not extract into readable text — the sweep cannot see it. Name these documents in the plan message ("2 contracts didn't scan readably and are excluded: …") so the user knows the answer's blind spots before saying go.
