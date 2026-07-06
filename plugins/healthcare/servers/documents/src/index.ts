#!/usr/bin/env node
import "./requirements.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ShapeOutput } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { writeSchemas, type WritableTable } from "./db.js";
import * as engine from "./engine.js";


// ---------------------------------------------------------------------------
// Entry point. MCP stdio server; takes no arguments. The database is the
// durable artifact; answers are composed in chat from verified findings.
// ---------------------------------------------------------------------------

const [mode] = process.argv.slice(2);

if (mode) {
  process.stderr.write(`mcp-server-documents: unknown mode "${mode}" — this server speaks MCP over stdio and takes no arguments\n`);
  process.exit(1);
} else {
  await runMcp();
}

// --- MCP stdio server --------------------------------------------------------


async function runMcp(): Promise<void> {
  const server = new McpServer(
    { name: "mcp-server-documents", version: "0.0.1" },
    {
      instructions: "Pre-release server for the /contracts skill; behavior and outputs may change. Do not surface tool or schema internals to end users — the skill translates.",
    },
  );

  // Every handler returns JSON text; thrown errors become {error: message} + isError.
  // When a summarizer is present, a one-line human summary rides FIRST in the
  // content array (hosts render it in transcripts); the JSON the model consumes
  // is always the LAST text block.
  type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
  const ok = (result: unknown, summary?: string): ToolResult => ({
    content: [
      ...(summary ? [{ type: "text" as const, text: summary }] : []),
      { type: "text" as const, text: JSON.stringify(result ?? { ok: true }) },
    ],
  });
  const wrap =
    <A,>(fn: (args: A) => unknown | Promise<unknown>, summarize?: (result: unknown, args: A) => string) =>
    async (args: A): Promise<ToolResult> => {
      try {
        const result = await fn(args);
        let summary: string | undefined;
        if (summarize) {
          try {
            summary = summarize(result, args);
          } catch {
            summary = undefined; // a broken summary must never break the call
          }
        }
        return ok(result, summary);
      } catch (e) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ error: String((e as Error).message ?? e) }) },
          ],
          isError: true,
        };
      }
    };

  // Human display names hosts can show instead of wire names, and one-line
  // result summaries that ride first in the content array. Keyed by name so
  // registrations below stay untouched; a tool absent here just gets JSON.
  const TITLES: Record<string, string> = {
    corpus_register: "Registering your documents folder",
    corpus_prepare: "Getting your documents ready",
    corpus_sync: "Checking your documents for changes",
    ingest: "Reading in your documents",
    find: "Saving what was found (with its quote)",
    coverage: "Marking documents as read",
    cite: "Verifying a quote",
    doc_search: "Searching your documents",
    doc_text: "Reading a contract",
    shard_prompt: "Fetching reading instructions",
    dump: "Preparing the reading batches",
    sql: "Checking the records",
    write: "Saving progress",
    set: "Updating progress",
    export_report: "Assembling the report",
    drop: "Removing old runs",
    log_observation: "Logging run notes",
    db_schema: "Checking the filing system",
  };
  type Summarizer = (result: unknown, args: Record<string, unknown>) => string;
  const n = (v: unknown): number => (typeof v === "number" ? v : 0);
  const SUMMARIZE: Record<string, Summarizer> = {
    corpus_prepare: (r) => {
      const x = r as { documents?: number; already_current?: boolean; ingested?: number };
      return x.already_current
        ? `${n(x.documents)} documents ready — nothing new to read in.`
        : `${n(x.documents)} documents — read in ${n(x.ingested)} new or changed.`;
    },
    doc_search: (r, a) => {
      const pats = Array.isArray(a.pattern) ? (a.pattern as string[]) : [String(a.pattern)];
      const count = (x: unknown) => n((x as { docs_matched?: number })?.docs_matched);
      if (pats.length === 1) return `"${pats[0]}" — found in ${count(r)} document${count(r) === 1 ? "" : "s"}.`;
      const keyed = r as Record<string, unknown>;
      return `Searched ${pats.length} phrasings — ${pats.map((p) => `"${p}" in ${count(keyed[p])}`).join(", ")}.`;
    },
    find: (r) => {
      const x = r as { inserted?: unknown[]; rejected?: unknown[]; id?: number };
      if (x.id !== undefined) return `Saved 1 finding with its quote verified.`;
      const ins = Array.isArray(x.inserted) ? x.inserted.length : 0;
      const rej = Array.isArray(x.rejected) ? x.rejected.length : 0;
      return rej ? `Saved ${ins} findings; ${rej} quote${rej === 1 ? "" : "s"} need a second look.` : `Saved ${ins} findings, every quote verified.`;
    },
    coverage: (r) => {
      const x = r as { stamped?: number };
      return `Marked ${n(x.stamped) || "the"} document${n(x.stamped) === 1 ? "" : "s"} as fully read.`;
    },
    dump: (r) => {
      const x = r as unknown[];
      return Array.isArray(x) ? `Split the reading into ${x.length} batches.` : `Reading batches prepared.`;
    },
    doc_text: (r, a) => {
      if (Array.isArray(a.docs)) {
        const x = r as Record<string, { chars?: number }>;
        const got = Object.values(x).filter((d) => n(d?.chars) > 0).length;
        return `Read ${got} document${got === 1 ? "" : "s"}.`;
      }
      const x = r as { chars?: number; done?: boolean };
      return x.done === false ? `Read part of the document — more to page through.` : `Read the document.`;
    },
  };

  // tool() is deprecated; registerTool is the supported registration API.
  // Generic over the zod shape so handlers get typed args without casts.
  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    cb: (args: ShapeOutput<S>) => unknown | Promise<unknown>,
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean },
    _meta?: Record<string, unknown>,
  ) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        ...(TITLES[name] ? { title: TITLES[name] } : {}),
        ...(annotations || TITLES[name]
          ? { annotations: { ...(TITLES[name] ? { title: TITLES[name] } : {}), ...(annotations ?? {}) } }
          : {}),
        ...(_meta ? { _meta } : {}),
      },
      // The SDK types the callback via a conditional on the shape (zod3/zod4
      // compat), which never resolves for a generic S — hence the one cast.
      wrap(cb, SUMMARIZE[name] as ((r: unknown, a: ShapeOutput<S>) => string) | undefined) as never,
    );

  // --- corpus lifecycle (session surface) -----------------------------------

  tool(
    "corpus_register",
    "Register a corpus: give a name to a local folder of documents (pdf/docx/xlsx/pptx sources, txt/md/html direct text). The ONLY tool that accepts a filesystem path; the path is canonicalized and must be an existing directory. Re-registering a name updates its root. Never give to sweep workers.",
    {
      name: z.string().describe("corpus name, e.g. 'acme-msa'"),
      dir: z.string().describe("path to the folder"),
    },
    ({ name, dir }) => engine.corpusRegister(name, dir),
  );

  tool(
    "corpus_prepare",
    "Register a folder of documents, check what changed, and read in anything new — in one call. Use this instead of corpus_register + corpus_sync + ingest, which is three model turns to say the same thing. Returns {documents, already_current, ingested?, missing?}. The ONLY tool besides corpus_register that accepts a filesystem path.",
    {
      name: z.string().describe("corpus name, e.g. 'acme-msa'"),
      dir: z.string().describe("path to the folder"),
      force: z.boolean().optional().describe("re-extract even cached files"),
    },
    ({ name, dir, force }) => engine.corpusPrepare(name, dir, force ?? false),
  );

  tool(
    "ingest",
    "Extract text from every source file in a registered corpus (liteparse if installed, pdftotext fallback for PDFs) and load it into the database. Idempotent; re-run after files change. force re-extracts cached files. Never give to sweep workers.",
    { corpus: z.string(), force: z.boolean().optional() },
    ({ corpus, force }) => engine.ingest(corpus, force),
  );

  tool(
    "corpus_sync",
    "Read-only diff of a registered corpus folder vs the database: which files are new, changed, missing, or unparsed. Run before answering to know whether an ingest is needed.",
    { corpus: z.string() },
    ({ corpus }) => engine.sync(corpus),
    { readOnlyHint: true },
  );

  // --- citation-gated writes (worker surface: find + coverage only) --------

  tool(
    "find",
    "Record findings with span-verified citations. Each quote must appear verbatim in its document (whitespace/quote-style differences are normalized); the citation is rejected otherwise. **Batch with `rows`** — every finding for a document in ONE call, verified per row exactly like the single form: good rows commit, bad rows return in `rejected` with {index, error, hint}; resend only those. Single form: kind/claim/doc_id/quote at top level. For non-contiguous content, first write an audits row (kind='citation_judge'), then pass span + audit. This and coverage are the only write tools sweep workers hold.",
    {
      run_id: z.string(),
      brief_id: z.number().int(),
      round: z.number().int(),
      worker: z.string(),
      kind: z.enum(["finding", "unknown"]).optional(),
      claim: z.string().optional(),
      doc_id: z.number().int().optional(),
      quote: z.string().min(1).optional(),
      near: z.number().int().optional().describe("approximate character offset of the quote"),
      span: z.array(z.number().int()).length(2).optional(),  // length-2 array, not a tuple (see engine.ts)
      audit: z.number().int().optional(),
      rows: z
        .array(
          z.object({
            kind: z.enum(["finding", "unknown"]),
            claim: z.string(),
            doc_id: z.number().int(),
            quote: z.string().min(1),
            near: z.number().int().optional(),
            span: z.array(z.number().int()).length(2).optional(),
            audit: z.number().int().optional(),
          }),
        )
        .min(1)
        .max(50)
        .optional()
        .describe("many findings in one call — returns {inserted, rejected} with per-row errors"),
    },
    ({ rows, ...m }) => {
      if ((rows === undefined) === (m.quote === undefined))
        engine.die(`find: pass exactly one of rows or the single-finding fields`);
      if (rows)
        return engine.findMany(
          { run_id: m.run_id, brief_id: m.brief_id, round: m.round, worker: m.worker },
          rows.map((r) => engine.findRowInput.parse(r)),
        );
      return engine.find(engine.findInput.parse(m));
    },
  );

  tool(
    "coverage",
    "Read-receipt for shard documents: status 'read' (processed, even if nothing relevant) or 'error'. Distinguishes 'nothing relevant' from 'worker crashed'. Stamp your whole shard in one call with rows — one call per document wastes a turn each at the end of the sweep.",
    {
      scope_id: z.number().int().optional(),
      doc_id: z.number().int().optional(),
      worker: z.string().optional(),
      status: z.enum(["read", "error"]).optional(),
      note: z.string().optional(),
      rows: z
        .array(
          z.object({
            scope_id: z.number().int(),
            doc_id: z.number().int(),
            worker: z.string(),
            status: z.enum(["read", "error"]),
            note: z.string().optional(),
          }),
        )
        .optional(),
    },
    ({ rows, ...one }) =>
      engine.coverage(
        rows ? undefined : (one as Parameters<typeof engine.coverage>[0]),
        rows as Parameters<typeof engine.coverage>[1],
      ),
  );

  tool(
    "cite",
    "Mint standalone citations (brief_id, created_by, verbatim quotes). Same verification rules as find. **Batch with `rows`** — citations mint in clusters during composition, so pass them all in ONE call: good rows return in `minted`, bad rows in `rejected` with {index, error, hint}; resend only those. Single form: doc_id/quote at top level. Then attach via *_citations joins (write rows).",
    {
      brief_id: z.number().int(),
      by: z.string(),
      doc_id: z.number().int().optional(),
      quote: z.string().min(1).optional(),
      near: z.number().int().optional(),
      span: z.array(z.number().int()).length(2).optional(),  // length-2 array, not a tuple (see engine.ts)
      audit: z.number().int().optional(),
      rows: z
        .array(
          z.object({
            doc_id: z.number().int(),
            quote: z.string().min(1),
            near: z.number().int().optional(),
            span: z.array(z.number().int()).length(2).optional(),
            audit: z.number().int().optional(),
          }),
        )
        .min(1)
        .max(50)
        .optional()
        .describe("many citations in one call — returns {minted, rejected} with per-row errors"),
    },
    ({ doc_id, brief_id, by, quote, near, span, audit, rows }) => {
      if (rows) {
        if (quote !== undefined || doc_id !== undefined)
          engine.die(`cite: pass exactly one of rows or the single-citation fields`);
        return engine.citeMany(brief_id, by, rows);
      }
      if (quote === undefined || doc_id === undefined)
        engine.die(`cite: single form needs doc_id and quote (or pass rows)`);
      return engine.cite(doc_id, brief_id, by, quote, { near, span: engine.asSpan(span), audit });
    },
  );

  // --- structured table access (session surface) ---------------------------

  tool(
    "write",
    `Insert validated rows. Tables: ${Object.keys(writeSchemas).join(", ")}. Pass ONE of: row (returns the inserted row) or rows (an array — inserted in a single transaction, returns their ids). **Always batch with rows when you have more than one** — each tool call costs a full turn, so writing 40 rows one at a time wastes minutes. Never give to sweep workers.`,
    {
      table: z.enum(Object.keys(writeSchemas) as [WritableTable, ...WritableTable[]]),
      row: z.record(z.unknown()).optional(),
      rows: z.array(z.record(z.unknown())).optional(),
    },
    ({ table, row, rows }) => engine.write(table, row, rows),
  );

  tool(
    "set",
    "Update allowlisted columns: runs.{status,round,session_id}, briefs.status, queue_items.{status,answer,answered_by,answered_at}, knowledge.{status,ratified_by}. **Batch with `updates`** — a transition usually sets several (run status + round, a queue item's answer/answered_by/status): pass them all in ONE call, applied in one transaction. Single form: table/id/col/value at top level. Never give to sweep workers.",
    {
      table: z.enum(["runs", "briefs", "queue_items", "knowledge"]).optional(),
      id: z.string().optional().describe("primary key value (run_id for runs, numeric id otherwise)"),
      col: z.string().optional(),
      // A plain string, not a union: zod collapses primitive unions into a
      // `type: [...]` array, which the tool-schema validator rejects (and the
      // agent then fails to spawn). SQLite column affinity converts "3" to 3
      // for the one integer column in the allowlist.
      value: z.string().optional(),
      updates: z
        .array(
          z.object({
            table: z.enum(["runs", "briefs", "queue_items", "knowledge"]),
            id: z.string(),
            col: z.string(),
            value: z.string(),
          }),
        )
        .min(1)
        .max(100)
        .optional()
        .describe("many updates in one transaction — all land or none do"),
    },
    ({ table, id, col, value, updates }) => {
      if (updates) {
        if (table !== undefined || id !== undefined || col !== undefined || value !== undefined)
          engine.die(`set: pass exactly one of updates or the single-update fields`);
        return engine.setMany(updates);
      }
      if (table === undefined || id === undefined || col === undefined || value === undefined)
        engine.die(`set: single form needs table, id, col, and value (or pass updates)`);
      return engine.set(table, id, col, value);
    },
  );

  tool(
    "sql",
    "Run SQL against the documents database (SELECT returns rows; writes return {changes}). `query` takes an ARRAY — independent queries (prescan probes, status checks, triage pulls) go in ONE call, results keyed per query with per-query errors; a lone string works too. Never SELECT the content column of documents — full text overflows tool results; use dump instead. The schema's triggers still enforce citation verification and immutability. Conductor only — never expose to workers processing document content.",
    { query: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(20)]) },
    ({ query }) => (Array.isArray(query) ? engine.sqlMany(query) : engine.sql(query)),
  );

  tool(
    "db_schema",
    "List the database schema (tables, views, triggers).",
    {},
    () => engine.schema(),
    { readOnlyHint: true },
  );

  // --- run/data management (session surface) --------------------------------

  tool(
    "doc_search",
    "LITERAL substring search across a corpus's documents — no regex, no wildcards, no | alternation (a pipe is searched as a pipe character and will match nothing). `pattern` takes an ARRAY: pass each phrasing as its OWN entry ('service credit', 'indemnif', 'hold harmless') in ONE call; results come back keyed per pattern. A lone string works too. Case-insensitive by default, so prefer short stems ('indemnif' catches indemnify/indemnification). Use this BEFORE doc_text when you can't grep the dumped shard files, so you page in only the documents that hit. Case-insensitive by default.",
    {
      corpus: z.string(),
      pattern: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(10)]),
      ignore_case: z.boolean().optional(),
      max_docs: z.number().int().optional(),
      max_per_doc: z.number().int().optional().describe("match snippets per document; capped at 20"),
    },
    ({ corpus, pattern, ignore_case, max_docs, max_per_doc }) => {
      const patterns = Array.isArray(pattern) ? pattern : [pattern];
      if (patterns.length === 1)
        return engine.docSearch(corpus, patterns[0], { ignore_case, max_docs, max_per_doc });
      return Object.fromEntries(
        patterns.map((p) => [p, engine.docSearch(corpus, p, { ignore_case, max_docs, max_per_doc })]),
      );
    },
    { readOnlyHint: true },
  );

  tool(
    "doc_text",
    "Read document text straight from the database, paginated (follow each next_offset until null). **Batch with `docs`** — page every document you're reading in ONE call: `docs: [{doc_id, offset?}, …]`, sharing one char budget (`limit`, same cap as a single call), consumed in array order; a doc the budget didn't reach returns chars:0 with next_offset unchanged — page it next call. Use ONLY when the dumped shard files aren't readable from where you run — otherwise Read the shard file, which is cheaper. Returns per doc {doc_id, uri, family, offset, chars, total_chars, next_offset, text}.",
    {
      doc_id: z.number().int().optional(),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).optional().describe("char budget for the call (shared across docs in batch form); capped at 60000"),
      docs: z
        .array(z.object({ doc_id: z.number().int(), offset: z.number().int().min(0).optional() }))
        .min(1)
        .max(20)
        .optional()
        .describe("many documents in one call under one shared char budget"),
    },
    ({ doc_id, offset, limit, docs }) => {
      if (docs) {
        if (doc_id !== undefined || offset !== undefined)
          engine.die(`doc_text: pass exactly one of docs or doc_id/offset`);
        return engine.docTextMany(docs, limit ?? 40_000);
      }
      if (doc_id === undefined) engine.die(`doc_text: pass doc_id (or docs for a batch)`);
      return engine.docText(doc_id, offset ?? 0, limit ?? 40_000);
    },
    { readOnlyHint: true },
  );

  tool(
    "dump",
    "Write shard text to files for sweep workers, and (when given the rubric) each shard's ready-made worker prompt. Pass every shard in one call. Returns each shard's files and prompt_path. Give it the rubric: otherwise you retype the whole rubric into every reader's prompt, which costs more wall-clock than the reading does. Never give to sweep workers.",
    {
      run_id: z.string(),
      shards: z
        .array(
          z.object({
            label: z.string(),
            doc_ids: z.array(z.number().int()).min(1),
            hunter: z.boolean().optional(),
          }),
        )
        .min(1),
      rubric: z.string().optional().describe("the brief's rubric, verbatim — written into each shard's prompt file"),
      brief_id: z.number().int().optional(),
      round: z.number().int().optional(),
      scope_id: z.number().int().optional(),
    },
    ({ run_id, shards, rubric, brief_id, round, scope_id }) =>
      engine.dump(run_id, shards, { rubric, brief_id, round, scope_id }),
  );

  tool(
    "shard_prompt",
    "Fetch a shard's worker prompt as text (rubric + your documents). Use it when you can't open the prompt file dump wrote — i.e. the engine is on another machine. Never sweep without your rubric.",
    { run_id: z.string(), label: z.string() },
    ({ run_id, label }) => engine.shardPrompt(run_id, label),
    { readOnlyHint: true },
  );

  tool(
    "drop",
    "Delete runs (and sweep orphaned citations/documents). Pass run_ids, or prefix to glob-match. Citations backing ratified knowledge survive. Never give to sweep workers.",
    { run_ids: z.array(z.string()).optional(), prefix: z.string().optional() },
    ({ run_ids, prefix }) => engine.drop(run_ids ?? [], prefix),
    { destructiveHint: true },
  );

  tool(
    "export_report",
    "LEGACY — only runs from before answers moved to chat have report rows; new runs have none and this errors. Compose the run's self-contained markdown report (question + brief + report body) and write it to <data>/reports/<run_id>.md server-side — no filesystem permissions needed on the caller. Returns {path, body} (body so the caller can summarize without a second query).",
    { run_id: z.string() },
    ({ run_id }) => engine.exportReport(run_id),
  );

  tool(
    "log_observation",
    "Append one de-identified entry to the observations log (<data>/observations.md), creating it with its header on first use. The entry must contain no contract text, file names, or question text. Returns the file path.",
    { entry: z.string().min(1) },
    ({ entry }) => engine.logObservation(entry),
  );

  await server.connect(new StdioServerTransport());
  process.stderr.write("mcp-server-documents: stdio ready\n");
}
