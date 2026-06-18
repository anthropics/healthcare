---
name: queue-triage
description: After a sweep round, dedupe and triage worker unknowns into the human queue. Self-resolve the obvious (visibly); blocking items end the round.
---

# Queue triage

Workers return `findings` with `kind='unknown'` for anything they couldn't
resolve. Your job: roll those up into a small, useful set of questions.

```
bun $ANT_CONTRACTS_CLI sql "SELECT id,worker,claim FROM findings WHERE run_id='$ANT_CONTRACTS_RUN_ID' AND round=<r> AND kind='unknown'"
```

## Dedupe

Many workers hit the same ambiguity ("does §4.2 in amendment 3 supersede
the base or only the prior amendment?"). One queue item, not twelve. Group
by what's actually being asked, not by which document raised it.

## Self-resolve

If the answer is obvious from the corpus, the brief, or ratified knowledge,
resolve it yourself — but **visibly**:

```
bun $ANT_CONTRACTS_CLI write queue_items '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","brief_id":<b>,"round":<r>,"question":"…","context":"…","blocking":0,"status":"self_resolved","answer":"…","answered_by":"agent"}'
```

The trigger requires `answered_by` on self-resolved items. Provenance is
the point — a human reviewing the run sees what you decided and why.

## What goes to the human

Genuine ambiguity the corpus can't resolve and you shouldn't guess. State
the question plainly, give the options you see, and link the citation that
shows the ambiguity. Mark it `blocking:1` only if the answer changes what
the next sweep round reads or how findings are interpreted. No drama.

```
bun $ANT_CONTRACTS_CLI write queue_items '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","brief_id":<b>,"round":<r>,"question":"…","context":"…","blocking":1}'
bun $ANT_CONTRACTS_CLI write queue_citations '{"queue_item_id":<q>,"citation_id":<c>}'
```

## End the round

If any open blocking item exists → `set runs $ANT_CONTRACTS_RUN_ID status awaiting_human`
and return. Otherwise continue to synthesize.
