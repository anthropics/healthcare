#!/usr/bin/env python3
"""
Parity tests for sample_size_calculator.py and sample_size_calculator.R.

Runs both scripts with identical inputs and verifies that all numeric outputs
(sample sizes, sensitivity analyses) match exactly. String formatting differences
(e.g. "5.0" vs "5") are ignored.

Usage:
    python scripts/test_sample_size_parity.py
    python scripts/test_sample_size_parity.py --python /path/to/python --rscript /path/to/Rscript
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "sample_size_calculator.py")
R_SCRIPT = str(SCRIPT_DIR / "sample_size_calculator.R")

TEST_CASES = [
    {
        "name": "continuous defaults",
        "args": ["--type", "continuous", "--effect-size", "5.0", "--std-dev", "15.0"],
    },
    {
        "name": "continuous non-inferiority",
        "args": ["--type", "continuous", "--effect-size", "5.0", "--std-dev", "15.0",
                 "--design", "non-inferiority"],
    },
    {
        "name": "continuous unequal allocation",
        "args": ["--type", "continuous", "--effect-size", "5.0", "--std-dev", "15.0",
                 "--allocation", "2.0"],
    },
    {
        "name": "continuous high power",
        "args": ["--type", "continuous", "--effect-size", "5.0", "--std-dev", "15.0",
                 "--alpha", "0.01", "--power", "0.90"],
    },
    {
        "name": "continuous high dropout",
        "args": ["--type", "continuous", "--effect-size", "5.0", "--std-dev", "15.0",
                 "--dropout", "0.30"],
    },
    {
        "name": "continuous small effect",
        "args": ["--type", "continuous", "--effect-size", "1.0", "--std-dev", "20.0"],
    },
    {
        "name": "binary defaults",
        "args": ["--type", "binary", "--p1", "0.60", "--p2", "0.75"],
    },
    {
        "name": "binary non-inferiority",
        "args": ["--type", "binary", "--p1", "0.60", "--p2", "0.75",
                 "--design", "non-inferiority"],
    },
    {
        "name": "binary unequal allocation",
        "args": ["--type", "binary", "--p1", "0.60", "--p2", "0.75",
                 "--allocation", "2.0"],
    },
    {
        "name": "binary custom alpha/power",
        "args": ["--type", "binary", "--p1", "0.60", "--p2", "0.75",
                 "--alpha", "0.01", "--power", "0.90"],
    },
    {
        "name": "binary high dropout",
        "args": ["--type", "binary", "--p1", "0.60", "--p2", "0.75",
                 "--dropout", "0.30"],
    },
    {
        "name": "binary small difference",
        "args": ["--type", "binary", "--p1", "0.50", "--p2", "0.55"],
    },
    {
        "name": "binary treatment worse",
        "args": ["--type", "binary", "--p1", "0.75", "--p2", "0.60"],
    },
]

# Fields that must match exactly (numeric values)
NUMERIC_FIELDS = ["sample_size", "sensitivity_analysis", "cohens_d", "effect_size",
                  "alpha", "power", "dropout_rate"]


def run_script(cmd, args):
    result = subprocess.run(cmd + args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def compare_numeric(py_val, r_val, path=""):
    """Recursively compare numeric values. Returns list of mismatch descriptions."""
    mismatches = []
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
    parser = argparse.ArgumentParser(description="Parity tests for sample size calculators")
    parser.add_argument("--python", default=sys.executable, help="Python interpreter path")
    parser.add_argument("--rscript", default="Rscript", help="Rscript path")
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
            print(f"ERROR [{name}]: Python script failed: {py_err}")
            errors += 1
            continue

        r_data, r_err = run_script(r_cmd, test_args)
        if r_data is None:
            print(f"ERROR [{name}]: R script failed: {r_err}")
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
