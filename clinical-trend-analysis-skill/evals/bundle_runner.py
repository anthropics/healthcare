"""Generate predictions by reading Synthea bundle JSON files (no MCP)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Optional

_EVAL_DIR = Path(__file__).resolve().parent
_SCRIPTS_DIR = _EVAL_DIR.parent / "scripts"
for _p in (_SCRIPTS_DIR, _EVAL_DIR):
    sp = str(_p)
    if sp not in sys.path:
        sys.path.insert(0, sp)

from bundle_extract import extract_from_bundle_path, is_patient_bundle_file  # noqa: E402
from clinical_trend_analysis import analyze_clinical_trends  # noqa: E402


def iter_bundle_paths(synthea_dir: Path) -> list[Path]:
    if not synthea_dir.is_dir():
        return []
    return sorted(p for p in synthea_dir.iterdir() if p.is_file() and is_patient_bundle_file(p))


def analyze_bundle_path(path: Path) -> Optional[dict[str, Any]]:
    pid, meds, labs = extract_from_bundle_path(path)
    if not pid:
        return None
    return analyze_clinical_trends(patient_id=pid, meds=meds, labs=labs)


def generate_predictions_from_bundles(
    synthea_dir: Path,
    max_patients: Optional[int] = None,
) -> list[dict[str, Any]]:
    """Load each patient bundle under synthea_dir and return analyze_clinical_trends outputs."""
    outputs: list[dict[str, Any]] = []
    for i, path in enumerate(iter_bundle_paths(synthea_dir)):
        if max_patients is not None and i >= max_patients:
            break
        out = analyze_bundle_path(path)
        if out:
            outputs.append(out)
    return outputs
