#!/usr/bin/env python3
"""
Parity tests for power_curve_generator.py and power_curve_generator.R.

Runs both scripts with identical inputs and verifies that all numeric outputs
match. Integer fields must match exactly; float fields use tolerance of 1e-6.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "power_curve_generator.py")
R_SCRIPT = str(SCRIPT_DIR / "power_curve_generator.R")

TEST_CASES = [
    {
        "name": "continuous vary effect-size defaults",
        "args": ["--type", "continuous", "--vary", "effect-size",
                 "--min", "2.0", "--max", "10.0", "--steps", "5",
                 "--std-dev", "15.0"],
    },
    {
        "name": "continuous vary effect-size non-inferiority",
        "args": ["--type", "continuous", "--vary", "effect-size",
                 "--min", "2.0", "--max", "10.0", "--steps", "5",
                 "--std-dev", "15.0", "--design", "non-inferiority"],
    },
    {
        "name": "continuous vary effect-size unequal allocation",
        "args": ["--type", "continuous", "--vary", "effect-size",
                 "--min", "2.0", "--max", "10.0", "--steps", "5",
                 "--std-dev", "15.0", "--allocation", "2.0"],
    },
    {
        "name": "continuous vary sample-size defaults",
        "args": ["--type", "continuous", "--vary", "sample-size",
                 "--min", "50", "--max", "500", "--steps", "10",
                 "--effect-size", "5.0", "--std-dev", "15.0"],
    },
    {
        "name": "continuous vary sample-size high alpha",
        "args": ["--type", "continuous", "--vary", "sample-size",
                 "--min", "50", "--max", "500", "--steps", "10",
                 "--effect-size", "5.0", "--std-dev", "15.0",
                 "--alpha", "0.01"],
    },
    {
        "name": "binary vary effect-size defaults",
        "args": ["--type", "binary", "--vary", "effect-size",
                 "--min", "0.05", "--max", "0.25", "--steps", "5",
                 "--p1", "0.60"],
    },
    {
        "name": "binary vary effect-size non-inferiority",
        "args": ["--type", "binary", "--vary", "effect-size",
                 "--min", "0.05", "--max", "0.25", "--steps", "5",
                 "--p1", "0.60", "--design", "non-inferiority"],
    },
    {
        "name": "binary vary sample-size defaults",
        "args": ["--type", "binary", "--vary", "sample-size",
                 "--min", "50", "--max", "600", "--steps", "10",
                 "--p1", "0.60", "--p2", "0.75"],
    },
    {
        "name": "binary vary sample-size unequal allocation",
        "args": ["--type", "binary", "--vary", "sample-size",
                 "--min", "50", "--max", "600", "--steps", "10",
                 "--p1", "0.60", "--p2", "0.75", "--allocation", "2.0"],
    },
    {
        "name": "continuous vary sample-size low N",
        "args": ["--type", "continuous", "--vary", "sample-size",
                 "--min", "4", "--max", "20", "--steps", "5",
                 "--effect-size", "1.0", "--std-dev", "20.0"],
    },
    {
        "name": "binary vary effect-size single step",
        "args": ["--type", "binary", "--vary", "effect-size",
                 "--min", "0.15", "--max", "0.15", "--steps", "1",
                 "--p1", "0.60"],
    },
]

TOLERANCE = 1e-6


def run_script(cmd, args):
    result = subprocess.run(cmd + args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def compare_curves(py_curve, r_curve):
    mismatches = []
    if len(py_curve) != len(r_curve):
        mismatches.append(f"curve length: {len(py_curve)} vs {len(r_curve)}")
        return mismatches

    for i, (py_pt, r_pt) in enumerate(zip(py_curve, r_curve)):
        for key in ["sample_size", "sample_size_with_dropout"]:
            if py_pt.get(key) != r_pt.get(key):
                mismatches.append(f"curve[{i}].{key}: {py_pt.get(key)} != {r_pt.get(key)}")
        for key in ["power", "param_value"]:
            py_val = py_pt.get(key)
            r_val = r_pt.get(key)
            if isinstance(py_val, (int, float)) and isinstance(r_val, (int, float)):
                if abs(py_val - r_val) > TOLERANCE:
                    mismatches.append(f"curve[{i}].{key}: {py_val} != {r_val}")

    return mismatches


def main():
    parser = argparse.ArgumentParser(description="Parity tests for power curve generators")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--rscript", default="Rscript")
    args = parser.parse_args()

    py_cmd = [args.python, PY_SCRIPT]
    r_cmd = [args.rscript, R_SCRIPT]

    passed = 0
    failed = 0
    errors = 0

    for test in TEST_CASES:
        name = test["name"]
        test_args = test["args"]

        py_data, py_err = run_script(py_cmd, test_args)
        if py_data is None:
            print(f"ERROR [{name}]: Python failed: {py_err}")
            errors += 1
            continue

        r_data, r_err = run_script(r_cmd, test_args)
        if r_data is None:
            print(f"ERROR [{name}]: R failed: {r_err}")
            errors += 1
            continue

        mismatches = compare_curves(py_data["curve"], r_data["curve"])

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
