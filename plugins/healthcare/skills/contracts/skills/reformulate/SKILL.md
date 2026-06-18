---
name: reformulate
description: Turn the user's question into a versioned BRIEF (rubric, stated assumptions, done-criteria, scope intent). Use before any sweep. Consults the knowledge index and may pre-scan a few documents to sharpen terms.
---

# Reformulate → brief

A user question like "where are we paying different terms for the same
thing?" is not yet answerable. Your job is to make it precise enough that
independent workers reading different documents will agree on what counts.

## Inputs to consult

```
bun $ANT_CONTRACTS_CLI sql "SELECT fact FROM knowledge WHERE corpus=(SELECT corpus FROM runs WHERE run_id='$ANT_CONTRACTS_RUN_ID') AND status='ratified'"
bun $ANT_CONTRACTS_CLI sql "SELECT id,uri,family,publisher,category,dated,summary FROM v_corpus_documents WHERE corpus=(SELECT corpus FROM runs WHERE run_id='$ANT_CONTRACTS_RUN_ID') LIMIT 200"
```

Read a small handful of likely-relevant documents (grep `documents.content`
or the disk cache) to learn the corpus's vocabulary before fixing terms.
This is a pre-scan, not the sweep. **When the question names the contract
by ID/URI**, the pre-scan is just doc-identity + a cross-reference grep
("does anything else amend this?") — don't pre-read the answer clauses
the sweep is about to extract.

**Granted-right vs boilerplate.** When an enumeration asks "which
contracts have/can [X]" where X is a right or option (renewal option,
termination-for-convenience, audit right, price-review), the rubric must
require X is **granted as a defined mechanism** — a named option, a
stated term length/count, an exercise procedure. A clause of the form
"[X] is not automatic; any [X] requires a written amendment signed by
both parties" is the general amendment clause restated, **not** a grant
of X — classify it as no-[X]-provision. Give workers the discriminator:
does the clause define what the renewed/exercised term *is* (length,
count, carryover), or only how one would be created?

## The brief

Four parts, no schema beyond the table columns:

- **Rubric** — the comparison/judgment rules workers apply. What identity
  must be resolved before comparing? What supersedes what (amendments win)?
  When does a worker return `unknown` instead of guessing?
- **Assumptions** — what you're treating as true that the user could
  correct. Active contracts only? A specific date window? A SKU treated as
  identical across vendors?
- **Done criteria** — what makes the run complete. Be concrete enough that
  you'll know when to stop sweeping.
- **Scope intent** — which slice of the corpus likely holds the answer,
  stated as an assumption ("Ohio Medicaid managed-care families, 2018-2024")
  the user can correct. The scope step turns this into the actual read set.

## Write it

```
bun $ANT_CONTRACTS_CLI write briefs '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","version":<n>,"rubric":"…","assumptions":"…","done_criteria":"…","scope_intent":"…"}'
```

Prior versions stay; write a new `version` when queue answers change the
question. Every finding/citation downstream carries `brief_id`, so we always
know which version of the question an answer was answering.

## Clarifications go to the queue

If the question is genuinely ambiguous in a way the corpus can't resolve,
write a blocking queue item with the ambiguity stated plainly and the
options you see. Don't dramatize; don't ask what's already obvious.

```
bun $ANT_CONTRACTS_CLI write queue_items '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","brief_id":<id>,"round":0,"question":"…","context":"…","blocking":1}'
```
