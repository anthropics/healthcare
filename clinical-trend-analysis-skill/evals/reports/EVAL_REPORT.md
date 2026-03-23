# Clinical trend analysis — evaluation report

**Purpose:** Summary of automated evaluation (FHIR bundles on disk → `analyze_clinical_trends` + gold manifest). **No MCP** required.

**Disclaimer:** Metrics are computed on **synthetic** Synthea-style bundles when you supply them. For **regression / QA only**, not clinical validation.

---

## Scope

| Item | Value |
|------|--------|
| **Analyzer** | `scripts/clinical_trend_analysis.py` |
| **Data** | `SYNTHEA_JSON_DIR` or `./synthea-data/*.json` |
| **Gold** | `evals/gold/clinical_trends_manifest.json` |

Re-run `python evals/run_clinical_trend_eval.py` after changing code, gold, or dataset; refresh this file and `latest_eval_results.json` for PRs.

---

## Reproducibility

```bash
# clone this repo, add bundles under synthea-data/ or set SYNTHEA_JSON_DIR
python evals/run_clinical_trend_eval.py
```

Optional MCP: `scripts/mcp_adapter.py` + `requirements-mcp.txt`.

---

## Related files

| Path | Role |
|------|------|
| `evals/run_clinical_trend_eval.py` | Eval harness |
| `evals/gold/clinical_trends_manifest.json` | Gold + thresholds |
| `evals/reports/latest_eval_results.json` | Last metrics snapshot |
