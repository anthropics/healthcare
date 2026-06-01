# Contributing to the Healthcare Marketplace

Thanks for your interest in contributing! This repository contains Claude Code skills and remote MCP connector plugins for healthcare workflows. Contributions are welcome, from small documentation fixes to entirely new skills.

## Ground rules

- All changes land through pull requests. `main` is protected: every PR needs at least one maintainer approval (plus code-owner review for sensitive paths), and merge commits must be signed.
- Automated review workflows run on every PR (general code review, plus a skill-specific review when a `SKILL.md` directory changes). Please address their findings or explain why they don't apply.
- Maintainers may decline contributions that don't fit the marketplace's scope or quality bar, even if they are technically correct.

## What we welcome

- **Documentation fixes** — typos, broken links, missing entries in the README or marketplace manifest. Keep them small and easy to verify.
- **Improvements to existing skills** — bug fixes in scripts, clearer references, better examples, added language support.
- **New skills** — see the checklist below.
- **MCP connector metadata fixes** — corrections to descriptions or tags. Endpoint URL changes get extra scrutiny (see below).

## Repository layout

| Path | Purpose |
|------|---------|
| `<name>-skill/` | A Claude Code skill: `SKILL.md`, `README.md`, optional `references/`, `scripts/`, `assets/` |
| `<connector>/.claude-plugin/plugin.json` | A remote MCP connector definition (name, description, endpoint URL) |
| `.claude-plugin/marketplace.json` | The marketplace manifest — every plugin must be registered here |
| `README.md` | User-facing list of skills and connectors, with install commands |
| `.github/workflows/` | Automated PR review and release workflows |

## Adding a new skill

Before opening a PR for a new skill, make sure it meets all of the following:

1. **Layout** matches the existing skills: `SKILL.md` and `README.md` at the skill root, with supporting material under `references/`, `scripts/`, and `assets/`.
2. **`SKILL.md` frontmatter** contains `name` and `description`, and the description includes concrete "Use when…" trigger phrasing so the skill activates reliably. Don't add unsupported frontmatter keys.
3. **Registration**: add the plugin to `.claude-plugin/marketplace.json` and to the top-level `README.md`. Skills that aren't registered aren't installable and won't be merged.
4. **Dependencies** (Python packages, R packages, external tools) are documented in the skill README and SKILL.md, and the scripts run as documented.
5. **Sample data is clearly synthetic.** No PHI, no real patient/member/provider identifiers, and nothing that looks realistic enough to be mistaken for real data (names, SSNs, member IDs, dates of birth).
6. **Human in the loop.** Skills that touch clinical, coverage, or payer decisions must be framed as decision support with explicit human review points, and must not instruct the model to fabricate, simulate, or extrapolate data, statistics, or evidence.
7. **No stray artifacts.** Don't commit run outputs (`waypoints/`, `outputs/`), OS files (`.DS_Store`), editor configs, or setup instructions that point at personal forks.
8. **Tests/evals** (if included) document how to run them from the skill directory, and gold/expected data is independent of the code being evaluated.

## Changing the README or connector metadata

The top-level `README.md`, `.claude-plugin/marketplace.json`, and the per-connector `plugin.json` files are what users copy-paste to install plugins and decide which MCP endpoints to trust. PRs touching install commands or endpoint URLs receive extra scrutiny:

- URLs in the README must exactly match the corresponding `plugin.json`.
- Adding or changing an MCP endpoint URL requires code-owner approval.

## Pull request guidelines

- Keep PRs focused: one skill or one fix per PR.
- Describe what changed and how you verified it (commands run, files checked).
- Be responsive to review feedback; inactive PRs may be closed.

## Licensing

See the repository README for terms. By submitting a contribution you confirm you have the right to contribute it under those terms.

## Questions

Open a GitHub issue if you're unsure whether a contribution fits before investing significant effort.
