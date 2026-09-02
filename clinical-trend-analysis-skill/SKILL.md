---
name: clinical-trend-analysis-skill
description: Analyze patient-level clinical trends around medication changes using temporal windows and baseline normalization, and detect negative evidence monitoring gaps. Use when evaluating lab response after medication events, checking monitoring adherence (e.g., ACE inhibitor with missing potassium), or producing structured trend summaries from FHIR/MCP data.
---

# Clinical Trend Analysis Skill

## Purpose
Provide a portable, interface-first method for patient-level clinical trend analysis:
- Separate **Data Retrieval** from **Clinical Reasoning**.
- Compute trends using pre/post temporal windows around medication events.
- Detect monitoring safety gaps using negative evidence checks.

## Interfaces
Reasoning consumes normalized retrieval interfaces, not MCP implementation details:
- `get_patient_context(patient_id)`
- `get_medication_events(patient_id, med_filter?)`
- `get_labs(patient_id, lab_filter?, start_date?, end_date?)`
- `get_conditions(patient_id, condition_filter?)`
- `analyze_clinical_trends(request) -> result`

## Core Reasoning Rules
1. **Temporal Windowing**
   - Anchor on medication start/change event `T0`.
   - Pre-window: `[T0 - 30d, T0)`.
   - Post-window: `(T0, T0 + 30d]`.
2. **Baseline Normalization**
   - Baseline mean = mean of pre-window values.
   - Compare post value to baseline with absolute and percent deltas.
3. **Negative Evidence Checks**
   - Example: active ACE inhibitor without recent Potassium lab -> emit safety gap.

## Outputs
Return machine-readable JSON:
- medication anchor events
- trend findings with evidence pointers
- baseline/delta values
- confidence/data sufficiency flags
- safety gap findings

## Evaluation Expectations
- Standalone (no MCP): from the repository root run `python evals/run_clinical_trend_eval.py` with bundles on disk (`--synthea-dir` or `SYNTHEA_JSON_DIR`; default `./synthea-data/`).
- Gold file: `evals/gold/clinical_trends_manifest.json`.
- Report precision/recall; metrics may be `NOT_EVALUABLE` if dataset variation is insufficient.

## References
- [Method Details](references/method.md)
- [Example Output](examples/sample-output.md)
