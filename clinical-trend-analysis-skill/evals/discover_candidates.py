#!/usr/bin/env python3
"""Scan Synthea bundle directory and print cohort stats (no MCP)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_EVAL_DIR = Path(__file__).resolve().parent
_SCRIPTS_DIR = _EVAL_DIR.parent / "scripts"
for _p in (_SCRIPTS_DIR, _EVAL_DIR):
    sp = str(_p)
    if sp not in sys.path:
        sys.path.insert(0, sp)

from bundle_runner import analyze_bundle_path, iter_bundle_paths  # noqa: E402


def _default_synthea_dir(skill_root: Path) -> Path:
    env = os.environ.get("SYNTHEA_JSON_DIR")
    if env:
        return Path(env).resolve()
    return (skill_root / "synthea-data").resolve()


def main() -> None:
    import argparse

    skill_root = Path(__file__).resolve().parents[1]
    default_dir = _default_synthea_dir(skill_root)

    ap = argparse.ArgumentParser()
    ap.add_argument("--synthea-dir", type=Path, default=default_dir)
    args = ap.parse_args()
    synthea_dir = args.synthea_dir.resolve()

    paths = iter_bundle_paths(synthea_dir)
    trends_total = 0
    with_trends: list[tuple[str, int, list]] = []
    ace_gap: list[str] = []
    no_ace_gap: list[str] = []

    for path in paths:
        out = analyze_bundle_path(path)
        if not out:
            continue
        pid = out["patient_id"]
        nt = len(out.get("trends", []))
        trends_total += nt
        if nt:
            with_trends.append((pid, nt, out["trends"]))
        gaps = [g["rule_id"] for g in out.get("safety_gaps", [])]
        if "acei_missing_k" in gaps:
            ace_gap.append(pid)
        else:
            no_ace_gap.append(pid)

    report = {
        "synthea_dir": str(synthea_dir),
        "patient_count": len(paths),
        "total_trend_rows": trends_total,
        "patients_with_any_trend": len(with_trends),
        "acei_gap_patients": len(ace_gap),
        "no_acei_gap_patients": len(no_ace_gap),
        "sample_trend_patients": [
            {"patient_id": p, "trend_count": n, "first_trend": t[0] if t else None}
            for p, n, t in with_trends[:8]
        ],
        "sample_ace_gap_ids": ace_gap[:8],
        "sample_no_gap_ids": no_ace_gap[:8],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
