#!/usr/bin/env python3
"""
Parity tests for survival_sample_size.py and survival_sample_size.R.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "survival_sample_size.py")
R_SCRIPT = str(SCRIPT_DIR / "survival_sample_size.R")

TEST_CASES = [
    {
        "name": "event-prob defaults",
        "args": ["--hr", "0.7", "--event-prob", "0.65"],
    },
    {
        "name": "event-prob non-inferiority",
        "args": ["--hr", "0.7", "--event-prob", "0.65", "--design", "non-inferiority"],
    },
    {
        "name": "event-prob unequal allocation",
        "args": ["--hr", "0.7", "--event-prob", "0.65", "--allocation", "2.0"],
    },
    {
        "name": "event-prob high power",
        "args": ["--hr", "0.7", "--event-prob", "0.65", "--alpha", "0.01", "--power", "0.90"],
    },
    {
        "name": "event-prob high dropout",
        "args": ["--hr", "0.7", "--event-prob", "0.65", "--dropout", "0.30"],
    },
    {
        "name": "event-prob small HR",
        "args": ["--hr", "0.85", "--event-prob", "0.50"],
    },
    {
        "name": "event-prob HR > 1",
        "args": ["--hr", "1.3", "--event-prob", "0.60"],
    },
    {
        "name": "median no accrual",
        "args": ["--hr", "0.7", "--median-control", "12.0", "--follow-up", "24.0"],
    },
    {
        "name": "median with accrual",
        "args": ["--hr", "0.7", "--median-control", "12.0", "--follow-up", "18.0", "--accrual", "12.0"],
    },
    {
        "name": "median unequal allocation",
        "args": ["--hr", "0.7", "--median-control", "12.0", "--follow-up", "18.0",
                 "--accrual", "12.0", "--allocation", "2.0"],
    },
    {
        "name": "median non-inferiority",
        "args": ["--hr", "0.7", "--median-control", "12.0", "--follow-up", "24.0",
                 "--design", "non-inferiority"],
    },
    {
        "name": "median long follow-up",
        "args": ["--hr", "0.75", "--median-control", "24.0", "--follow-up", "36.0", "--accrual", "6.0"],
    },
]

NUMERIC_FIELDS = ["events_required", "sample_size", "sensitivity_analysis",
                  "hazard_ratio", "alpha", "power", "dropout_rate"]
FLOAT_FIELDS = ["event_probability"]
FLOAT_TOLERANCE = 1e-6


def run_script(cmd, args):
    result = subprocess.run(cmd + args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def compare_numeric(py_val, r_val, path=""):
    mismatches = []
    if py_val is None and r_val is None:
        return mismatches
    if py_val is None or r_val is None:
        mismatches.append(f"{path}: {py_val} vs {r_val}")
        return mismatches
    if isinstance(py_val, dict) and isinstance(r_val, dict):
        for key in set(list(py_val.keys()) + list(r_val.keys())):
            if key not in py_val:
                mismatches.append(f"{path}.{key}: missing in Python")
            elif key not in r_val:
                mismatches.append(f"{path}.{key}: missing in R")
            else:
                mismatches.extend(compare_numeric(py_val[key], r_val[key], f"{path}.{key}"))
    elif isinstance(py_val, (int, float)) and isinstance(r_val, (int, float)):
        if py_val != r_val:
            mismatches.append(f"{path}: {py_val} != {r_val}")
    elif isinstance(py_val, list) and isinstance(r_val, list):
        if len(py_val) != len(r_val):
            mismatches.append(f"{path}: length {len(py_val)} != {len(r_val)}")
        for i, (a, b) in enumerate(zip(py_val, r_val)):
            mismatches.extend(compare_numeric(a, b, f"{path}[{i}]"))
    return mismatches


def compare_float(py_val, r_val, path="", tol=FLOAT_TOLERANCE):
    mismatches = []
    if isinstance(py_val, dict) and isinstance(r_val, dict):
        for key in set(list(py_val.keys()) + list(r_val.keys())):
            if key not in py_val or key not in r_val:
                continue  # skip structural mismatches for float comparison
            mismatches.extend(compare_float(py_val[key], r_val[key], f"{path}.{key}", tol))
    elif isinstance(py_val, (int, float)) and isinstance(r_val, (int, float)):
        if abs(py_val - r_val) > tol:
            mismatches.append(f"{path}: {py_val} != {r_val} (diff={abs(py_val-r_val):.2e})")
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

        mismatches = []
        for field in NUMERIC_FIELDS:
            if field in py_data and field in r_data:
                mismatches.extend(compare_numeric(py_data[field], r_data[field], field))
        for field in FLOAT_FIELDS:
            if field in py_data and field in r_data:
                mismatches.extend(compare_float(py_data[field], r_data[field], field))

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
