# Contract Reasoning

> **⚠️ ALPHA — pre-release. Please do not use in production.** Behavior, schema, and prompts will change without notice. No support guarantees. Reach out to your Anthropic contact with questions or feedback. See **Security** below before running on real contracts.

Answers questions across a corpus of contract documents with verified citations. You ask in plain English ("which of these contracts let the buyer terminate for convenience, and on what notice?"); the skill spawns a background subagent that reformulates the question into a research brief, sweeps the corpus, files cited findings into a local SQLite database, and returns a report where every claim links to a verified quote in a source document.

## Prerequisites

- [bun](https://bun.sh) — the skill auto-installs it to `~/.bun` on first run if it isn't already on your machine
- A `corpora/<name>/` folder of contract documents — **PDF, DOCX, XLSX, PPTX, plain text, markdown, or HTML** (one file per document). This folder is **read-only input** — the skill never writes into it. PDF/DOCX/XLSX/PPTX are converted automatically to page-anchored text on first ingest via [liteparse](https://www.npmjs.com/package/@llamaindex/liteparse) (pulled by `bun install`); PDFs additionally fall back to `pdftotext -layout` if liteparse is unavailable. Extractions are cached under `<DATA>/parsed/`, keyed by the source file's content hash, so the same file anywhere on disk is parsed once. If you've already extracted a document yourself, drop the `.txt` alongside (or instead of) the source — your text takes precedence.
- Budget: the skill shows a cost estimate before starting (roughly $0.20–0.40 per document for a full-corpus question with the default model; narrow lookups are much less — see `agents/conductor.md` step 1b)

## Quick start

**One-time setup** — the engine stores its database at `~/.claude/data/healthcare/`, which is outside Claude Code's default sandbox write-allowlist. Add it once (create or edit `~/.claude/settings.json`):

```json
{"sandbox": {"filesystem": {"allowWrite": ["~/.claude/data/healthcare"]}}}
```

This applies to all subagents in your session, so the relay, conductor, and sweep workers all see the same database. (The skill will offer to add this for you on first run if it's missing.)

**In Claude Code**, install the healthcare plugin:

```
/plugin marketplace add anthropics/healthcare
/plugin install healthcare@healthcare   # plugin-name @ marketplace-name
```

(If you received an alpha tarball or repo path from us, point at that folder instead: `/plugin marketplace add /absolute/path/to/folder-containing-.claude-plugin`.)

**In your terminal**, set up a corpus in whatever project directory you want to work from:

```bash
mkdir -p corpora/mycontracts
cp your-contracts/* corpora/mycontracts/   # .pdf, .docx, .xlsx, .pptx, .txt, .md, .html
```

**Back in Claude Code**, started from that same directory:

```
/contracts which of these have an evergreen renewal clause?
```

The skill ingests the corpus on first use, shows you its understanding of the question (the brief) plus a cost estimate for confirmation, runs the sweep, asks you in chat if it hits an ambiguity it can't resolve, and prints a cited report. After the report it asks how the answer was — that feedback (de-identified) goes into an observations log you can share with us.

## What's local (MVP caveats)

This is **single-user, local-only** today:

- State (db, reports, observations log) lives at `~/.claude/data/healthcare/contracts/` — machine-global so learned knowledge and cost calibration carry across projects, persists across plugin upgrades. Override the parent dir with `$CLAUDE_HEALTHCARE_DATA` (the skill appends `/contracts`).
- The schema is still moving; if you upgrade to a newer alpha, delete `~/.claude/data/healthcare/contracts/` and the corpus will be re-ingested automatically on the next `/contracts` (there's no migration).
- The corpus must be on the **local filesystem**. MCP connectors and other data-access patterns are planned; today it reads files from `corpora/`.

## Security (alpha)

The engine reads contract text as untrusted input and runs as a Claude Code subagent — it inherits **your** session's sandbox and permission settings, so the boundary is whatever your session can read, write, and run. Mitigations in place: the question and document text are wrapped with treat-as-data instructions; all db writes go through one allowlisted CLI with schema-trigger verification.

Accepted for alpha (design partners, own machines, corpora they control):

- **On first run, if [bun](https://bun.sh) isn't already installed, the bootstrap runs the official installer (`curl -fsSL https://bun.sh/install | bash`) automatically.** This is the same command the README previously asked you to run by hand; it executes a remote script from bun.sh over HTTPS. If you'd rather install bun yourself first (e.g. via `brew install oven-sh/bun/bun`), do so before invoking `/contracts` and the auto-install is skipped.
- The inspector binds `127.0.0.1:6226` with **no auth and no origin check**. Don't expose the port, and don't browse untrusted sites while it's running — a page could DNS-rebind to read run data or POST feedback/ratify.
- `Read`/`Grep` and `cli ingest` are not confined to the corpus path; they reach wherever your session can.
- **Don't run this on a corpus you don't trust.**

Planned: read confinement on the engine to corpus + data dir, and the inspector behind a session token.

## Seeing the full run

Chat shows the question, the brief, the queue, and the final report — that's everything you need to use it. For the full run detail — per-document findings, verified citations, audit log, knowledge proposals (with ratify/reject buttons), and a feedback box — run `bun <skill-dir>/scripts/cli.ts serve` in a terminal and open **http://127.0.0.1:6226** (or `/<run_id>` for a specific run). It refreshes every few seconds; mostly read-only.

## How it's built

- `SKILL.md` — the chat front-end: bootstraps paths, spawns the engine subagent, relays its pauses and report to the user.
- `agents/conductor.md` — the engine subagent: system prompt + tool allowlist + the run flow (reformulate → confirm-brief → scope → sweep → triage → synthesize). Spawned via the Agent tool; inherits the user's Claude Code auth and sandbox. **This is the file to read or edit to understand or change run behavior.** The six `skills/*/SKILL.md` it references are its steps.
- `scripts/cli.ts` — the only write channel to the database (`schema`, `sql`, `write`, `set`, `cite`, `find`, `preprocess`, `sync`, `ingest`, `drop`, `ui`).
- `scripts/db.ts` — opens SQLite, applies `schema.sql`, exports paths and the zod write-schemas.
- `schema.sql` — tables, views, triggers. Citations verify against `documents.content` at insert time; if the row exists, the quote is real.
- `package.json` — zod + liteparse (PDF extraction); `bun install` runs once on first use.
