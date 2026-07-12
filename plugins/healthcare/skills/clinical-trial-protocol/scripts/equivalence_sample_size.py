#!/usr/bin/env python3
"""
TOST Equivalence Sample Size Calculator for Clinical Trial Design

Calculates sample size for equivalence trials using the Two One-Sided Tests
(TOST) procedure. Supports continuous and binary endpoints.
"""

import argparse
import json
import math
import sys
from typing import Any, Dict


def calculate_continuous_equivalence(
    margin: float,
    std_dev: float,
    expected_diff: float = 0.0,
    alpha: float = 0.05,
    power: float = 0.80,
    allocation_ratio: float = 1.0,
    dropout_rate: float = 0.15,
) -> Dict[str, Any]:
    try:
        from scipy import stats
    except ImportError:
        return {"error": "scipy not installed. Run: pip install scipy"}

    if margin <= abs(expected_diff):
        return {"error": "Equivalence margin must be strictly greater than the absolute expected difference"}
    if margin <= 0:
        return {"error": "Equivalence margin must be positive"}

    z_alpha = stats.norm.ppf(1 - alpha)
    z_beta = stats.norm.ppf(power)

    denom = (margin - abs(expected_diff)) ** 2

    if allocation_ratio == 1.0:
        n_per_arm = (z_alpha + z_beta) ** 2 * 2 * std_dev ** 2 / denom
        n_per_arm = math.ceil(n_per_arm)
        n_treatment = n_per_arm
        n_control = n_per_arm
    else:
        r = allocation_ratio
        n_treatment = math.ceil((z_alpha + z_beta) ** 2 * std_dev ** 2 * (1 + 1 / r) / denom)
        n_control = math.ceil(n_treatment / r)

    total = n_treatment + n_control
    total_dropout = math.ceil(total / (1 - dropout_rate))
    n_treatment_dropout = math.ceil(n_treatment / (1 - dropout_rate))
    n_control_dropout = math.ceil(n_control / (1 - dropout_rate))

    # Sensitivity: 90% power
    z_beta_90 = stats.norm.ppf(0.90)
    if allocation_ratio == 1.0:
        n_90 = math.ceil((z_alpha + z_beta_90) ** 2 * 2 * std_dev ** 2 / denom)
        total_90 = n_90 * 2
    else:
        n_90 = math.ceil((z_alpha + z_beta_90) ** 2 * std_dev ** 2 * (1 + 1 / r) / denom)
        total_90 = n_90 + math.ceil(n_90 / r)
    total_90_dropout = math.ceil(total_90 / (1 - dropout_rate))

    # Sensitivity: margin tightened by 10%
    margin_tight = margin * 0.9
    sens_tight = None
    if margin_tight > abs(expected_diff):
        denom_tight = (margin_tight - abs(expected_diff)) ** 2
        if allocation_ratio == 1.0:
            n_tight = math.ceil((z_alpha + z_beta) ** 2 * 2 * std_dev ** 2 / denom_tight)
            total_tight = n_tight * 2
        else:
            n_tight = math.ceil((z_alpha + z_beta) ** 2 * std_dev ** 2 * (1 + 1 / r) / denom_tight)
            total_tight = n_tight + math.ceil(n_tight / r)
        sens_tight = {
            "total": total_tight,
            "total_with_dropout": math.ceil(total_tight / (1 - dropout_rate)),
        }

    alloc_str = f"{allocation_ratio}:1" if allocation_ratio != 1.0 else "1:1"

    return {
        "endpoint_type": "continuous",
        "study_design": "equivalence",
        "statistical_test": "TOST (Two One-Sided Tests)",
        "equivalence_margin": margin,
        "expected_difference": expected_diff,
        "standard_deviation": std_dev,
        "alpha": alpha,
        "power": power,
        "allocation_ratio": alloc_str,
        "dropout_rate": dropout_rate,
        "sample_size": {
            "treatment_arm": n_treatment,
            "control_arm": n_control,
            "total": total,
            "total_with_dropout": total_dropout,
            "treatment_with_dropout": n_treatment_dropout,
            "control_with_dropout": n_control_dropout,
        },
        "sensitivity_analysis": {
            "power_90_percent": {
                "total": total_90,
                "total_with_dropout": total_90_dropout,
            },
            "margin_tightened_10_percent": sens_tight,
        },
        "assumptions": [
            "Normally distributed continuous outcome",
            "Equal variances between groups",
            "Independent observations",
            f"True difference of {expected_diff} falls within equivalence margin of [-{margin}, {margin}]",
            f"TOST procedure with one-sided alpha = {alpha} (equivalent to {round((1 - 2 * alpha) * 100)}% CI)",
        ],
        "disclaimers": [
            "Sample size calculation is preliminary and based on assumptions",
            "Final sample size requires biostatistician review and validation",
            "FDA Pre-Submission meeting may require adjustments",
            "Consider pilot study to validate assumptions",
            "For bioequivalence studies, ensure margins meet regulatory requirements (e.g., 80-125% for pharmacokinetic endpoints)",
        ],
    }


def calculate_binary_equivalence(
    margin: float,
    p1: float,
    p2: float,
    alpha: float = 0.05,
    power: float = 0.80,
    allocation_ratio: float = 1.0,
    dropout_rate: float = 0.15,
) -> Dict[str, Any]:
    try:
        from scipy import stats
    except ImportError:
        return {"error": "scipy not installed. Run: pip install scipy"}

    if not (0 < p1 < 1 and 0 < p2 < 1):
        return {"error": "Proportions must be between 0 and 1 (exclusive)"}
    if margin <= 0:
        return {"error": "Equivalence margin must be positive"}

    expected_diff = abs(p1 - p2)
    if margin <= expected_diff:
        return {"error": "Equivalence margin must be strictly greater than the absolute expected difference"}

    z_alpha = stats.norm.ppf(1 - alpha)
    z_beta = stats.norm.ppf(power)

    denom = (margin - expected_diff) ** 2
    sigma_sq = p1 * (1 - p1) + p2 * (1 - p2)

    if allocation_ratio == 1.0:
        n_per_arm = math.ceil((z_alpha + z_beta) ** 2 * sigma_sq / denom)
        n_treatment = n_per_arm
        n_control = n_per_arm
    else:
        r = allocation_ratio
        sigma_sq_unequal = p1 * (1 - p1) / r + p2 * (1 - p2)
        n_treatment = math.ceil((z_alpha + z_beta) ** 2 * sigma_sq_unequal / denom)
        n_control = math.ceil(n_treatment / r)

    total = n_treatment + n_control
    total_dropout = math.ceil(total / (1 - dropout_rate))
    n_treatment_dropout = math.ceil(n_treatment / (1 - dropout_rate))
    n_control_dropout = math.ceil(n_control / (1 - dropout_rate))

    # Sensitivity: 90% power
    z_beta_90 = stats.norm.ppf(0.90)
    if allocation_ratio == 1.0:
        n_90 = math.ceil((z_alpha + z_beta_90) ** 2 * sigma_sq / denom)
        total_90 = n_90 * 2
    else:
        n_90 = math.ceil((z_alpha + z_beta_90) ** 2 * sigma_sq_unequal / denom)
        total_90 = n_90 + math.ceil(n_90 / r)
    total_90_dropout = math.ceil(total_90 / (1 - dropout_rate))

    # Sensitivity: margin tightened by 10%
    margin_tight = margin * 0.9
    sens_tight = None
    if margin_tight > expected_diff:
        denom_tight = (margin_tight - expected_diff) ** 2
        if allocation_ratio == 1.0:
            n_tight = math.ceil((z_alpha + z_beta) ** 2 * sigma_sq / denom_tight)
            total_tight = n_tight * 2
        else:
            n_tight = math.ceil((z_alpha + z_beta) ** 2 * sigma_sq_unequal / denom_tight)
            total_tight = n_tight + math.ceil(n_tight / r)
        sens_tight = {
            "total": total_tight,
            "total_with_dropout": math.ceil(total_tight / (1 - dropout_rate)),
        }

    alloc_str = f"{allocation_ratio}:1" if allocation_ratio != 1.0 else "1:1"

    return {
        "endpoint_type": "binary",
        "study_design": "equivalence",
        "statistical_test": "TOST (Two One-Sided Tests)",
        "equivalence_margin": margin,
        "proportion_1": p1,
        "proportion_2": p2,
        "expected_difference": round(expected_diff, 4),
        "alpha": alpha,
        "power": power,
        "allocation_ratio": alloc_str,
        "dropout_rate": dropout_rate,
        "sample_size": {
            "treatment_arm": n_treatment,
            "control_arm": n_control,
            "total": total,
            "total_with_dropout": total_dropout,
            "treatment_with_dropout": n_treatment_dropout,
            "control_with_dropout": n_control_dropout,
        },
        "sensitivity_analysis": {
            "power_90_percent": {
                "total": total_90,
                "total_with_dropout": total_90_dropout,
            },
            "margin_tightened_10_percent": sens_tight,
        },
        "assumptions": [
            "Binary outcome (success/failure, event/no event)",
            "Independent observations",
            "Large enough sample for normal approximation",
            f"True difference of {round(expected_diff * 100, 1)}% falls within equivalence margin of [-{round(margin * 100, 1)}%, {round(margin * 100, 1)}%]",
            f"TOST procedure with one-sided alpha = {alpha} (equivalent to {round((1 - 2 * alpha) * 100)}% CI)",
        ],
        "disclaimers": [
            "Sample size calculation is preliminary and based on assumptions",
            "Final sample size requires biostatistician review and validation",
            "FDA Pre-Submission meeting may require adjustments",
            "Consider pilot study to validate assumptions",
            "For bioequivalence studies, ensure margins meet regulatory requirements (e.g., 80-125% for pharmacokinetic endpoints)",
        ],
    }


def main():
    parser = argparse.ArgumentParser(
        description="TOST Equivalence Sample Size Calculator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Continuous equivalence:
    python equivalence_sample_size.py --type continuous --margin 5.0 --std-dev 15.0

  Binary equivalence:
    python equivalence_sample_size.py --type binary --margin 0.15 --p1 0.60 --p2 0.60
        """,
    )

    parser.add_argument("--type", required=True, choices=["continuous", "binary"])
    parser.add_argument("--margin", required=True, type=float, help="Equivalence margin (delta)")
    parser.add_argument("--expected-diff", type=float, default=0.0, help="Expected true difference (default: 0)")
    parser.add_argument("--std-dev", type=float)
    parser.add_argument("--p1", type=float)
    parser.add_argument("--p2", type=float)
    parser.add_argument("--alpha", type=float, default=0.05, help="One-sided significance level (default: 0.05)")
    parser.add_argument("--power", type=float, default=0.80)
    parser.add_argument("--dropout", type=float, default=0.15)
    parser.add_argument("--allocation", type=float, default=1.0)
    parser.add_argument("--output", type=str)
    args = parser.parse_args()

    if args.type == "continuous":
        if args.std_dev is None:
            parser.error("--std-dev required for continuous endpoints")
        result = calculate_continuous_equivalence(
            margin=args.margin,
            std_dev=args.std_dev,
            expected_diff=args.expected_diff,
            alpha=args.alpha,
            power=args.power,
            allocation_ratio=args.allocation,
            dropout_rate=args.dropout,
        )
    else:
        if args.p1 is None or args.p2 is None:
            parser.error("--p1 and --p2 required for binary endpoints")
        result = calculate_binary_equivalence(
            margin=args.margin,
            p1=args.p1,
            p2=args.p2,
            alpha=args.alpha,
            power=args.power,
            allocation_ratio=args.allocation,
            dropout_rate=args.dropout,
        )

    if "error" in result:
        print(f"ERROR: {result['error']}", file=sys.stderr)
        sys.exit(1)

    output_json = json.dumps(result, indent=2)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"Results written to {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    main()
