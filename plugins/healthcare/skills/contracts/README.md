# Contract Reasoning

> See **Security** below before running on real contracts.

Answers questions across a corpus of contract documents with verified citations. You ask in plain English ("which of these contracts let the buyer terminate for convenience, and on what notice?"); the skill spawns a background subagent that reformulates the question into a research brief, sweeps the corpus, files cited findings into a local SQLite database, and returns a report where every claim links to a verified quote in a source document.

The engine is a **local MCP server bundled with the plugin** (`servers/documents.mjs`) — it runs on your machine, talks to nothing on the network, and owns the database and document extraction. All reads and writes flow through its typed tools.

## Prerequisites

- **Node.js ≥ 22.13** on your PATH (the server checks at startup and says so plainly if it's missing or too old). Nothing else is installed at runtime — the server is a self-contained bundle.
- A `corpora/<name>/` folder of contract documents — **PDF, DOCX, XLSX, PPTX, plain text, markdown, or HTML** (one file per document). This folder is **read-only input** — the skill never writes into it. PDF/DOCX/XLSX/PPTX are converted automatically to page-anchored text on first ingest: via [liteparse](https://www.npmjs.com/package/@llamaindex/liteparse) if you have its `lit` binary on PATH (or `$LITEPARSE_PATH`), else PDFs fall back to `pdftotext -layout` (poppler) and DOCX/XLSX/PPTX are reported as needing liteparse or a `.txt` you supply. Extractions are cached under the data dir, keyed by the source file's content hash. If you've already extracted a document yourself, drop the `.txt` alongside (or instead of) the source — your text takes precedence.
- Budget: roughly $0.20–0.40 per document for a full-corpus question (narrow lookups much less). The report states what the run cost — nothing waits for approval, so point it at a small folder first if you're cost-sensitive.

## Quick start

**In Claude Code**, install the healthcare plugin:

```
/plugin marketplace add anthropics/healthcare
/plugin install healthcare@healthcare   # plugin-name @ marketplace-name
```

(If you received a tarball or repo path from us, point at that folder instead: `/plugin marketplace add /absolute/path/to/folder-containing-.claude-plugin`.)

**In your terminal**, set up a corpus in whatever project directory you want to work from:

```bash
mkdir -p corpora/mycontracts
cp your-contracts/* corpora/mycontracts/   # .pdf, .docx, .xlsx, .pptx, .txt, .md, .html
```

**Back in Claude Code**, started from that same directory:

```
/contracts which of these have an evergreen renewal clause?
```

The skill reads your contracts in on first use and answers in a few sentences — no confirmations, no mid-run questions. Progress shows in the surface's own task tracker while it works; the finished report opens as a document — question, how it was read, judgment calls, then the answer with a quote behind every claim — the full cited report goes to a file (below). After the answer it asks how it was — that feedback (de-identified) goes into an observations log you can share with us.

## What's local (MVP caveats)

This is **single-user, local-only** today:

- State (db, reports, observations log) lives at `~/.claude/data/healthcare/contracts/` — machine-global so learned knowledge and cost calibration carry across projects, persists across plugin upgrades. Override the parent dir with `$CLAUDE_HEALTHCARE_DATA` (the server appends `/contracts`). The server creates and writes this itself — no sandbox allowlisting needed.
- The schema is still moving; if you upgrade to a newer version, delete `~/.claude/data/healthcare/contracts/data.sqlite` (the parsed/ cache can stay) and the corpus will be re-ingested automatically on the next `/contracts` (there's no migration).
- The corpus must be on the **local filesystem**. MCP connectors and other data-access patterns are planned; today it reads files from `corpora/`.

## Security

Contract text is untrusted input. The design keeps the blast radius structural, not behavioral:

- **Paths enter the system in exactly one place**: the `corpus_register` tool. The directory is canonicalized (symlinks resolved) and must exist; every other tool takes names and ids, and internal paths are derived. A quote inside a document can't steer any tool at a filesystem path.
- **Sweep workers are a registered agent (`documents-reader`) with an enforced tool allowlist**: Read/Grep on their pre-dumped shard files, plus exactly two write tools — `find` (span-verified citation + finding) and `coverage` (read receipt). Workers process the untrusted text; they hold no `sql`, no delete, no path-taking tools.
- **The server makes no outbound network connections.** Extraction is local (`lit`/`pdftotext` subprocesses); dependencies are bundled at build time.
- Exact citations verify against `documents.content` at insert time via schema triggers — a fabricated verbatim quote structurally cannot exist, and citations are immutable after insert. The narrow exception is `judged` citations (non-contiguous evidence like table cells): those are model-attested with a recorded audit reference rather than substring-verified; `citations.kind` records which.
- **Don't run this on a corpus you don't trust.**

## Seeing the full run

The plan and the answer arrive in chat — the answer composed from verified findings, every fact backed by a quote that was substring-verified at insert. The whole run (findings, citations, judgment calls, learned facts) stays queryable in the database through the `sql` tool; nothing else is written.

## How it's built

- `SKILL.md` — the whole flow, run by the session the user talks to: bootstrap, plan (with the one confirmation pause), scope, sweep, triage, and the chat answer. **This is the file to read or edit to understand or change run behavior.**
- `../../agents/documents-reader.md` — the sweep worker agent: ten spawn in parallel per run, each reading one batch of contracts and writing verified findings. The only subagent in the design.
- `steps/*.md` — step docs (`reformulate`, `scope`, `sweep`, `citations`, `triage`, `finish`), read by the session at the start of a run. Plain reference files, not registered skills.
- `../../servers/documents/` — the MCP server source (TypeScript, `node:sqlite`); `bun run bundle` produces the committed `../../servers/documents.mjs` the plugin runs via `.mcp.json`. `schema.sql` lives here — tables, views, triggers; citations verify against `documents.content` at insert time. The server speaks MCP over stdio and takes no arguments.
