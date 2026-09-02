#!/usr/bin/env python3
"""
Scan a Synthea export directory, select diverse patients, copy bundles into synthea-data.

Default destination: <repo>/synthea-data (override with --dest-dir).

Usage:
  python evals/ingest_latest_synthea.py --source /path/to/synthea_export --dry-run
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

_SKILL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_SKILL_ROOT / "scripts"))
from clinical_trend_analysis import analyze_clinical_trends, is_ace_inhibitor  # noqa: E402

from bundle_extract import extract_from_bundle_path, is_patient_bundle_file  # noqa: E402

# Prefer trend gold on labs that are not trivial growth-chart style for eval diversity
LOW_SIGNAL_LABS = ("body height", "body mass index")


def _existing_patient_ids(synthea_dir: Path) -> set[str]:
    ids: set[str] = set()
    for p in synthea_dir.glob("*.json"):
        if "information" in p.name.lower():
            continue
        # UUID is last segment before .json in Synthea filenames
        stem = p.stem
        if "_" in stem:
            pid = stem.rsplit("_", 1)[-1]
            ids.add(pid)
    return ids


def _score_record(path: Path, pid: str, meds: list, pred: dict) -> dict:
    trends = pred.get("trends", [])
    gaps = [g["rule_id"] for g in pred.get("safety_gaps", [])]
    inc = sum(1 for t in trends if t.get("classification") == "increase")
    dec = sum(1 for t in trends if t.get("classification") == "decrease")
    flat = sum(1 for t in trends if t.get("classification") == "no_material_change")
    meaningful = [
        t
        for t in trends
        if t.get("classification") in ("increase", "decrease")
        and not any(x in (t.get("lab") or "").lower() for x in LOW_SIGNAL_LABS)
    ]
    has_ace = any(is_ace_inhibitor(m.name) for m in meds if getattr(m, "date", None))
    return {
        "path": str(path),
        "patient_id": pid,
        "trend_count": len(trends),
        "acei_gap": "acei_missing_k" in gaps,
        "has_ace_med": has_ace,
        "meaningful_trends": meaningful[:5],
        "inc": inc,
        "dec": dec,
        "flat": flat,
        "pred": pred,
    }


def _gold_snapshot(record: dict) -> dict:
    pred = record["pred"]
    mt = record.get("meaningful_trends") or []
    trends = pred.get("trends", [])
    picks = mt[:2] if mt else trends[:2]
    et = [{"medication": t["medication"], "lab": t["lab"], "classification": t["classification"]} for t in picks]
    rules = [g["rule_id"] for g in pred.get("safety_gaps", [])]
    return {"expected_trends": et, "expected_safety_rules": rules}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="Directory of Synthea patient bundle JSON files")
    ap.add_argument(
        "--dest-dir",
        type=Path,
        default=_SKILL_ROOT / "synthea-data",
        help="Target directory for copied bundles (default: <repo>/synthea-data)",
    )
    ap.add_argument("--max-copy", type=int, default=25, help="Max new bundle files to copy")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    source = Path(args.source).resolve()
    synthea_dir = Path(args.dest_dir).resolve()

    if not source.is_dir():
        print(f"Source not found: {source}", file=sys.stderr)
        sys.exit(1)
    if not synthea_dir.is_dir():
        print(f"synthea-data not found: {synthea_dir}", file=sys.stderr)
        sys.exit(1)

    existing = _existing_patient_ids(synthea_dir)
    files = sorted(p for p in source.iterdir() if p.is_file() and is_patient_bundle_file(p))

    scored: list[dict] = []
    for path in files:
        pid, meds, labs = extract_from_bundle_path(path)
        if not pid:
            continue
        if pid in existing:
            continue
        pred = analyze_clinical_trends(pid, meds, labs)
        scored.append(_score_record(path, pid, meds, pred))

    ace_gap = [r for r in scored if r["acei_gap"]]
    meaningful = [r for r in scored if r["meaningful_trends"]]
    meaningful.sort(key=lambda x: x["trend_count"])
    any_trend = sorted([r for r in scored if r["trend_count"] > 0], key=lambda x: x["trend_count"])
    no_trend = [r for r in scored if r["trend_count"] == 0 and not r["acei_gap"]]

    # ACE present but no gap (negative control for safety rule)
    ace_no_gap: list[dict] = []
    for r in scored:
        if r["acei_gap"]:
            continue
        if r["has_ace_med"]:
            ace_no_gap.append(r)

    selected: list[dict] = []
    seen: set[str] = set()

    def take(pool: list[dict], n: int, key: str) -> None:
        nonlocal selected
        k = 0
        for r in pool:
            if len(selected) >= args.max_copy or k >= n:
                return
            if r["patient_id"] in seen:
                continue
            selected.append({**r, "pick_reason": key})
            seen.add(r["patient_id"])
            k += 1

    take(ace_gap, 6, "acei_missing_k")
    take(meaningful, 5, "meaningful_trend")
    take(any_trend, 4, "any_trend")
    take(ace_no_gap, 3, "ace_without_gap")
    take(no_trend, 3, "no_trend_negative")

    # Fill up to max_copy from remaining scored
    for r in scored:
        if len(selected) >= args.max_copy:
            break
        if r["patient_id"] in seen:
            continue
        selected.append({**r, "pick_reason": "fill"})
        seen.add(r["patient_id"])

    report = {
        "source": str(source),
        "dest": str(synthea_dir),
        "candidate_files": len(scored),
        "pools": {
            "acei_missing_k": len(ace_gap),
            "meaningful_trend": len(meaningful),
            "any_trend": len(any_trend),
            "no_trend_no_gap": len(no_trend),
            "ace_without_gap": len(ace_no_gap),
        },
        "selected_for_copy": len(selected),
        "selected": [
            {
                "patient_id": r["patient_id"],
                "file": Path(r["path"]).name,
                "pick_reason": r.get("pick_reason"),
                "trend_count": r["trend_count"],
                "acei_gap": r["acei_gap"],
            }
            for r in selected
        ],
    }
    print(json.dumps(report, indent=2))

    gold_cases = []
    for r in selected:
        snap = _gold_snapshot(r)
        gold_cases.append(
            {
                "patient_id": r["patient_id"],
                "source_file": Path(r["path"]).name,
                "pick_reason": r.get("pick_reason"),
                **snap,
            }
        )

    out_gold = _SKILL_ROOT / "evals" / "gold" / "new_candidates_from_latest.json"
    if not args.dry_run:
        out_gold.write_text(json.dumps({"cases": gold_cases}, indent=2), encoding="utf-8")
        for r in selected:
            dest = synthea_dir / Path(r["path"]).name
            shutil.copy2(r["path"], dest)
        print(f"\nCopied {len(selected)} bundles to {synthea_dir}", file=sys.stderr)
        print(f"Wrote candidate gold snapshot to {out_gold}", file=sys.stderr)
    else:
        print("\nDry run: no files copied.", file=sys.stderr)


if __name__ == "__main__":
    main()
