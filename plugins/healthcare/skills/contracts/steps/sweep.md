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



Spawn **one reader per shard (the agent type comes from the variant below), all in a single message, as plain BLOCKING parallel Agent calls — never `run_in_background`**. Blocking is the barrier you need: reconciliation and the answer both wait on every reader, and backgrounded readers have died into the void before — this exact failure has happened. The user sees the spawns as tool activity; that is progress display enough.Each prompt is short, because the prompt file holds the rubric. **Pick ONE variant by the transport you chose in SKILL.md 1b** — the labels below are exclusive, there is no separate default:

**CLI mode** — spawn `general-purpose` agents, not `healthcare:documents-reader` (the reader agent deliberately has no Bash; a shell goes only where the transport needs one). Use the paths variant with the reader rules file added, plus the CLI line:

```
In your FIRST message, Read ALL of these in parallel — your role, your instructions, and every document:
<plugin>/agents/documents-reader.md   (this is your role — follow it exactly)
<prompt_path>
<doc path 1>
…
No contracts tools are in your list: run each one as `node <engine path> <tool> '<json>'` via Bash — stdout is the result JSON, exit 1 + stderr is the error.
Never sweep without your rubric.
```

**MCP, provably local** (tool names start `mcp__plugin_healthcare_Contracts_Analyzer__`, no bridge prefix) — spawn `healthcare:documents-reader` with the paths variant, so the reader's first message reads everything in one parallel turn:

```
In your FIRST message, Read ALL of these in parallel — your instructions and every document:
<prompt_path>
<doc path 1>
…
Then follow those instructions exactly — the worker string, the rubric, and the TURN PLAN.
If the files won't open, call shard_prompt(run_id="<RUN_ID>", label="<label>") — its TURN PLAN includes the no-filesystem flow.
Never sweep without your rubric.
```

**MCP, bridged or unsure** — spawn `healthcare:documents-reader` with the shard_prompt variant; a wrongly-pathed bridged reader burns five failed Reads plus retries, while this variant costs one extra tool call:

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

Everything's a gap → the spawns failed outright; diagnose from the reply lines (`shard=<label> status=…`, with any coverage-failure reason appended) plus `shard_coverage` notes (`status='error'` rows carry the reason). All-error replies with NO coverage rows at all means the environment or bridge died — apply the Rescue wave-of-≤5 rule, don't re-spawn ten. Partial gaps → a worker crashed mid-shard; spawn one reader for the missing doc_ids. No gaps → proceed to `triage`.
