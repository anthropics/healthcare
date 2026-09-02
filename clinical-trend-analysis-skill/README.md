# Clinical trend analysis skill


Medication–lab temporal trends and monitoring-gap checks (e.g. `acei_missing_k`) from local FHIR **bundle JSON** . **No dashboard, backend, or demo app**—this repo is only the skill, eval harness, and docs.

## Contents

| Path | Purpose |
|------|---------|
| `SKILL.md` | Agent / marketplace entry |
| `scripts/clinical_trend_analysis.py` | Core logic (**stdlib only**) |
| `scripts/mcp_adapter.py` | **Optional** MCP stdio client (`pip install -r requirements-mcp.txt`) |
| `evals/` | Gold manifest, bundle eval, ingest helpers |
| `synthea-data/` | Put Synthea patient `*.json` bundles here locally (see `synthea-data/README.md`; `*.json` gitignored) |

## Eval (no MCP, no extra deps)

```bash
# From repository root (this folder)
python evals/run_clinical_trend_eval.py
```

Uses `SYNTHEA_JSON_DIR` or `./synthea-data/` for bundles. See `evals/README.md`.

**Python:** 3.11+ recommended.

## Optional: MCP

If you have an MCP server that exposes the same tool text formats as this adapter expects:

```bash
pip install -r requirements-mcp.txt
python scripts/mcp_adapter.py --patient-id <UUID> \
  --python-bin /path/to/python \
  --mcp-script /path/to/mcp_server.py \
  --synthea-dir /path/to/bundle/dir
```

## Data

See [DATA.md](DATA.md). Bundles are not committed; add your own or use a release zip.

## Repository layout

See [GITHUB_SETUP.md](GITHUB_SETUP.md) for clone/push URLs (`rupesh-kartha/skills`).
