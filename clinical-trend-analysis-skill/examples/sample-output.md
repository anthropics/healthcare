# Sample Output

```json
{
  "patient_id": "123",
  "anchors": [
    {"medication": "Lisinopril", "status": "active", "date": "2022-08-15"}
  ],
  "trends": [
    {
      "medication": "Lisinopril",
      "lab": "Potassium",
      "classification": "increase",
      "baseline_mean": 4.1,
      "post_value": 4.5,
      "delta_abs": 0.4,
      "delta_pct": 0.0976,
      "evidence": {
        "anchor_date": "2022-08-15",
        "pre_values": [4.0, 4.2],
        "post_values": [4.5]
      }
    }
  ],
  "safety_gaps": [
    {
      "rule_id": "acei_missing_k",
      "trigger_evidence": "Active ACE inhibitor: Lisinopril",
      "missing_evidence": "No Potassium lab in last 90 days",
      "lookback_days": 90,
      "severity": "moderate",
      "suggested_follow_up": "Consider ordering a Potassium lab per monitoring protocol."
    }
  ],
  "data_quality": {
    "insufficient_data_flags": []
  }
}
```
