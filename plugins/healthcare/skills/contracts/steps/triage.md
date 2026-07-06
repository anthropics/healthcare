# Triage

Workers return `findings` with `kind='unknown'` for anything they couldn't resolve. Your job: resolve them yourself, visibly, and carry the honest residue into the report. **The run never stops to ask** — the one thing a human answers is the plan go-ahead, and that already happened.

```
sql: SELECT id,worker,claim FROM findings WHERE run_id='<RUN_ID>' AND round=<r> AND kind='unknown'
```

## Dedupe

Many workers hit the same ambiguity ("does §4.2 in amendment 3 supersede the base or only the prior amendment?"). One item, not twelve. Group by what's actually being asked, not by which document raised it.

## Resolve naively, on the record

For each ambiguity, make the most defensible call — the corpus's own words, the brief's assumptions, ratified knowledge, then plain convention (amendments supersede; specific beats general; when truly torn, the reading that claims less). Then book them ALL in two calls: one `write` (`table: "queue_items"`, `rows`: every item, each with `blocking: 0`, `status: "self_resolved"`, the `answer` you chose, `answered_by: "agent"` — the trigger requires it), then one `write` (`table: "queue_citations"`, `rows`) linking each item's citation using the ids the first call returned in order. Provenance is the point — a human reviewing the run sees every judgment call and what it rested on.

## Nothing blocks

Never write `blocking: 1` from triage. If an ambiguity is so load-bearing that a wrong call flips the answer, it still doesn't stop the run — it becomes the first line of the answer's "Judgment calls" section (see `finish`), stated plainly with both readings, so the human reviews it with the answer in hand instead of being interrupted without one.

## End the round

Continue to `finish`.
