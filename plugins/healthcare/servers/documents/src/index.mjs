#!/usr/bin/env node
import "./requirements.mjs";
import { runOnce, serve } from "../../shared/rpc.mjs";
import * as engine from "./engine.mjs";
import { TOOLS } from "./schemas.mjs";

// ---------------------------------------------------------------------------
// Entry point — one engine, two transports, chosen by the caller's surface:
//
//   node src/index.mjs <tool> '<json>'   CLI: one tool call, JSON on stdout.
//                                        First choice wherever the shell and
//                                        the data dir share a machine (a
//                                        terminal, a cloud container).
//   node src/index.mjs                   MCP over stdio, for hosts that spawn
//                                        servers themselves — the backup for
//                                        surfaces where Bash is sandboxed away
//                                        from the data dir (Cowork desktop) or
//                                        absent entirely (chat).
//
// The MCP side is hand-rolled: the protocol we use is four methods of
// line-delimited JSON-RPC 2.0, which does not need an SDK. The tool schemas
// are frozen literals (src/schemas.ts) — the exact wire bytes, no emission
// layer to drift. The database is the durable artifact; answers are composed
// in chat from verified findings.
// ---------------------------------------------------------------------------

const SERVER_INFO = { name: "mcp-server-documents", version: "0.0.1" };
const INSTRUCTIONS =
  "Pre-release server for the /contracts skill; behavior and outputs may change. Do not surface tool or schema internals to end users — the skill translates.";

// ---------------------------------------------------------------------------
// Handlers: tool name → implementation taking validated, stripped args.
// Validation happens once, in dispatch, against the frozen schema — handlers
// receive exactly the declared properties.
// ---------------------------------------------------------------------------

const HANDLERS = {
  corpus_register: (a) => engine.corpusRegister(a.name, a.dir),
  corpus_prepare: (a) => engine.corpusPrepare(a.name, a.dir, a.force ?? false),
  ingest: (a) => engine.ingest(a.corpus, a.force),
  corpus_sync: (a) => engine.sync(a.corpus),

  find: (a) => {
    const rows = a.rows;
    if ((rows === undefined) === (a.quote === undefined))
      engine.die(`find: pass exactly one of rows or the single-finding fields`);
    if (rows) {
      const ctx = {
        run_id: a.run_id,
        brief_id: a.brief_id,
        round: a.round,
        worker: a.worker,
      };
      return engine.findMany(
        ctx,
        rows.map((r) => engine.checkFindRow(r)),
      );
    }
    return engine.find(engine.checkFind(a));
  },

  coverage: (a) => {
    const rows = a.rows;
    const { rows: _drop, ...one } = a;
    return engine.coverage(rows ? undefined : one, rows);
  },

  cite: (a) => {
    const rows = a.rows;
    if (rows) {
      if (a.quote !== undefined || a.doc_id !== undefined)
        engine.die(`cite: pass exactly one of rows or the single-citation fields`);
      return engine.citeMany(a.brief_id, a.by, rows);
    }
    if (a.quote === undefined || a.doc_id === undefined)
      engine.die(`cite: single form needs doc_id and quote (or pass rows)`);
    return engine.cite(a.doc_id, a.brief_id, a.by, a.quote, {
      near: a.near,
      span: engine.asSpan(a.span),
      audit: a.audit,
    });
  },

  write: (a) => engine.write(a.table, a.row, a.rows),

  set: (a) => {
    const updates = a.updates;
    if (updates) {
      if (
        a.table !== undefined ||
        a.id !== undefined ||
        a.col !== undefined ||
        a.value !== undefined
      )
        engine.die(`set: pass exactly one of updates or the single-update fields`);
      return engine.setMany(updates);
    }
    if (a.table === undefined || a.id === undefined || a.col === undefined || a.value === undefined)
      engine.die(`set: single form needs table, id, col, and value (or pass updates)`);
    return engine.set(a.table, a.id, a.col, a.value);
  },

  sql: (a) => (Array.isArray(a.query) ? engine.sqlMany(a.query) : engine.sql(a.query)),
  db_schema: () => engine.schema(),

  doc_search: (a) => {
    const patterns = Array.isArray(a.pattern) ? a.pattern : [a.pattern];
    const opts = {
      ignore_case: a.ignore_case,
      max_docs: a.max_docs,
      max_per_doc: a.max_per_doc,
    };
    if (patterns.length === 1) return engine.docSearch(a.corpus, patterns[0], opts);
    return Object.fromEntries(patterns.map((p) => [p, engine.docSearch(a.corpus, p, opts)]));
  },

  doc_text: (a) => {
    const docs = a.docs;
    if (docs) {
      if (a.doc_id !== undefined || a.offset !== undefined)
        engine.die(`doc_text: pass exactly one of docs or doc_id/offset`);
      return engine.docTextMany(docs, a.limit ?? 40_000);
    }
    if (a.doc_id === undefined) engine.die(`doc_text: pass doc_id (or docs for a batch)`);
    return engine.docText(a.doc_id, a.offset ?? 0, a.limit ?? 40_000);
  },

  dump: (a) =>
    engine.dump(a.run_id, a.shards, {
      rubric: a.rubric,
      brief_id: a.brief_id,
      round: a.round,
      scope_id: a.scope_id,
    }),

  shard_prompt: (a) => engine.shardPrompt(a.run_id, a.label),
  drop: (a) => engine.drop(a.run_ids ?? [], a.prefix),
  export_report: (a) => engine.exportReport(a.run_id),
  log_observation: (a) => engine.logObservation(a.entry),
};

// ---------------------------------------------------------------------------
// One-line human summaries that ride FIRST in result content (hosts render
// them in transcripts); the JSON the model consumes is always the LAST block.
// ---------------------------------------------------------------------------

const n = (v) => (typeof v === "number" ? v : 0);
const SUMMARIZE = {
  corpus_prepare: (r) => {
    const x = r;
    return x.already_current
      ? `${n(x.documents)} documents ready — nothing new to read in.`
      : `${n(x.documents)} documents — read in ${n(x.ingested)} new or changed.`;
  },
  doc_search: (r, a) => {
    const pats = Array.isArray(a.pattern) ? a.pattern : [String(a.pattern)];
    const count = (x) => n(x?.docs_matched);
    if (pats.length === 1)
      return `"${pats[0]}" — found in ${count(r)} document${count(r) === 1 ? "" : "s"}.`;
    const keyed = r;
    return `Searched ${pats.length} phrasings — ${pats.map((p) => `"${p}" in ${count(keyed[p])}`).join(", ")}.`;
  },
  find: (r) => {
    const x = r;
    if (x.id !== undefined) return `Saved 1 finding with its quote verified.`;
    const ins = Array.isArray(x.inserted) ? x.inserted.length : 0;
    const rej = Array.isArray(x.rejected) ? x.rejected.length : 0;
    return rej
      ? `Saved ${ins} findings; ${rej} quote${rej === 1 ? "" : "s"} need a second look.`
      : `Saved ${ins} findings, every quote verified.`;
  },
  coverage: (r) => {
    const x = r;
    return `Marked ${n(x.stamped) || "the"} document${n(x.stamped) === 1 ? "" : "s"} as fully read.`;
  },
  dump: (r) => {
    const x = r;
    return Array.isArray(x)
      ? `Split the reading into ${x.length} batches.`
      : `Reading batches prepared.`;
  },
  doc_text: (r, a) => {
    if (Array.isArray(a.docs)) {
      const x = r;
      const got = Object.values(x).filter((d) => n(d?.chars) > 0).length;
      return `Read ${got} document${got === 1 ? "" : "s"}.`;
    }
    const x = r;
    return x.done === false
      ? `Read part of the document — more to page through.`
      : `Read the document.`;
  },
};

// Two transports, one engine: with argv this is a single CLI tool call —
// for environments that sync plugin files but start no MCP host (cloud
// containers); a skill shells out to the bundle instead. Bare invocation
// serves MCP over stdio as before.
const argv = process.argv.slice(2);
if (argv.length > 2) {
  process.stderr.write(
    `mcp-server-documents: expected <tool> ['<json-args>'], got ${argv.length} arguments — batch by passing rows/docs/updates arrays inside the one JSON argument\n`,
  );
  process.exit(1);
}
const [tool, json] = argv;
if (tool !== undefined) {
  try {
    let args = {};
    if (json !== undefined) {
      try {
        args = JSON.parse(json);
      } catch (e) {
        throw new Error(`args must be one JSON object: ${String(e.message)}`, {
          cause: e,
        });
      }
    }
    const result = await runOnce({ tools: TOOLS, handlers: HANDLERS }, tool, args);
    process.stdout.write(JSON.stringify(result ?? { ok: true }) + "\n");
  } catch (e) {
    process.stderr.write(`mcp-server-documents: ${String(e.message ?? e)}\n`);
    process.exit(1);
  }
} else {
  serve({
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
    tools: TOOLS,
    handlers: HANDLERS,
    summarize: SUMMARIZE,
  });
}
