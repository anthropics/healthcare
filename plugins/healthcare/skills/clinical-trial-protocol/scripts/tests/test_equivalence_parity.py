#!/usr/bin/env python3
"""
Parity tests for equivalence_sample_size.py and equivalence_sample_size.R.

Runs both scripts with identical inputs and verifies that all numeric outputs
match exactly.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "equivalence_sample_size.py")
R_SCRIPT = str(SCRIPT_DIR / "equivalence_sample_size.R")

TEST_CASES = [
    {
        "name": "continuous equivalence defaults",
        "args": ["--type", "continuous", "--margin", "5.0", "--std-dev", "15.0"],
    },
    {
        "name": "continuous with expected diff",
        "args": ["--type", "continuous", "--margin", "5.0", "--std-dev", "15.0",
                 "--expected-diff", "1.0"],
    },
    {
        "name": "continuous tight margin",
        "args": ["--type", "continuous", "--margin", "2.0", "--std-dev", "15.0"],
    },
    {
        "name": "continuous high power",
        "args": ["--type", "continuous", "--margin", "5.0", "--std-dev", "15.0",
                 "--alpha", "0.01", "--power", "0.90"],
    },
    {
        "name": "continuous unequal allocation",
        "args": ["--type", "continuous", "--margin", "5.0", "--std-dev", "15.0",
                 "--allocation", "2.0"],
    },
    {
        "name": "continuous high dropout",
        "args": ["--type", "continuous", "--margin", "5.0", "--std-dev", "15.0",
                 "--dropout", "0.30"],
    },
    {
        "name": "binary equivalence defaults",
        "args": ["--type", "binary", "--margin", "0.15", "--p1", "0.60", "--p2", "0.60"],
    },
    {
        "name": "binary with proportion diff",
        "args": ["--type", "binary", "--margin", "0.15", "--p1", "0.60", "--p2", "0.65"],
    },
    {
        "name": "binary tight margin",
        "args": ["--type", "binary", "--margin", "0.05", "--p1", "0.50", "--p2", "0.50"],
    },
    {
        "name": "binary unequal allocation",
        "args": ["--type", "binary", "--margin", "0.15", "--p1", "0.60", "--p2", "0.60",
                 "--allocation", "2.0"],
    },
    {
        "name": "binary custom alpha/power",
        "args": ["--type", "binary", "--margin", "0.15", "--p1", "0.60", "--p2", "0.65",
                 "--alpha", "0.025", "--power", "0.90"],
    },
    {
        "name": "binary high dropout",
        "args": ["--type", "binary", "--margin", "0.15", "--p1", "0.60", "--p2", "0.65",
                 "--dropout", "0.30"],
    },
]

NUMERIC_FIELDS = ["sample_size", "sensitivity_analysis", "equivalence_margin",
                  "expected_difference", "alpha", "power", "dropout_rate"]


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


def main():
    parser = argparse.ArgumentParser(description="Parity tests for equivalence calculators")
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

        mismatches = []
        for field in NUMERIC_FIELDS:
            if field in py_data and field in r_data:
                mismatches.extend(compare_numeric(py_data[field], r_data[field], field))
            elif field in py_data:
                mismatches.append(f"{field}: missing in R output")
            elif field in r_data:
                mismatches.append(f"{field}: missing in Python output")

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
