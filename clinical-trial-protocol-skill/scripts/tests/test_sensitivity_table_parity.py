#!/usr/bin/env python3
"""
Parity tests for sensitivity_table_generator.py and sensitivity_table_generator.R.

Runs both scripts with identical inputs and verifies that all table cells
(integer sample sizes) match exactly.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "sensitivity_table_generator.py")
R_SCRIPT = str(SCRIPT_DIR / "sensitivity_table_generator.R")

TEST_CASES = [
    {
        "name": "continuous: dropout vs effect-size",
        "args": [
            "--type", "continuous",
            "--row-param", "dropout", "--col-param", "effect-size",
            "--row-values", "0.10,0.15,0.20,0.25,0.30",
            "--col-values", "3.0,4.0,5.0,6.0",
            "--std-dev", "15.0",
        ],
    },
    {
        "name": "continuous: power vs std-dev",
        "args": [
            "--type", "continuous",
            "--row-param", "power", "--col-param", "std-dev",
            "--row-values", "0.80,0.85,0.90,0.95",
            "--col-values", "10.0,15.0,20.0",
            "--effect-size", "5.0",
        ],
    },
    {
        "name": "continuous: alpha vs dropout (non-inferiority)",
        "args": [
            "--type", "continuous",
            "--row-param", "alpha", "--col-param", "dropout",
            "--row-values", "0.01,0.025,0.05",
            "--col-values", "0.10,0.20,0.30",
            "--effect-size", "5.0", "--std-dev", "15.0",
            "--design", "non-inferiority",
        ],
    },
    {
        "name": "binary: dropout vs p2",
        "args": [
            "--type", "binary",
            "--row-param", "dropout", "--col-param", "p2",
            "--row-values", "0.10,0.15,0.20,0.25",
            "--col-values", "0.70,0.75,0.80,0.85",
            "--p1", "0.60",
        ],
    },
    {
        "name": "binary: power vs p1",
        "args": [
            "--type", "binary",
            "--row-param", "power", "--col-param", "p1",
            "--row-values", "0.80,0.85,0.90",
            "--col-values", "0.40,0.50,0.60",
            "--p2", "0.75",
        ],
    },
    {
        "name": "binary: alpha vs dropout (unequal allocation)",
        "args": [
            "--type", "binary",
            "--row-param", "alpha", "--col-param", "dropout",
            "--row-values", "0.01,0.025,0.05",
            "--col-values", "0.10,0.20,0.30",
            "--p1", "0.60", "--p2", "0.75",
            "--allocation", "2.0",
        ],
    },
]


def run_script(cmd, args):
    result = subprocess.run(cmd + args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def compare_tables(py_table, r_table):
    mismatches = []
    if len(py_table) != len(r_table):
        mismatches.append(f"row count: {len(py_table)} vs {len(r_table)}")
        return mismatches

    for i, (py_row, r_row) in enumerate(zip(py_table, r_table)):
        if len(py_row) != len(r_row):
            mismatches.append(f"row[{i}] col count: {len(py_row)} vs {len(r_row)}")
            continue
        for j, (pv, rv) in enumerate(zip(py_row, r_row)):
            if pv != rv:
                mismatches.append(f"table[{i}][{j}]: {pv} != {rv}")

    return mismatches


def main():
    parser = argparse.ArgumentParser(description="Parity tests for sensitivity table generators")
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

        mismatches = compare_tables(py_data["table"], r_data["table"])

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
