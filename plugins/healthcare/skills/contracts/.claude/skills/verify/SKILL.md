---
name: verify
description: Drive the contracts engine's runtime surface (the stdio MCP server) to verify changes end-to-end. Scoped to public-plugins/plugins/healthcare/skills/contracts/ and ../../servers/documents/.
---

# Verifying contracts-engine changes

The engine is the bundled MCP server at `../../servers/documents.mjs` (source `../../servers/documents/src/`). Most changes are drivable without a full /contracts session by speaking JSON-RPC to the server over stdio.

- Build: `cd ../../servers/documents && bun install && bun run build && bun run bundle` (typecheck + regenerate the committed bundle — **always rebundle before testing; the plugin runs the bundle, not src/**).
- Data: `~/.claude/data/healthcare/contracts/data.sqlite` (shared across checkouts; safe to delete — schema v-check tells users to do the same).
- **Tool schemas must be JSON Schema draft 2020-12.** The API validates them when an *agent* spawns, so a bad schema shows up as "agent terminated early: input_schema is invalid" — never as a server error, and never in a plain tools/list. Two zod idioms silently emit draft-07: `z.tuple([...])` (array-form `items` → use `z.array().length(n)`) and `z.union([...])`/`.nullish()` on primitives (`type: [...]` → use `.optional()` or one type). `servers/documents/test/schema.test.ts` guards this; run `bun test` after touching any tool's inputSchema, and spawn a real agent (`claude --plugin-dir <plugin> -p "spawn subagent_type 'healthcare:contracts-reader' …" --allowedTools Agent`) after changing agent tool lists.
- MCP smoke: pipe `initialize` → `notifications/initialized` → `tools/list` / `tools/call` lines into `node ../../servers/documents.mjs` and read the JSON-RPC replies. A sequential client (write line, read reply) avoids out-of-order confusion. Core chain worth driving after engine changes: `corpus_register` (temp dir with a .txt) → `ingest` → `write runs/briefs` → `find` with a verbatim quote (expect `kind:"exact"`) AND a bogus quote (expect the cite error) → `export_report`.
- **Sweep fan-out** is parallel Agent calls in one message (10-wide, `getMaxToolUseConcurrency`), deliberately NOT a Workflow — a workflow caps agents at `min(16, cores−2)`, which is 2 on a cloud container and serializes the sweep. To check parallelism after a real run: `sql "SELECT worker, min(created_at), max(created_at) FROM findings WHERE run_id='<id>' GROUP BY worker"` — the windows should overlap, not chain end-to-start.
- SKILL.md / agents/contracts-conductor.md / steps/*.md prose changes: no cheap harness — check internal consistency (tool names match the server's `tools/list`, step file paths exist) and, for protocol changes, drive at least the mechanical tool calls the prose mandates exactly as written.
