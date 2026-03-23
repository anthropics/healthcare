#!/usr/bin/env python3
"""
Evaluate clinical trend analysis against a gold manifest.

Standalone: reads FHIR bundles from --synthea-dir (stdlib only, no MCP).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

_EVAL_DIR = Path(__file__).resolve().parent
_SCRIPTS_DIR = _EVAL_DIR.parent / "scripts"
for _p in (_SCRIPTS_DIR, _EVAL_DIR):
    sp = str(_p)
    if sp not in sys.path:
        sys.path.insert(0, sp)

from bundle_runner import generate_predictions_from_bundles  # noqa: E402


def _safe_div(n: int, d: int) -> float | None:
    return None if d == 0 else n / d


def _default_synthea_dir(skill_root: Path) -> Path:
    """This repository: only `<repo>/synthea-data` or SYNTHEA_JSON_DIR."""
    env = os.environ.get("SYNTHEA_JSON_DIR")
    if env:
        return Path(env).resolve()
    return (skill_root / "synthea-data").resolve()


def evaluate_variation(outputs: list[dict[str, Any]], variation_gate: dict[str, int]) -> dict[str, Any]:
    anchor_patients = sum(1 for o in outputs if o.get("anchors"))
    pre_post_cases = len([t for o in outputs for t in o.get("trends", [])])
    rule_positive = sum(1 for o in outputs if any(g.get("rule_id") == "acei_missing_k" for g in o.get("safety_gaps", [])))
    rule_negative = sum(1 for o in outputs if not any(g.get("rule_id") == "acei_missing_k" for g in o.get("safety_gaps", [])))

    flags: list[str] = []
    if anchor_patients < variation_gate["min_anchor_patients"]:
        flags.append("anchor_patients")
    if pre_post_cases < variation_gate["min_pre_post_cases"]:
        flags.append("pre_post_cases")
    if rule_positive < variation_gate["min_rule_positive_cases"]:
        flags.append("rule_positive_cases")
    if rule_negative < variation_gate["min_rule_negative_cases"]:
        flags.append("rule_negative_cases")

    coverage_status = "PASS" if not flags else ("PARTIAL" if len(flags) <= 2 else "FAIL")
    return {
        "coverage_status": coverage_status,
        "counts": {
            "anchor_patients": anchor_patients,
            "pre_post_cases": pre_post_cases,
            "rule_positive_cases": rule_positive,
            "rule_negative_cases": rule_negative,
        },
        "insufficient_variation_flags": flags,
    }


def evaluate_against_gold(outputs: list[dict[str, Any]], manifest: dict[str, Any]) -> dict[str, Any]:
    cases = manifest.get("cases", [])
    by_id = {o["patient_id"]: o for o in outputs}

    trend_correct = 0
    trend_total = 0
    sg_tp = 0
    sg_fp = 0
    sg_fn = 0
    insuff_total = 0
    insuff_count = 0

    for case in cases:
        pid = case["patient_id"]
        pred = by_id.get(pid)
        if not pred:
            continue

        expected_trends = case.get("expected_trends", [])
        pred_trends = pred.get("trends", [])
        for et in expected_trends:
            trend_total += 1
            key = (et.get("medication"), et.get("lab"))
            cls = et.get("classification")
            if any(
                (t.get("medication"), t.get("lab")) == key and t.get("classification") == cls
                for t in pred_trends
            ):
                trend_correct += 1

        exp_rules = set(case.get("expected_safety_rules", []))
        pred_rules = set(g.get("rule_id") for g in pred.get("safety_gaps", []))
        sg_tp += len(exp_rules & pred_rules)
        sg_fp += len(pred_rules - exp_rules)
        sg_fn += len(exp_rules - pred_rules)

        for et in expected_trends:
            insuff_total += 1
            key = (et.get("medication"), et.get("lab"))
            if not any((t.get("medication"), t.get("lab")) == key for t in pred_trends):
                insuff_count += 1

    trend_acc = _safe_div(trend_correct, trend_total)
    precision = _safe_div(sg_tp, sg_tp + sg_fp)
    recall = _safe_div(sg_tp, sg_tp + sg_fn)
    insuff_rate = _safe_div(insuff_count, insuff_total)

    return {
        "trend_direction": {"correct": trend_correct, "total": trend_total, "accuracy": trend_acc},
        "safety_gap": {"tp": sg_tp, "fp": sg_fp, "fn": sg_fn, "precision": precision, "recall": recall},
        "insufficient_data": {
            "count": insuff_count,
            "total": insuff_total,
            "rate": insuff_rate,
            "note": "Missing expected (medication, lab) trend rows only",
        },
    }


def evaluate_thresholds(metrics: dict[str, Any], thresholds: dict[str, float], variation: dict[str, Any]) -> dict[str, Any]:
    if variation["insufficient_variation_flags"]:
        return {
            "overall": "NOT_EVALUABLE",
            "reason": "Insufficient dataset variation",
            "insufficient_variation_flags": variation["insufficient_variation_flags"],
        }

    checks = {
        "trend_direction_accuracy": (
            metrics["trend_direction"]["accuracy"] is not None
            and metrics["trend_direction"]["accuracy"] >= thresholds["trend_direction_accuracy_min"]
        ),
        "safety_gap_precision": (
            metrics["safety_gap"]["precision"] is not None
            and metrics["safety_gap"]["precision"] >= thresholds["safety_gap_precision_min"]
        ),
        "safety_gap_recall": (
            metrics["safety_gap"]["recall"] is not None
            and metrics["safety_gap"]["recall"] >= thresholds["safety_gap_recall_min"]
        ),
        "insufficient_data_rate": (
            metrics["insufficient_data"]["rate"] is None
            or metrics["insufficient_data"]["rate"] <= thresholds["insufficient_data_rate_max"]
        ),
    }
    return {"overall": "PASS" if all(checks.values()) else "FAIL", "checks": checks}


def main() -> None:
    skill_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Evaluate clinical trend analysis against gold manifest (bundle I/O, no MCP).")
    parser.add_argument(
        "--synthea-dir",
        type=Path,
        default=None,
        help="Directory of Synthea patient *.json bundles (default: SYNTHEA_JSON_DIR or ./synthea-data)",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=_EVAL_DIR / "gold" / "clinical_trends_manifest.json",
        help="Path to gold manifest JSON",
    )
    parser.add_argument(
        "--max-patients",
        type=int,
        default=None,
        help="Optional cap on bundle files processed (default: all files in synthea-dir)",
    )
    args = parser.parse_args()

    synthea_dir = (args.synthea_dir or _default_synthea_dir(skill_root)).resolve()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))

    outputs = generate_predictions_from_bundles(synthea_dir, max_patients=args.max_patients)
    variation = evaluate_variation(outputs, manifest["variation_gate"])
    metrics = evaluate_against_gold(outputs, manifest)
    thresholds = evaluate_thresholds(metrics, manifest["thresholds"], variation)

    report = {
        "coverage_status": variation["coverage_status"],
        "variation": variation,
        "metrics": metrics,
        "threshold_evaluation": thresholds,
        "synthea_dir": str(synthea_dir),
        "bundles_processed": len(outputs),
        "recommended_actions": (
            ["Expand cohort or add synthetic edge cases before claiming precision."]
            if variation["insufficient_variation_flags"]
            else []
        ),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
