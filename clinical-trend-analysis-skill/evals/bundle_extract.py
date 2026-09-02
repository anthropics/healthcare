"""
Extract MedicationEvent / LabObservation lists from a Synthea FHIR R4 bundle JSON
for use with clinical_trend_analysis.analyze_clinical_trends.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import sys

_SKILL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_SKILL_ROOT / "scripts"))
from clinical_trend_analysis import LabObservation, MedicationEvent, parse_dt


def _obs_display(obs: dict[str, Any]) -> str:
    code = obs.get("code") or {}
    if code.get("text"):
        return str(code["text"]).strip()
    codings = code.get("coding") or []
    if codings:
        return str(codings[0].get("display") or codings[0].get("code") or "Unknown").strip()
    return "Unknown"


def _med_display(mr: dict[str, Any]) -> str:
    mcc = mr.get("medicationCodeableConcept") or {}
    if mcc.get("text"):
        return str(mcc["text"]).strip()
    codings = mcc.get("coding") or []
    if codings:
        return str(codings[0].get("display") or codings[0].get("code") or "Unknown").strip()
    ref = mr.get("medicationReference", {})
    if ref.get("display"):
        return str(ref["display"]).strip()
    return "Unknown medication"


def _patient_id_from_ref(ref: str) -> Optional[str]:
    if not ref:
        return None
    if ref.startswith("Patient/"):
        return ref.split("/", 1)[1]
    return None


def extract_from_bundle_path(path: Path) -> tuple[Optional[str], list[MedicationEvent], list[LabObservation]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("resourceType") != "Bundle":
        return None, [], []

    patient_id: Optional[str] = None
    entries = data.get("entry", [])

    for entry in entries:
        res = entry.get("resource") or {}
        if res.get("resourceType") == "Patient" and res.get("id"):
            patient_id = res["id"]
            break

    meds: list[MedicationEvent] = []
    labs: list[LabObservation] = []

    for entry in entries:
        res = entry.get("resource") or {}
        rtype = res.get("resourceType")
        subj = _patient_id_from_ref((res.get("subject") or {}).get("reference", ""))
        if patient_id and subj and subj != patient_id:
            continue

        if rtype == "MedicationRequest":
            name = _med_display(res)
            status = str(res.get("status", "")).strip() or "unknown"
            raw_date = res.get("authoredOn") or res.get("authored_on")
            dt = parse_dt(str(raw_date)) if raw_date else None
            meds.append(MedicationEvent(name=name, status=status, date=dt))
        elif rtype == "Observation":
            vq = res.get("valueQuantity") or {}
            value = vq.get("value")
            unit = str(vq.get("unit") or "").strip()
            try:
                fval = float(value) if value is not None else None
            except (TypeError, ValueError):
                fval = None
            eff = res.get("effectiveDateTime") or res.get("issued") or ""
            dt = parse_dt(str(eff)) if eff else None
            labs.append(LabObservation(name=_obs_display(res), value=fval, unit=unit, date=dt))

    return patient_id, meds, labs


def is_patient_bundle_file(path: Path) -> bool:
    n = path.name.lower()
    if not n.endswith(".json"):
        return False
    if "information" in n:
        return False
    return True
