---
name: synthesize
description: After sweep rounds settle, turn findings into a report with cited claims, run a sampled semantic audit, and surface knowledge proposals. Analysis happens via scripts, never mental math.
---

# Synthesize

## Gather

**Never dump every finding into context.** Get counts first, then pull
what you need:

```
bun $ANT_CONTRACTS_CLI sql "SELECT kind, count(*) FROM findings WHERE run_id='$ANT_CONTRACTS_RUN_ID' GROUP BY kind"
```

For the per-doc tally, write a script (heredoc → bun) that reads
findings and writes the projection to `/tmp/tally.json` — read THAT.
Only `SELECT … claim, quote …` for the specific findings you're putting
in the report.

## Analyze with scripts, not in your head

For anything beyond reading — counts, joins, comparisons, tallies — write a
short script (Bash heredoc → bun, or a scratch SQLite db under `/tmp`) and
run it. The findings are already in SQL; most analysis is a `SELECT`. If you
need a second Workflow fan-out for analysis, launch one.

## Write the report

```
bun $ANT_CONTRACTS_CLI write reports '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","brief_id":<b>,"body":"…markdown…"}'
```

Then one `report_claims` row per factual statement in the body, each linked
via `claim_citations`. The `v_uncited_claims` view must be empty when you're
done — check it.

## Sampled semantic audit

**When scope was 1 doc, 1 worker, and every report cite was minted via
`cli cite` this session**: the gate already enforced quote==span. Sample
only the heading/subject context check; skip the byte-reverify. At
corpus scale, do the full audit — it's the distractor-clause guard.


A real quote can support the wrong claim (e.g. a bare "§4.2.4.1.11: 5.5%"
inserted by amendment has no topic — it's a savings percentage, not a
withhold). Sample your report claims and, for each, re-read the cited span
plus its surrounding section heading (and the base contract's parent section
when the cite is a bare amendment insertion). Does the section's subject
match the claim's subject? Is the cited document in the right family?

```
bun $ANT_CONTRACTS_CLI write audits '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","kind":"semantic_sample","sample_n":<n>,"result":"<json or prose>"}'
```

A failed audit means the claim is wrong — fix the report and re-audit.

## Recall sample

Check what scope excluded (computed, not something you set):

```
bun $ANT_CONTRACTS_CLI sql "SELECT * FROM v_scope_excluded WHERE run_id='$ANT_CONTRACTS_RUN_ID'"
```

If `excluded == 0`, write a trivial 0/0 audit row and stop — there's
nothing to sample. If the question named a single contract by ID and
reformulate's cross-ref grep already returned zero, the same applies.

Otherwise, full-read a random handful of the excluded set
against the brief. Search for the entity names, agreement/reference numbers,
section anchors, and defined terms you discovered DURING the sweep — not
just the original scope predicate (re-applying the same predicate to the
set it already excluded is circular and proves nothing). The point is to
catch documents the scope filter missed because it didn't yet know the
vocabulary. Book the miss rate:

```
bun $ANT_CONTRACTS_CLI write audits '{"run_id":"'$ANT_CONTRACTS_RUN_ID'","kind":"recall_sample","sample_n":<n>,"result":"{\"misses\":<m>,\"of\":<n>}"}'
```

## Finish

`set runs $ANT_CONTRACTS_RUN_ID status done`. Then follow `knowledge-harvest`.
