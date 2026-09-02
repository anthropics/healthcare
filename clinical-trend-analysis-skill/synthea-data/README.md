# Local FHIR bundles (optional)

Place Synthea (or compatible) **patient bundle** `*.json` files in this directory for local evals.

- Files are **gitignored** (see repository `.gitignore`).
- Typical source: [Synthea](https://github.com/synthetichealth/synthea/wiki/Getting-Started) or your own export.
- Skip `*Information*.json` unless your pipeline expects them.

Then run from repo root:

```bash
python evals/run_clinical_trend_eval.py
```

Or set `SYNTHEA_JSON_DIR` to another folder containing bundles.
