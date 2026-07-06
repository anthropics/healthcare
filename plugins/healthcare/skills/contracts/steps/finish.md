# Finish: synthesize, harvest

## Gather

**Never dump every finding into context.** Get counts first, then pull what you need:

```
sql: SELECT kind, count(*) FROM findings WHERE run_id='<RUN_ID>' GROUP BY kind
```

For the per-doc tally, write a script (Bash) that queries and writes the projection to a scratch file — read THAT. Only SELECT `claim`/`quote` for the specific findings you're putting in the report.

## Analyze with scripts, not in your head

For anything beyond reading — counts, joins, comparisons, tallies — the findings are already in SQL; most analysis is a `sql` SELECT. If you need more reading, spawn readers the same way the sweep does.

## Compose the answer — in chat, once

There is no report file and no reports row: **your chat message is the answer**, composed from the verified findings, and it streams to the user as you write it. Pull only what you need (never every finding at once), and pull it in ONE `sql` call — the judgment-calls query and the findings query together in the array: `sql`: `SELECT f.id, f.kind, f.claim, c.quote, cd.uri FROM findings f LEFT JOIN finding_citations fc ON fc.finding_id=f.id LEFT JOIN citations c ON c.id=fc.citation_id LEFT JOIN corpus_documents cd ON cd.doc_id=c.doc_id AND cd.corpus=(SELECT corpus FROM runs WHERE run_id='<RUN_ID>') WHERE f.run_id='<RUN_ID>'` — projected through a script to a scratch file if it's large.

**Structure for scanning.** The message opens with the 3–6 sentence conclusion in plain English, then a one-line stat summary (the counts that answer the question), then judgment calls (each `self_resolved` queue item: what was ambiguous, the reading you chose, why), then a table per enumeration — one row per contract: classification, the operative number, a SHORT verbatim quote. Prose only where a table can't carry it.

**Faithfulness is a hard rule with no trigger behind it anymore:** every fact you state must appear in a findings row, and every quote must be copied verbatim from its citation — you are composing, not remembering. If you want to say something no finding supports, it isn't in the answer.

## Right-sized answer

A 40-contract comparison lands well around 6–10k characters of chat; past that you are narrating the tables — stop.

## Declare done

The moment your chat answer is composed and sent: `set runs <RUN_ID> status done`. Nothing gates it — the findings were verified at insert, and the answer came from them.

## Knowledge harvest

The knowledge index informs future reformulations. Auto-ratification is a feedback loop (one wrong fact biases every future brief that reads it), so you **propose**; a human **ratifies**. You never ratify yourself.

**Skip harvest entirely** when: (a) single-doc fact-lookup with a correct answer — there's no cross-doc structure to learn; or (b) the candidate fact is already verbatim in this run's brief or scope rationale.

**Check what's already there** before proposing (`sql: SELECT fact FROM knowledge WHERE corpus='<corpus>'` — fold this into the gather call's query array) — don't propose a near-duplicate.

Worth proposing: durable facts about the corpus that a future run would want during reformulation — "Ohio NextGen contracts use 'prompt pay' not 'clean claim' for the §4.2 timing clause"; "Acme amendments are cumulative, not replacing". Not findings about the question — those live in the report.

`write` the `knowledge` row (with `source_run_id`) + a `knowledge_citations` link, then surface it for ratification via the queue: `write` a non-blocking `queue_items` row whose `question` is the fact itself, stated as a plain declarative — NOT wrapped in "Ratify …?" — and whose `context` is "Proposed knowledge entry #<k> from this run — ratify or reject. Cites <doc.uri>." State facts positively; avoid double negatives.

