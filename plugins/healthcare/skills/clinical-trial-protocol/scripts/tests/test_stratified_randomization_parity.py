#!/usr/bin/env python3
"""
Parity tests for stratified_randomization.py and stratified_randomization.R.

Since Python and R use different RNGs, exact sequences will differ.
Tests verify structural properties: correct totals, valid balance,
matching block sizes, and correct allocation ratios.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "stratified_randomization.py")
R_SCRIPT = str(SCRIPT_DIR / "stratified_randomization.R")

TEST_CASES = [
    {
        "name": "2 strata equal n",
        "args": ["--strata", "Male,Female", "--n-per-stratum", "50"],
    },
    {
        "name": "2 strata different n",
        "args": ["--strata", "Male,Female", "--n-per-stratum", "30,40"],
    },
    {
        "name": "3 strata",
        "args": ["--strata", "Young,Middle,Old", "--n-per-stratum", "40"],
    },
    {
        "name": "single block size",
        "args": ["--strata", "A,B", "--n-per-stratum", "24", "--block-sizes", "4"],
    },
    {
        "name": "large block sizes",
        "args": ["--strata", "A,B", "--n-per-stratum", "100", "--block-sizes", "6,8,10"],
    },
    {
        "name": "unequal allocation 2:1",
        "args": ["--strata", "A,B", "--n-per-stratum", "60",
                 "--allocation", "2.0", "--block-sizes", "3,6,9"],
    },
    {
        "name": "small stratum",
        "args": ["--strata", "Only", "--n-per-stratum", "10"],
    },
    {
        "name": "different seed",
        "args": ["--strata", "A,B", "--n-per-stratum", "50", "--seed", "123"],
    },
]


def run_script(cmd, args):
    result = subprocess.run(cmd + args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def validate_result(data, label):
    """Validate structural properties of a single result."""
    issues = []

    # Check overall totals match sum of strata
    sum_t = sum(s["n_treatment"] for s in data["strata"])
    sum_c = sum(s["n_control"] for s in data["strata"])
    if data["overall"]["total_treatment"] != sum_t:
        issues.append(f"{label}: total_treatment {data['overall']['total_treatment']} != sum {sum_t}")
    if data["overall"]["total_control"] != sum_c:
        issues.append(f"{label}: total_control {data['overall']['total_control']} != sum {sum_c}")

    for s in data["strata"]:
        name = s["stratum"]
        # n_treatment + n_control = n_subjects
        if s["n_treatment"] + s["n_control"] != s["n_subjects"]:
            issues.append(f"{label} {name}: T+C={s['n_treatment']+s['n_control']} != n={s['n_subjects']}")
        # Imbalance is correct
        if s["final_imbalance"] != abs(s["n_treatment"] - s["n_control"]):
            issues.append(f"{label} {name}: final_imbalance mismatch")
        # Max running imbalance >= final imbalance
        if s["max_running_imbalance"] < s["final_imbalance"]:
            issues.append(f"{label} {name}: max_running < final imbalance")

    return issues


def compare_structure(py_data, r_data):
    """Compare structural properties between Python and R outputs."""
    mismatches = []

    # Same number of strata
    if py_data["n_strata"] != r_data["n_strata"]:
        mismatches.append(f"n_strata: {py_data['n_strata']} != {r_data['n_strata']}")

    # Same allocation ratio string
    if py_data["allocation_ratio"] != r_data["allocation_ratio"]:
        mismatches.append(f"allocation_ratio: {py_data['allocation_ratio']} != {r_data['allocation_ratio']}")

    # Same block sizes available (handle scalar from jsonlite auto_unbox)
    py_blocks = py_data["block_sizes_available"]
    r_blocks = r_data["block_sizes_available"]
    if not isinstance(py_blocks, list):
        py_blocks = [py_blocks]
    if not isinstance(r_blocks, list):
        r_blocks = [r_blocks]
    if sorted(py_blocks) != sorted(r_blocks):
        mismatches.append(f"block_sizes: {py_blocks} != {r_blocks}")

    # Same n_subjects per stratum
    for ps, rs in zip(py_data["strata"], r_data["strata"]):
        if ps["n_subjects"] != rs["n_subjects"]:
            mismatches.append(f"{ps['stratum']}: n_subjects {ps['n_subjects']} != {rs['n_subjects']}")

    # Both should have reasonable balance relative to allocation ratio
    # The treatment proportion should be within one block of the target ratio
    max_block = max(py_blocks)
    alloc_str = py_data["allocation_ratio"]
    ratio = float(alloc_str.split(":")[0])
    target_frac = ratio / (ratio + 1)  # expected treatment fraction

    for ps, rs in zip(py_data["strata"], r_data["strata"]):
        for label, s in [("Python", ps), ("R", rs)]:
            actual_frac = s["n_treatment"] / s["n_subjects"] if s["n_subjects"] > 0 else 0
            deviation = abs(actual_frac - target_frac) * s["n_subjects"]
            if deviation > max_block:
                mismatches.append(
                    f"{label} {s['stratum']}: allocation deviation {deviation:.0f} > max block {max_block}")

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
        mismatches.extend(validate_result(py_data, "Python"))
        mismatches.extend(validate_result(r_data, "R"))
        mismatches.extend(compare_structure(py_data, r_data))

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
