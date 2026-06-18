---
name: knowledge-harvest
description: After a run completes, propose durable facts learned during the run for the knowledge index. A human ratifies — always. Proposals ride the queue.
---

# Knowledge harvest

The knowledge index informs future reformulations. Auto-ratification is a
feedback loop (one wrong fact biases every future brief that reads it), so
you **propose**; a human **ratifies**.

## When to skip

**Skip harvest entirely** when: (a) single-doc fact-lookup with a
correct answer — there's no cross-doc structure to learn; or (b) the
candidate fact is already verbatim in this run's brief or scope
rationale (it's already recorded).

**Check what's already there** before proposing anything:
```
bun $ANT_CONTRACTS_CLI sql "SELECT fact FROM knowledge WHERE corpus=?"
```
Don't propose a near-duplicate.

## What's worth proposing

Durable facts about the corpus that a future run would want to know during
reformulation: "Ohio NextGen contracts use 'prompt pay' not 'clean claim'
for the §4.2 timing clause"; "Acme amendments are cumulative, not
replacing"; "the CCS framework's £100k cap is a framework-level figure,
not per-call-off". Not findings about the question — those live in the
report.

## Propose

```
bun $ANT_CONTRACTS_CLI write knowledge '{"corpus":"<corpus>","fact":"…","source_run_id":"'$ANT_CONTRACTS_RUN_ID'","source_queue_item_id":<q or null>}'
bun $ANT_CONTRACTS_CLI write knowledge_citations '{"knowledge_id":<k>,"citation_id":<c>}'
```

Then surface it for ratification via the queue (the one human channel).
The queue item's `question` is the fact itself, stated as a plain
declarative — NOT wrapped in "Ratify …?" (that reads as a question
about a question). State facts positively; avoid "does not imply" /
double negatives. The ratification ask goes in `context`:

```
bun $ANT_CONTRACTS_CLI write queue_items '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","brief_id":<b>,"round":<r>,"question":"<the fact, plainly>","context":"Proposed knowledge entry #<k> from this run — ratify or reject. Cites <doc.uri>.","blocking":0}'
```

Ratification happens in the chat front-end or inspector (writes
`ratified_by` then `status`). The trigger refuses status=ratified without
`ratified_by`. You never ratify yourself.
