# Method Details

## Interface for consuming from MCP server
Reasoning code must not onsume raw MCP/FHIR responses directly. Uses an adapter that returns normalized objects that the skill understands:
- `MedicationEvent {name, status, date}`
- `LabObservation {name, value, unit, date}`
- `SafetyGap {rule_id, trigger_evidence, missing_evidence, severity, lookback_days}`

## Temporal Windowing
For medication event time `T0`:
- Pre: `[T0 - window_pre_days, T0)`
- Post: `(T0, T0 + window_post_days]`

Minimum data policy:
- If no pre values -> `insufficient_data`
- If no post values -> `insufficient_data`

## Baseline Normalization
- Baseline mean uses all numeric values in pre-window.
- Post representative value defaults to nearest post measurement.
- Compute:
  - `delta_abs = post - baseline_mean`
  - `delta_pct = delta_abs / baseline_mean` (if baseline non-zero)

Direction:
- `increase` if delta_abs > epsilon
- `decrease` if delta_abs < -epsilon
- `no_material_change` otherwise

## Negative Evidence Rules. More alerts can be added 
Initial rule set:
- `acei_missing_k`: if ACE inhibitor exposure is active and no Potassium observation in lookback interval, raise gap.

Rule fields:
- `rule_id`
- `trigger_evidence`
- `missing_evidence`
- `lookback_days`
- `severity`
- `suggested_follow_up`
