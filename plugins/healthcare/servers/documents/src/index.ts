#!/usr/bin/env node
import "./requirements.js";

import { writeSchemas, type WritableTable } from "./db.js";
import * as engine from "./engine.js";
import { TOOLS } from "./schemas.js";
import { serve, type Args } from "../../shared/rpc.js";

// ---------------------------------------------------------------------------
// Entry point. MCP stdio server, hand-rolled: the protocol we use is four
// methods of line-delimited JSON-RPC 2.0, which does not need an SDK. The
// tool schemas are frozen literals (src/schemas.ts) — the exact wire bytes,
// no emission layer to drift. The database is the durable artifact; answers
// are composed in chat from verified findings.
// ---------------------------------------------------------------------------

const [mode] = process.argv.slice(2);
if (mode) {
  process.stderr.write(
    `mcp-server-documents: unknown mode "${mode}" — this server speaks MCP over stdio and takes no arguments\n`,
  );
  process.exit(1);
}

const SERVER_INFO = { name: "mcp-server-documents", version: "0.0.1" };
const INSTRUCTIONS =
  "Pre-release server for the /contracts skill; behavior and outputs may change. Do not surface tool or schema internals to end users — the skill translates.";

// ---------------------------------------------------------------------------
// Handlers: tool name → implementation taking validated, stripped args.
// Validation happens once, in dispatch, against the frozen schema — handlers
// receive exactly the declared properties.
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (a: Args) => unknown | Promise<unknown>> = {
  corpus_register: (a) => engine.corpusRegister(a.name as string, a.dir as string),
  corpus_prepare: (a) => engine.corpusPrepare(a.name as string, a.dir as string, (a.force as boolean) ?? false),
  ingest: (a) => engine.ingest(a.corpus as string, a.force as boolean | undefined),
  corpus_sync: (a) => engine.sync(a.corpus as string),

  find: (a) => {
    const rows = a.rows as Args[] | undefined;
    if ((rows === undefined) === (a.quote === undefined))
      engine.die(`find: pass exactly one of rows or the single-finding fields`);
    if (rows) {
      const ctx = {
        run_id: a.run_id as string,
        brief_id: a.brief_id as number,
        round: a.round as number,
        worker: a.worker as string,
      };
      return engine.findMany(ctx, rows.map((r) => engine.checkFindRow(r)));
    }
    return engine.find(engine.checkFind(a));
  },

  coverage: (a) => {
    const rows = a.rows as Args[] | undefined;
    const { rows: _drop, ...one } = a;
    return engine.coverage(
      rows ? undefined : (one as Parameters<typeof engine.coverage>[0]),
      rows as Parameters<typeof engine.coverage>[1],
    );
  },

  cite: (a) => {
    const rows = a.rows as Args[] | undefined;
    if (rows) {
      if (a.quote !== undefined || a.doc_id !== undefined)
        engine.die(`cite: pass exactly one of rows or the single-citation fields`);
      return engine.citeMany(a.brief_id as number, a.by as string, rows as Parameters<typeof engine.citeMany>[2]);
    }
    if (a.quote === undefined || a.doc_id === undefined)
      engine.die(`cite: single form needs doc_id and quote (or pass rows)`);
    return engine.cite(a.doc_id as number, a.brief_id as number, a.by as string, a.quote as string, {
      near: a.near as number | undefined,
      span: engine.asSpan(a.span as number[] | undefined),
      audit: a.audit as number | undefined,
    });
  },

  write: (a) => engine.write(a.table as WritableTable, a.row as Args | undefined, a.rows as Args[] | undefined),

  set: (a) => {
    const updates = a.updates as { table: string; id: string; col: string; value: string }[] | undefined;
    if (updates) {
      if (a.table !== undefined || a.id !== undefined || a.col !== undefined || a.value !== undefined)
        engine.die(`set: pass exactly one of updates or the single-update fields`);
      return engine.setMany(updates as Parameters<typeof engine.setMany>[0]);
    }
    if (a.table === undefined || a.id === undefined || a.col === undefined || a.value === undefined)
      engine.die(`set: single form needs table, id, col, and value (or pass updates)`);
    return engine.set(
      a.table as Parameters<typeof engine.set>[0],
      a.id as string,
      a.col as string,
      a.value as string,
    );
  },

  sql: (a) => (Array.isArray(a.query) ? engine.sqlMany(a.query as string[]) : engine.sql(a.query as string)),
  db_schema: () => engine.schema(),

  doc_search: (a) => {
    const patterns = Array.isArray(a.pattern) ? (a.pattern as string[]) : [a.pattern as string];
    const opts = {
      ignore_case: a.ignore_case as boolean | undefined,
      max_docs: a.max_docs as number | undefined,
      max_per_doc: a.max_per_doc as number | undefined,
    };
    if (patterns.length === 1) return engine.docSearch(a.corpus as string, patterns[0]!, opts);
    return Object.fromEntries(patterns.map((p) => [p, engine.docSearch(a.corpus as string, p, opts)]));
  },

  doc_text: (a) => {
    const docs = a.docs as { doc_id: number; offset?: number }[] | undefined;
    if (docs) {
      if (a.doc_id !== undefined || a.offset !== undefined)
        engine.die(`doc_text: pass exactly one of docs or doc_id/offset`);
      return engine.docTextMany(docs, (a.limit as number) ?? 40_000);
    }
    if (a.doc_id === undefined) engine.die(`doc_text: pass doc_id (or docs for a batch)`);
    return engine.docText(a.doc_id as number, (a.offset as number) ?? 0, (a.limit as number) ?? 40_000);
  },

  dump: (a) =>
    engine.dump(a.run_id as string, a.shards as Parameters<typeof engine.dump>[1], {
      rubric: a.rubric as string | undefined,
      brief_id: a.brief_id as number | undefined,
      round: a.round as number | undefined,
      scope_id: a.scope_id as number | undefined,
    }),

  shard_prompt: (a) => engine.shardPrompt(a.run_id as string, a.label as string),
  drop: (a) => engine.drop((a.run_ids as string[]) ?? [], a.prefix as string | undefined),
  export_report: (a) => engine.exportReport(a.run_id as string),
  log_observation: (a) => engine.logObservation(a.entry as string),
};

// ---------------------------------------------------------------------------
// One-line human summaries that ride FIRST in result content (hosts render
// them in transcripts); the JSON the model consumes is always the LAST block.
// ---------------------------------------------------------------------------

const n = (v: unknown): number => (typeof v === "number" ? v : 0);
const SUMMARIZE: Record<string, (result: unknown, args: Args) => string> = {
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
    return rej
      ? `Saved ${ins} findings; ${rej} quote${rej === 1 ? "" : "s"} need a second look.`
      : `Saved ${ins} findings, every quote verified.`;
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
    const x = r as { done?: boolean };
    return x.done === false ? `Read part of the document — more to page through.` : `Read the document.`;
  },
};

serve({
  serverInfo: SERVER_INFO,
  instructions: INSTRUCTIONS,
  tools: TOOLS,
  handlers: HANDLERS,
  summarize: SUMMARIZE,
});
