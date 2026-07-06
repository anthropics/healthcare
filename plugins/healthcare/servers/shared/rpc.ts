// Hand-rolled MCP stdio transport, shared by every server in this plugin.
// The protocol surface we use is four methods of line-delimited JSON-RPC 2.0
// (initialize, ping, tools/list, tools/call) — no SDK required. Tool schemas
// arrive as frozen literals; validation is src/validate.ts's single walk.
//
// Spec edges handled deliberately:
// - id:0 and string ids are requests; absent/null id is a notification.
// - Notifications (including notification-form tools/call) get NO reply and
//   NO execution — a side effect nobody can observe the outcome of is a trap.
// - Batch arrays and non-object frames get -32600; 2025-03-26 is not
//   advertised because that revision mandates batch support.
// - Tool failures — including argument-validation failures — are in-band
//   isError results, not protocol errors: the model reads them and corrects
//   (the SDK sent -32602 instead; hosts treat protocol errors as plumbing).

import { createInterface } from "node:readline";

import { checkAndStrip } from "./validate.js";

export type ToolDef = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  [extra: string]: unknown; // SDK-era captures carry fields like `execution`; keep them verbatim
};

export type Args = Record<string, unknown>;
export type ServeConfig = {
  serverInfo: { name: string; version: string };
  instructions?: string;
  tools: ToolDef[];
  handlers: Record<string, (a: Args) => unknown | Promise<unknown>>;
  /** One-line human summaries that ride FIRST in result content; the JSON the
   *  model consumes is always the LAST block. A broken summary never breaks
   *  the call. */
  summarize?: Record<string, (result: unknown, args: Args) => string>;
};

const PROTOCOL_VERSIONS = ["2024-11-05", "2025-06-18"];

type Rpc = { jsonrpc?: string; id?: number | string | null; method?: string; params?: Args };
type Content = { type: "text"; text: string }[];

export function serve(cfg: ServeConfig): void {
  const toolIndex = new Map(cfg.tools.map((t) => [t.name, t]));

  const send = (msg: unknown): void => void process.stdout.write(JSON.stringify(msg) + "\n");
  const reply = (id: number | string, result: unknown): void => send({ jsonrpc: "2.0", id, result });
  const replyError = (id: number | string | null, code: number, message: string): void =>
    send({ jsonrpc: "2.0", id, error: { code, message } });

  async function callTool(name: string, rawArgs: unknown): Promise<{ content: Content; isError?: boolean }> {
    const def = toolIndex.get(name);
    if (!def) throw Object.assign(new Error(`unknown tool: ${name}`), { rpcCode: -32602 });
    try {
      const args = checkAndStrip(name, def.inputSchema, rawArgs);
      const result = await cfg.handlers[name]!(args);
      // Handlers may return ready-made MCP content (the fhir server's text()/
      // json() helpers do); pass those through untouched.
      if (result && typeof result === "object" && Array.isArray((result as { content?: unknown }).content))
        return result as { content: Content; isError?: boolean };
      let summary: string | undefined;
      try {
        summary = cfg.summarize?.[name]?.(result, args);
      } catch {
        summary = undefined;
      }
      return {
        content: [
          ...(summary ? [{ type: "text" as const, text: summary }] : []),
          { type: "text" as const, text: JSON.stringify(result ?? { ok: true }) },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: String((e as Error).message ?? e) }) }],
        isError: true,
      };
    }
  }

  async function dispatch(msg: Rpc): Promise<void> {
    const { id, method, params } = msg;
    const isRequest = id !== undefined && id !== null;
    try {
      switch (method) {
        case "initialize": {
          if (!isRequest) return;
          const asked = (params?.protocolVersion as string) ?? PROTOCOL_VERSIONS[0]!;
          reply(id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS.at(-1),
            capabilities: { tools: { listChanged: true } },
            serverInfo: cfg.serverInfo,
            ...(cfg.instructions ? { instructions: cfg.instructions } : {}),
          });
          return;
        }
        case "ping":
          if (isRequest) reply(id, {});
          return;
        case "tools/list":
          if (isRequest) reply(id, { tools: cfg.tools });
          return;
        case "tools/call":
          if (isRequest) reply(id, await callTool(params?.name as string, params?.arguments));
          return;
        default:
          if (isRequest) replyError(id, -32601, `method not found: ${method}`);
          return;
      }
    } catch (e) {
      const code = (e as { rpcCode?: number }).rpcCode ?? -32603;
      if (isRequest) replyError(id, code, String((e as Error).message ?? e));
    }
  }

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: unknown;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      replyError(null, -32700, "parse error: invalid JSON");
      return;
    }
    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
      replyError(null, -32600, Array.isArray(msg) ? "batch requests are not supported" : "invalid request");
      return;
    }
    void dispatch(msg as Rpc);
  });
  rl.on("close", () => process.exit(0));

  process.stderr.write(`${cfg.serverInfo.name}: stdio ready\n`);
}
