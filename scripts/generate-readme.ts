#!/usr/bin/env bun
// Regenerates the marked inventory sections of public-plugins/README.md from
// the plugin's actual contents (skills/*/SKILL.md frontmatter, .mcp.json).
// Run with --check to fail (exit 1) when the README is stale instead of
// rewriting it. The sync workflow runs the rewrite before mirroring, so the
// published README can never drift from what the plugin ships.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const root = join(dirname(Bun.main), "..");
const pluginDir = join(root, "plugins", "healthcare");
const readmePath = join(root, "README.md");

function frontmatter(path: string): Record<string, string> {
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  let key = "";
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      // ">"/"|" YAML block scalars: value is on the continuation lines
      out[key] = /^[>|]\d*[+-]?$/.test(kv[2]) ? "" : kv[2].replace(/^["'](.*)["']$/, "$1");
    } else if (key && /^\s+\S/.test(line)) {
      out[key] = (out[key] ? out[key] + " " : "") + line.trim();
    }
  }
  return out;
}

// First sentence of the description, minus the trailing "Use when ..." blurb
// that exists for the model, not for README readers.
function summarize(description: string): string {
  if (!description.trim()) throw new Error("skill has an empty description");
  const cut = description.split(/\.\s+(?:Use when|This skill should be used)/)[0];
  return (cut.endsWith(".") ? cut : cut + ".").replace(/\|/g, "\\|");
}

function skillsTable(): string {
  const skillsDir = join(pluginDir, "skills");
  const rows = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md")))
    .map((d) => {
      const fm = frontmatter(join(skillsDir, d.name, "SKILL.md"));
      return `| ${d.name} | ${summarize(fm.description ?? "")} |`;
    })
    .sort();
  return ["| Skill | What it does |", "|---|---|", ...rows].join("\n");
}

function serversTable(): string {
  const mcp = JSON.parse(readFileSync(join(pluginDir, ".mcp.json"), "utf8"));
  const rows = Object.entries(mcp.mcpServers as Record<string, any>).map(
    ([name, cfg]) => `| ${name} | ${cfg.url ?? "bundled with the plugin (local stdio)"} |`,
  );
  return ["| Server | URL |", "|--------|-----|", ...rows].join("\n");
}

function splice(text: string, marker: string, body: string): string {
  const begin = `<!-- generated:${marker}:begin -->`;
  const end = `<!-- generated:${marker}:end -->`;
  const re = new RegExp(`${begin}[\\s\\S]*?${end}`);
  if (!re.test(text)) throw new Error(`README.md is missing ${begin}/${end} markers`);
  return text.replace(re, () => `${begin}\n${body}\n${end}`);
}

const before = readFileSync(readmePath, "utf8");
let after = splice(before, "skills", skillsTable());
after = splice(after, "servers", serversTable());

if (process.argv.includes("--check")) {
  if (after !== before) {
    console.error("README.md is stale — run: bun public-plugins/scripts/generate-readme.ts");
    process.exit(1);
  }
  console.log("README.md is up to date");
} else if (after !== before) {
  writeFileSync(readmePath, after);
  console.log("README.md regenerated");
} else {
  console.log("README.md already up to date");
}
