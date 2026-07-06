import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * Tool input schemas are validated against JSON Schema draft 2020-12 when an
 * agent spawns. Two zod idioms silently emit draft-07 shapes the validator
 * rejects — tuples (array-form `items`) and unions/nullish (`type: [...]`) —
 * and the only symptom is "agent terminated early: input_schema is invalid",
 * pointing at a tool index rather than the field. Catch it here instead.
 */
function violations(node: unknown, path: string): string[] {
  const out: string[] = [];
  if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...violations(v, `${path}[${i}]`)));
    return out;
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (Array.isArray(o.items))
      out.push(`${path}: array-form 'items' (zod tuple — use z.array().length(n))`);
    if (Array.isArray(o.type))
      out.push(`${path}: union 'type' array (zod union/nullish — use .optional() or one type)`);
    if ("definitions" in o) out.push(`${path}: 'definitions' (2020-12 uses $defs)`);
    for (const [k, v] of Object.entries(o)) out.push(...violations(v, `${path}.${k}`));
  }
  return out;
}

type Tool = { name: string; inputSchema: unknown };

async function toolsList(): Promise<Tool[]> {
  // Bundle is gitignored (built at sync time); server needs node:sqlite so
  // build fresh and run under node. Install from this package's own lockfile —
  // the root install doesn't cover its deps.
  const pkg = join(import.meta.dir, "..");
  const bundle = join(pkg, "..", "documents.mjs");
  for (const argv of [["install", "--frozen-lockfile"], ["run", "bundle"]]) {
    const r = spawnSync("bun", argv, { cwd: pkg, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`bun ${argv.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  const p = spawn("node", [bundle], { stdio: ["pipe", "pipe", "ignore"] });
  const send = (m: unknown) => p.stdin.write(JSON.stringify(m) + "\n");
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "schema-test", version: "0" },
    },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });

  let buf = "";
  for await (const chunk of p.stdout) {
    buf += String(chunk);
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const m = JSON.parse(line) as { id?: number; result?: { tools?: Tool[] } };
      if (m.id === 2 && m.result?.tools) {
        p.kill();
        return m.result.tools;
      }
    }
  }
  p.kill();
  throw new Error("server closed before tools/list");
}

describe("tool schemas", () => {
  test("are valid JSON Schema draft 2020-12 (agents can't spawn otherwise)", async () => {
    const tools = await toolsList();
    expect(tools.length).toBeGreaterThan(10);
    expect(tools.flatMap((t) => violations(t.inputSchema, t.name))).toEqual([]);

    // Batch surface: every tool that can take N of something must advertise an
    // array form in its emitted schema — the model only batches what it sees.
    const byName = new Map(tools.map((t) => [t.name, t.inputSchema as { properties?: Record<string, unknown> }]));
    const arrayProp = (tool: string, prop: string) => {
      const p = byName.get(tool)?.properties?.[prop] as
        | { type?: string; anyOf?: { type?: string }[] }
        | undefined;
      if (!p) return `${tool}.${prop}: missing`;
      const isArray = p.type === "array" || p.anyOf?.some((v) => v.type === "array");
      return isArray ? null : `${tool}.${prop}: not an array (or union-with-array)`;
    };
    const batched: [string, string][] = [
      ["find", "rows"],
      ["cite", "rows"],
      ["set", "updates"],
      ["doc_text", "docs"],
      ["sql", "query"],
      ["doc_search", "pattern"],
      ["write", "rows"],
      ["coverage", "rows"],
      ["dump", "shards"],
      ["drop", "run_ids"],
    ];
    expect(batched.map(([t, p]) => arrayProp(t, p)).filter(Boolean)).toEqual([]);
  }, 20_000);
});
