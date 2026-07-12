#!/usr/bin/env python3
"""
Parity tests for adaptive_design_oc.py and adaptive_design_oc.R.

Uses wider tolerance (0.02) because the two-stage simulation compounds
RNG differences between Python and R across both stages plus the adaptive
decision logic.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "adaptive_design_oc.py")
R_SCRIPT = str(SCRIPT_DIR / "adaptive_design_oc.R")

TEST_CASES = [
    {
        "name": "defaults",
        "args": ["--effect-size", "0.3", "--std-dev", "1.0",
                 "--n1", "50", "--n2-initial", "50", "--n2-max", "150"],
    },
    {
        "name": "large effect (high power)",
        "args": ["--effect-size", "0.5", "--std-dev", "1.0",
                 "--n1", "50", "--n2-initial", "50", "--n2-max", "150"],
    },
    {
        "name": "type I error (effect=0)",
        "args": ["--effect-size", "0.0", "--std-dev", "1.0",
                 "--n1", "50", "--n2-initial", "50", "--n2-max", "150"],
        "check_type1": True,
    },
    {
        "name": "high futility bound",
        "args": ["--effect-size", "0.3", "--std-dev", "1.0",
                 "--n1", "50", "--n2-initial", "50", "--n2-max", "150",
                 "--futility-bound", "0.3"],
    },
    {
        "name": "narrow promising zone",
        "args": ["--effect-size", "0.3", "--std-dev", "1.0",
                 "--n1", "50", "--n2-initial", "50", "--n2-max", "150",
                 "--promising-lower", "0.4", "--promising-upper", "0.7"],
    },
    {
        "name": "large n2-max",
        "args": ["--effect-size", "0.3", "--std-dev", "1.0",
                 "--n1", "50", "--n2-initial", "50", "--n2-max", "300"],
    },
    {
        "name": "non-default alpha",
        "args": ["--effect-size", "0.3", "--std-dev", "1.0",
                 "--n1", "50", "--n2-initial", "50", "--n2-max", "150",
                 "--alpha", "0.05"],
    },
    {
        "name": "multiple effect sizes",
        "args": ["--effect-sizes", "0.0,0.2,0.3,0.5", "--std-dev", "1.0",
                 "--n1", "50", "--n2-initial", "50", "--n2-max", "150"],
    },
]

TOLERANCE = 0.02


def run_script(cmd, args):
    result = subprocess.run(cmd + args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def compare_results(py_data, r_data, tolerance):
    mismatches = []

    # Compare design block (exact)
    py_design = py_data.get("design", {})
    r_design = r_data.get("design", {})
    for key in ["n1_per_arm", "n2_initial_per_arm", "n2_max_per_arm", "alpha"]:
        if py_design.get(key) != r_design.get(key):
            mismatches.append(f"design.{key}: {py_design.get(key)} != {r_design.get(key)}")

    # Compare results (tolerance)
    py_results = py_data.get("results", [])
    r_results = r_data.get("results", [])
    if len(py_results) != len(r_results):
        mismatches.append(f"results length: {len(py_results)} != {len(r_results)}")
        return mismatches

    for i, (pr, rr) in enumerate(zip(py_results, r_results)):
        for key in ["power", "prob_futility_stop", "prob_sample_size_increase"]:
            pv = pr.get(key, 0)
            rv = rr.get(key, 0)
            if abs(pv - rv) > tolerance:
                mismatches.append(
                    f"results[{i}].{key}: {pv} vs {rv} (diff={abs(pv - rv):.4f})")
        for key in ["expected_n_total", "mean_n2_per_arm"]:
            pv = pr.get(key, 0)
            rv = rr.get(key, 0)
            # Wider tolerance for expected N (absolute value is larger)
            if abs(pv - rv) > tolerance * 100:
                mismatches.append(
                    f"results[{i}].{key}: {pv} vs {rv} (diff={abs(pv - rv):.1f})")

    return mismatches


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--rscript", default="Rscript")
    args = parser.parse_args()

    py_cmd = [args.python, PY_SCRIPT]
    r_cmd = [args.rscript, R_SCRIPT]

    passed = failed = errors = 0

    for test in TEST_CASES:
        name = test["name"]
        py_data, py_err = run_script(py_cmd, test["args"])
        if py_data is None:
            print(f"ERROR [{name}]: Python failed: {py_err}")
            errors += 1
            continue
        r_data, r_err = run_script(r_cmd, test["args"])
        if r_data is None:
            print(f"ERROR [{name}]: R failed: {r_err}")
            errors += 1
            continue

        mismatches = compare_results(py_data, r_data, TOLERANCE)

        # Type I error check: both must be <= alpha
        if test.get("check_type1"):
            alpha = py_data["design"]["alpha"]
            for label, data in [("Python", py_data), ("R", r_data)]:
                power = data["results"][0]["power"]
                if power > alpha + 0.01:  # small tolerance for MC noise
                    mismatches.append(
                        f"{label} Type I error {power} exceeds alpha {alpha}")

        if mismatches:
            print(f"FAIL [{name}]:")
            for m in mismatches:
                print(f"  {m}")
            failed += 1
        else:
            print(f"PASS [{name}]")
            passed += 1

    print(f"\n{passed} passed, {failed} failed, {errors} errors out of {len(TEST_CASES)} tests")
    sys.exit(1 if (failed > 0 or errors > 0) else 0)


if __name__ == "__main__":
    main()
