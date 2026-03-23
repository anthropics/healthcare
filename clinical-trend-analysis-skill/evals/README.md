# Evals

Reads **Synthea FHIR Bundle JSON** from disk. **No MCP** required.

## Commands

```bash
# repository root
export SYNTHEA_JSON_DIR=/path/to/bundles   # optional if ./synthea-data has *.json
python evals/run_clinical_trend_eval.py
python evals/discover_candidates.py
python evals/ingest_latest_synthea.py --source /path/to/synthea_export --dry-run
```

## Layout

| File | Role |
|------|------|
| `run_clinical_trend_eval.py` | Full eval vs `gold/clinical_trends_manifest.json` |
| `bundle_extract.py` | FHIR → `MedicationEvent` / `LabObservation` |
| `bundle_runner.py` | Scan directory → predictions |
| `discover_candidates.py` | Cohort stats |
| `ingest_latest_synthea.py` | Copy selected bundles into `./synthea-data` |
| `gold/` | Manifest + optional snapshots |
| `reports/` | `EVAL_REPORT.md` + JSON snapshot |
