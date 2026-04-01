#!/usr/bin/env python3
"""
Parity tests for multiplicity_adjustment.py and multiplicity_adjustment.R.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
PY_SCRIPT = str(SCRIPT_DIR / "multiplicity_adjustment.py")
R_SCRIPT = str(SCRIPT_DIR / "multiplicity_adjustment.R")

TEST_CASES = [
    {
        "name": "bonferroni 3 p-values",
        "args": ["--p-values", "0.01,0.04,0.03", "--method", "bonferroni"],
    },
    {
        "name": "holm 3 p-values",
        "args": ["--p-values", "0.01,0.04,0.03", "--method", "holm"],
    },
    {
        "name": "hochberg 3 p-values",
        "args": ["--p-values", "0.01,0.04,0.03", "--method", "hochberg"],
    },
    {
        "name": "all methods",
        "args": ["--p-values", "0.01,0.04,0.03", "--method", "all"],
    },
    {
        "name": "5 p-values holm",
        "args": ["--p-values", "0.001,0.01,0.03,0.04,0.50", "--method", "holm"],
    },
    {
        "name": "all significant bonferroni",
        "args": ["--p-values", "0.001,0.005,0.01", "--method", "bonferroni"],
    },
    {
        "name": "none significant bonferroni",
        "args": ["--p-values", "0.10,0.20,0.50", "--method", "bonferroni"],
    },
    {
        "name": "custom alpha",
        "args": ["--p-values", "0.005,0.02,0.04", "--method", "holm", "--alpha", "0.01"],
    },
    {
        "name": "single p-value",
        "args": ["--p-values", "0.03", "--method", "all"],
    },
    {
        "name": "tied p-values",
        "args": ["--p-values", "0.03,0.03,0.03", "--method", "holm"],
    },
    {
        "name": "with labels",
        "args": ["--p-values", "0.01,0.04,0.03", "--method", "hochberg",
                 "--labels", "Primary,Secondary,Exploratory"],
    },
]

TOLERANCE = 1e-9


def run_script(cmd, args):
    result = subprocess.run(cmd + args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def compare_adjustments(py_adj, r_adj):
    mismatches = []
    py_methods = set(py_adj.keys())
    r_methods = set(r_adj.keys())
    if py_methods != r_methods:
        mismatches.append(f"methods differ: {py_methods} vs {r_methods}")
        return mismatches

    for method in py_methods:
        py_m = py_adj[method]
        r_m = r_adj[method]

        # Compare adjusted p-values (handle scalar from jsonlite auto_unbox)
        py_p = py_m["adjusted_p_values"]
        r_p = r_m["adjusted_p_values"]
        if not isinstance(py_p, list):
            py_p = [py_p]
        if not isinstance(r_p, list):
            r_p = [r_p]
        if len(py_p) != len(r_p):
            mismatches.append(f"{method}: length {len(py_p)} vs {len(r_p)}")
            continue
        for i, (pv, rv) in enumerate(zip(py_p, r_p)):
            if abs(pv - rv) > TOLERANCE:
                mismatches.append(f"{method}.adjusted_p_values[{i}]: {pv} != {rv}")

        # Compare rejections (handle scalar)
        py_rej = py_m["rejected"]
        r_rej = r_m["rejected"]
        if not isinstance(py_rej, list):
            py_rej = [py_rej]
        if not isinstance(r_rej, list):
            r_rej = [r_rej]
        if py_rej != r_rej:
            mismatches.append(f"{method}.rejected: {py_rej} != {r_rej}")

        if py_m["n_rejected"] != r_m["n_rejected"]:
            mismatches.append(f"{method}.n_rejected: {py_m['n_rejected']} != {r_m['n_rejected']}")

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

        mismatches = compare_adjustments(
            py_data["adjustments"], r_data["adjustments"])

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
