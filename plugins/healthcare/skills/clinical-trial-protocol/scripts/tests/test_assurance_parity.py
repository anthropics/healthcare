#!/usr/bin/env python3
"""
Parity tests for bayesian_assurance.py and bayesian_assurance.R.

Uses wider tolerance (0.01) because Python and R have different RNGs,
so Monte Carlo estimates will differ slightly even with the same seed.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "bayesian_assurance.py")
R_SCRIPT = str(SCRIPT_DIR / "bayesian_assurance.R")

TEST_CASES = [
    {
        "name": "continuous defaults",
        "args": ["--type", "continuous", "--prior-mean", "5.0", "--prior-sd", "2.0",
                 "--n-total", "284", "--std-dev", "15.0"],
    },
    {
        "name": "continuous high uncertainty",
        "args": ["--type", "continuous", "--prior-mean", "5.0", "--prior-sd", "5.0",
                 "--n-total", "284", "--std-dev", "15.0"],
    },
    {
        "name": "continuous tight prior",
        "args": ["--type", "continuous", "--prior-mean", "5.0", "--prior-sd", "0.1",
                 "--n-total", "284", "--std-dev", "15.0"],
    },
    {
        "name": "continuous non-inferiority",
        "args": ["--type", "continuous", "--prior-mean", "5.0", "--prior-sd", "2.0",
                 "--n-total", "284", "--std-dev", "15.0", "--design", "non-inferiority"],
    },
    {
        "name": "continuous unequal allocation",
        "args": ["--type", "continuous", "--prior-mean", "5.0", "--prior-sd", "2.0",
                 "--n-total", "284", "--std-dev", "15.0", "--allocation", "2.0"],
    },
    {
        "name": "binary defaults",
        "args": ["--type", "binary", "--prior-mean", "0.15", "--prior-sd", "0.05",
                 "--n-total", "300", "--p1", "0.60"],
    },
    {
        "name": "binary high uncertainty",
        "args": ["--type", "binary", "--prior-mean", "0.15", "--prior-sd", "0.20",
                 "--n-total", "300", "--p1", "0.60"],
    },
    {
        "name": "binary non-inferiority",
        "args": ["--type", "binary", "--prior-mean", "0.15", "--prior-sd", "0.05",
                 "--n-total", "300", "--p1", "0.60", "--design", "non-inferiority"],
    },
]

TOLERANCE = 0.01  # wider tolerance for Monte Carlo variance


def run_script(cmd, args):
    result = subprocess.run(cmd + args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def compare_with_tolerance(py_data, r_data, tolerance):
    mismatches = []

    # Exact match fields
    for key in ["endpoint_type", "study_design", "planned_sample_size"]:
        if py_data.get(key) != r_data.get(key):
            mismatches.append(f"{key}: {py_data.get(key)} != {r_data.get(key)}")

    # Tolerance match fields
    for key in ["assurance", "power_at_prior_mean"]:
        py_val = py_data.get(key)
        r_val = r_data.get(key)
        if py_val is not None and r_val is not None:
            if abs(py_val - r_val) > tolerance:
                mismatches.append(f"{key}: {py_val} vs {r_val} (diff={abs(py_val - r_val):.4f})")

    # Simulation sub-fields with tolerance
    py_sim = py_data.get("simulation", {})
    r_sim = r_data.get("simulation", {})
    for key in ["power_sd", "monte_carlo_se"]:
        py_val = py_sim.get(key)
        r_val = r_sim.get(key)
        if py_val is not None and r_val is not None:
            if abs(py_val - r_val) > tolerance:
                mismatches.append(f"simulation.{key}: {py_val} vs {r_val} (diff={abs(py_val - r_val):.4f})")

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

        mismatches = compare_with_tolerance(py_data, r_data, TOLERANCE)

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
