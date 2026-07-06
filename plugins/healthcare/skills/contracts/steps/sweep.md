# Sweep

Scope already happened. Every scoped document gets full-read; workers never skip, never block, never guess. Cost is not a concern; wall-clock is — fan wide.

## Shard

```
sql: SELECT sd.doc_id, v.uri, v.family, v.chars
     FROM scope_documents sd
     JOIN v_corpus_documents v ON v.id=sd.doc_id
      AND v.corpus=(SELECT corpus FROM runs WHERE run_id='<RUN_ID>')
     WHERE sd.scope_id=<s> ORDER BY sd.rank
```

Aim for **ten shards — one wave**: ten spawns in one message run concurrently, and an eleventh queues until a slot frees. Queuing is fine — with 100 documents, 25 shards of 4 run as waves and all complete; **never fatten shards past ~4 documents just to stay under ten**, that trades parallelism you have for a cap that doesn't exist. Fewer documents than ten? One shard each.

## Materialize shard text

Call `dump` **once**, with every shard *and the rubric*:

```
dump({ run_id, brief_id, round, scope_id,
       rubric: "<the brief's rubric, verbatim>",
       shards: [{label:"s00", doc_ids:[1,2,3,4]}, {label:"s01", doc_ids:[…], hunter:true}, …] })
```

It writes each document to a file and each shard's **ready-made worker prompt** (rubric + that shard's doc lines) to `prompt_path`. Give it the rubric — if you don't, you end up retyping the whole rubric into ten agent prompts, and emitting those thousands of tokens takes longer than the reading does.

## Rounds

Round 0 is the first sweep. Any later re-sweep (a correction after the answer, a widened scope) starts with `set runs <RUN_ID> round <n+1>` so findings and coverage attribute to the right pass; a rescue of missing docs stays in the CURRENT round.

## Launch

**Name the spawns for the user, not the log.** The Agent call's `description` shows as a card in some UIs — write it as what a person sees: `Reading contracts 1–4`, `Reading contracts 5–8`. Never "shard", never worker labels like s06 — those stay inside the prompt file where only the reader sees them.



Spawn **one `healthcare:documents-reader` per shard, all in a single message, as plain BLOCKING parallel Agent calls — never `run_in_background`**. Blocking is the barrier you need: reconciliation and the answer both wait on every reader, and backgrounded readers have died into the void before — this exact failure has happened. The user sees the spawns as tool activity; that is progress display enough.Each prompt is short, because the prompt file holds the rubric. **Default to the shard_prompt variant below** — it works everywhere. Use the paths variant ONLY when you are certain your contracts tools are local (their names start with `mcp__plugin_healthcare_Contracts_Analyzer__`, no bridge prefix): a wrongly-pathed bridged reader burns five failed Reads plus retries; a local reader on the safe variant pays one extra tool call.

**Paths variant (provably local only)** — list the shard's document paths (from `dump`'s `written[]`) so the reader's first message reads everything in one parallel turn:

```
In your FIRST message, Read ALL of these in parallel — your instructions and every document:
<prompt_path>
<doc path 1>
<doc path 2>
…
Then follow those instructions exactly — the worker string, the rubric, and the TURN PLAN.
If the files won't open, call shard_prompt(run_id="<RUN_ID>", label="<label>") — its TURN PLAN includes the no-filesystem flow.
Never sweep without your rubric.
```

**shard_prompt variant (the default)** — no file paths:

```
Call shard_prompt(run_id="<RUN_ID>", label="<label>") and follow it exactly — the worker string, the rubric, and the TURN PLAN's no-filesystem flow. Do not try to Read file paths; they are on another machine.
Never sweep without your rubric.
```

## Rescue

**Rescue only what's missing — never re-read what's covered.** After the readers return, get the gap list first: `sql`: `SELECT doc_id FROM scope_documents sd JOIN scopes s ON s.id=sd.scope_id WHERE s.run_id='<RUN_ID>' AND doc_id NOT IN (SELECT doc_id FROM shard_coverage sc JOIN scopes s2 ON s2.id=sc.scope_id WHERE s2.run_id='<RUN_ID>')`. If it's empty, done. If not, re-shard ONLY those doc_ids and spawn readers for them — **in a wave of at most 5**: several readers dying at once usually means the environment itself buckled (a VM crash has done exactly this), and throwing ten fresh agents at a machine that just fell over repeats the failure. One rescue round; if gaps remain after it, report them honestly in the run rather than looping.

## After

Workers wrote directly; nothing to merge. Reconcile coverage — run this and the Rescue gap query together, ONE `sql` call with both in the query array:

```
sql: SELECT * FROM v_coverage_gaps WHERE run_id='<RUN_ID>'
```

Everything's a gap → the spawns failed outright; read the error and re-spawn. Partial gaps → a worker crashed mid-shard; spawn one reader for the missing doc_ids. No gaps → proceed to `triage`.
