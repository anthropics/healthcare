"""
Core clinical trend analysis (pure logic). No MCP dependency.

- Bundle I/O: evals/bundle_extract.py + evals/bundle_runner.py
- MCP (optional): scripts/mcp_adapter.py
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional


@dataclass
class MedicationEvent:
    name: str
    status: str
    date: Optional[datetime]


@dataclass
class LabObservation:
    name: str
    value: Optional[float]
    unit: str
    date: Optional[datetime]


@dataclass
class SafetyGap:
    rule_id: str
    trigger_evidence: str
    missing_evidence: str
    lookback_days: int
    severity: str
    suggested_follow_up: str


def parse_dt(raw: str) -> Optional[datetime]:
    if not raw or raw == "?":
        return None
    v = raw.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(v)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def is_ace_inhibitor(name: str) -> bool:
    lowered = name.lower()
    ace_keywords = [
        "lisinopril",
        "enalapril",
        "ramipril",
        "benazepril",
        "captopril",
        "quinapril",
        "fosinopril",
        "perindopril",
        "trandolapril",
    ]
    return any(k in lowered for k in ace_keywords)


def infer_trend(delta_abs: float, epsilon: float = 1e-9) -> str:
    if delta_abs > epsilon:
        return "increase"
    if delta_abs < -epsilon:
        return "decrease"
    return "no_material_change"


def _to_iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_to_iso(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_iso(v) for k, v in value.items()}
    return value


def _lab_matches(name: str, focus_labs: Optional[list[str]]) -> bool:
    if not focus_labs:
        return True
    lowered = name.lower()
    return any(token.lower() in lowered for token in focus_labs)


def analyze_clinical_trends(
    patient_id: str,
    meds: list[MedicationEvent],
    labs: list[LabObservation],
    window_days_pre: int = 30,
    window_days_post: int = 30,
    focus_labs: Optional[list[str]] = None,
    safety_lookback_days: int = 90,
) -> dict[str, Any]:
    anchors = [m for m in meds if m.date is not None and m.status.lower() in {"active", "completed", "on-hold", "stopped"}]
    anchors.sort(key=lambda x: x.date or datetime.min.replace(tzinfo=timezone.utc))

    trends: list[dict[str, Any]] = []
    insufficient_data_flags: list[str] = []

    numeric_labs = [l for l in labs if l.value is not None and l.date is not None]

    for anchor in anchors:
        t0 = anchor.date
        if not t0:
            continue
        pre_start = t0 - timedelta(days=window_days_pre)
        post_end = t0 + timedelta(days=window_days_post)

        names = sorted(set(l.name for l in numeric_labs if _lab_matches(l.name, focus_labs)))
        for lab_name in names:
            rel = [l for l in numeric_labs if l.name == lab_name]
            pre_vals = [l for l in rel if l.date and pre_start <= l.date < t0]
            post_vals = [l for l in rel if l.date and t0 < l.date <= post_end]
            pre_nums = [l.value for l in pre_vals if l.value is not None]
            post_sorted = sorted(post_vals, key=lambda x: x.date or t0)
            post_nums = [l.value for l in post_sorted if l.value is not None]

            if not pre_nums or not post_nums:
                insufficient_data_flags.append(f"{anchor.name}:{lab_name}:{t0.isoformat()}")
                continue

            baseline_mean = sum(pre_nums) / len(pre_nums)
            post_value = post_nums[0]
            delta_abs = post_value - baseline_mean
            delta_pct = None if abs(baseline_mean) < 1e-9 else delta_abs / baseline_mean
            trends.append(
                {
                    "medication": anchor.name,
                    "medication_status": anchor.status,
                    "lab": lab_name,
                    "classification": infer_trend(delta_abs),
                    "baseline_mean": baseline_mean,
                    "post_value": post_value,
                    "delta_abs": delta_abs,
                    "delta_pct": delta_pct,
                    "evidence": {
                        "anchor_date": t0,
                        "pre_values": pre_nums,
                        "post_values": post_nums,
                    },
                }
            )

    safety_gaps: list[SafetyGap] = []
    if labs:
        newest_lab_dt = max((l.date for l in labs if l.date is not None), default=None)
    else:
        newest_lab_dt = None

    if newest_lab_dt:
        window_start = newest_lab_dt - timedelta(days=safety_lookback_days)
        has_recent_k = any(
            l.date and l.date >= window_start and "potassium" in l.name.lower() and l.value is not None for l in labs
        )
    else:
        has_recent_k = False

    for anchor in anchors:
        if is_ace_inhibitor(anchor.name) and not has_recent_k:
            safety_gaps.append(
                SafetyGap(
                    rule_id="acei_missing_k",
                    trigger_evidence=f"Medication event: {anchor.name} ({anchor.status}) on {anchor.date.isoformat() if anchor.date else 'unknown'}",
                    missing_evidence=f"No Potassium lab in last {safety_lookback_days} days",
                    lookback_days=safety_lookback_days,
                    severity="moderate",
                    suggested_follow_up="Review monitoring protocol; consider Potassium lab if clinically appropriate.",
                )
            )
            break

    result = {
        "patient_id": patient_id,
        "anchors": [asdict(a) for a in anchors],
        "trends": trends,
        "safety_gaps": [asdict(g) for g in safety_gaps],
        "data_quality": {"insufficient_data_flags": insufficient_data_flags},
    }
    return _to_iso(result)
