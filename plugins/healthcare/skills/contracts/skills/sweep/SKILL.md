---
name: sweep
description: Fan out over the scoped document set via the saved sweep workflow. Workers full-read their shard and write findings + citations directly via cli.ts. Recall over precision — never skip a scoped doc.
---

# Sweep

Scope already happened. Every scoped document gets full-read; workers never skip, never block, never guess. Cost is not a concern; wall-clock is — fan wide.

## Shard

```
bun <CLI> sql "SELECT sd.doc_id, v.uri, v.family, length(v.content) AS chars
               FROM scope_documents sd
               JOIN v_corpus_documents v ON v.id=sd.doc_id
                AND v.corpus=(SELECT corpus FROM runs WHERE run_id='<RUN_ID>')
               WHERE sd.scope_id=<s> ORDER BY sd.rank"
```

Shard count: target the Workflow concurrency cap — currently `min(16, cpu cores − 2)`, floor 1 (`getconf _NPROCESSORS_ONLN`; if unsure, use 16) — or one shard per document when there are fewer docs than the cap. **Balance shards by total chars**, not doc count (the query returns chars) — the heaviest shard is the straggler everyone waits on. Keep families together (a worker reading a base contract should also read its amendments). Hard ceiling ~300k chars per shard (a worker holds its whole shard in context): when the corpus doesn’t fit in cap-many shards under the ceiling, make more — queued shards beat overflowed context. A single long document (>~150k chars) gets its own shard marked `hunter:true` (greps for the brief’s terms; doesn’t read linearly).

## Launch

Call the saved workflow by path — **do not author a script inline**. Everything run-specific goes in `args` (a JSON object **value**, not a string):

```
Workflow({
  scriptPath: "<ROOT>/workflows/sweep.js",
  args: {
    cli:      "<CLI>",
    run_id:   "<RUN_ID>",
    brief:    <brief_id>,
    round:    <round>,
    scope_id: <scope_id>,
    model:    "<worker model — omit for the default (opus); set from $ANT_CONTRACTS_MODEL_WORKER if the user exported it, e.g. 'claude-sonnet-5'>",
    rubric:   "<the brief's rubric, verbatim>",
    rules:    "<content of <ROOT>/workflows/reader.md — Read it verbatim>",
    shards:   [{label:"s00", doc_ids:[1,2,3]}, {label:"s01", doc_ids:[4,5], hunter:true}, …]
  }
})
```

The script handles the reader prompt, schema, and rescue pass. If you need to deviate (different rules, custom rescue logic), Read `<ROOT>/workflows/sweep.js`, edit a copy, and pass that as `script` instead — but default to the saved one.

## After

Workers wrote directly; nothing to merge. Reconcile coverage:

```
bun <CLI> sql "SELECT * FROM v_coverage_gaps WHERE run_id='<RUN_ID>'"
```

Everything's a gap → the workflow died at launch; re-call it. Partial gaps → some workers crashed; launch a small targeted Workflow for those doc_ids. No gaps → proceed to `queue-triage`.
