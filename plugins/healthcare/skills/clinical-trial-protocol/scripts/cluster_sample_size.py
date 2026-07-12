#!/usr/bin/env python3
"""
Cluster Randomized Trial Sample Size Calculator

Sample size calculations for cluster randomized clinical trials,
accounting for intra-cluster correlation (ICC) via the design effect.
Supports continuous and binary primary endpoints.
"""

import argparse
import json
import sys
import math
from typing import Dict, Any


def calculate_cluster_continuous(
    effect_size: float,
    std_dev: float,
    cluster_size: int,
    icc: float,
    alpha: float = 0.05,
    power: float = 0.80,
    allocation_ratio: float = 1.0,
    dropout_rate: float = 0.15,
    design: str = "superiority"
) -> Dict[str, Any]:
    """
    Calculate sample size for a cluster randomized trial with continuous endpoint.

    Uses two-sample t-test for individual-level N, then applies design effect.

    Args:
        effect_size: Expected mean difference between groups
        std_dev: Standard deviation (pooled or common)
        cluster_size: Number of subjects per cluster
        icc: Intra-cluster correlation coefficient
        alpha: Type I error rate (default 0.05 for two-sided test)
        power: Statistical power (1 - Type II error rate)
        allocation_ratio: Ratio of treatment to control (1.0 = equal allocation)
        dropout_rate: Expected dropout rate (0.15 = 15%)
        design: "superiority" or "non-inferiority"

    Returns:
        Dictionary with sample size results
    """
    try:
        from scipy import stats
    except ImportError:
        return {
            "error": "scipy not installed. Run: pip install scipy"
        }

    # Calculate effect size (Cohen's d)
    cohens_d = abs(effect_size) / std_dev

    # Determine sidedness
    if design == "superiority":
        alpha_adj = alpha / 2  # Two-sided test
        sidedness = "two-sided"
    else:  # non-inferiority
        alpha_adj = alpha  # One-sided test
        sidedness = "one-sided"

    # Z-scores for alpha and beta
    z_alpha = stats.norm.ppf(1 - alpha_adj)
    z_beta = stats.norm.ppf(power)

    # Individual-level sample size per arm
    if allocation_ratio == 1.0:
        n_per_arm = 2 * ((z_alpha + z_beta) ** 2) / (cohens_d ** 2)
    else:
        n_per_arm = ((1 + 1/allocation_ratio) ** 2) * ((z_alpha + z_beta) ** 2) / (cohens_d ** 2)

    n_per_arm = math.ceil(n_per_arm)

    if allocation_ratio == 1.0:
        n_control = n_per_arm
        n_treatment = n_per_arm
    else:
        n_treatment = n_per_arm
        n_control = math.ceil(n_per_arm / allocation_ratio)

    total_individual = n_treatment + n_control

    # Design effect
    deff = 1 + (cluster_size - 1) * icc

    # Cluster-adjusted sample sizes
    n_treatment_adj = math.ceil(n_treatment * deff)
    n_control_adj = math.ceil(n_control * deff)
    clusters_treatment = math.ceil(n_treatment_adj / cluster_size)
    clusters_control = math.ceil(n_control_adj / cluster_size)
    total_clusters = clusters_treatment + clusters_control
    total_subjects = total_clusters * cluster_size
    total_subjects_with_dropout = math.ceil(total_subjects / (1 - dropout_rate))

    # --- Sensitivity analysis: power at 90% ---
    z_beta_90 = stats.norm.ppf(0.90)
    if allocation_ratio == 1.0:
        n_per_arm_90 = 2 * ((z_alpha + z_beta_90) ** 2) / (cohens_d ** 2)
    else:
        n_per_arm_90 = ((1 + 1/allocation_ratio) ** 2) * ((z_alpha + z_beta_90) ** 2) / (cohens_d ** 2)
    n_per_arm_90 = math.ceil(n_per_arm_90)

    if allocation_ratio == 1.0:
        n_treatment_90 = n_per_arm_90
        n_control_90 = n_per_arm_90
    else:
        n_treatment_90 = n_per_arm_90
        n_control_90 = math.ceil(n_per_arm_90 / allocation_ratio)

    n_treatment_adj_90 = math.ceil(n_treatment_90 * deff)
    n_control_adj_90 = math.ceil(n_control_90 * deff)
    clusters_treatment_90 = math.ceil(n_treatment_adj_90 / cluster_size)
    clusters_control_90 = math.ceil(n_control_adj_90 / cluster_size)
    total_clusters_90 = clusters_treatment_90 + clusters_control_90
    total_subjects_90 = total_clusters_90 * cluster_size
    total_subjects_90_dropout = math.ceil(total_subjects_90 / (1 - dropout_rate))

    # --- Sensitivity analysis: ICC increased by 50% ---
    icc_high = icc * 1.5
    deff_high = 1 + (cluster_size - 1) * icc_high

    n_treatment_adj_icc = math.ceil(n_treatment * deff_high)
    n_control_adj_icc = math.ceil(n_control * deff_high)
    clusters_treatment_icc = math.ceil(n_treatment_adj_icc / cluster_size)
    clusters_control_icc = math.ceil(n_control_adj_icc / cluster_size)
    total_clusters_icc = clusters_treatment_icc + clusters_control_icc
    total_subjects_icc = total_clusters_icc * cluster_size
    total_subjects_icc_dropout = math.ceil(total_subjects_icc / (1 - dropout_rate))

    return {
        "endpoint_type": "continuous",
        "study_design": design,
        "statistical_test": f"Two-sample t-test ({sidedness})",
        "effect_size": effect_size,
        "standard_deviation": std_dev,
        "cohens_d": round(cohens_d, 3),
        "alpha": alpha,
        "power": power,
        "allocation_ratio": f"{allocation_ratio}:1" if allocation_ratio != 1.0 else "1:1",
        "dropout_rate": dropout_rate,
        "cluster_info": {
            "cluster_size": cluster_size,
            "icc": icc,
            "design_effect": round(deff, 4)
        },
        "sample_size": {
            "individual_level": {
                "treatment_arm": n_treatment,
                "control_arm": n_control,
                "total": total_individual
            },
            "cluster_adjusted": {
                "treatment_arm": n_treatment_adj,
                "control_arm": n_control_adj,
                "clusters_treatment": clusters_treatment,
                "clusters_control": clusters_control,
                "total_clusters": total_clusters,
                "total_subjects": total_subjects,
                "total_subjects_with_dropout": total_subjects_with_dropout
            }
        },
        "sensitivity_analysis": {
            "power_90_percent": {
                "total_clusters": total_clusters_90,
                "total_subjects": total_subjects_90,
                "total_subjects_with_dropout": total_subjects_90_dropout
            },
            "icc_increased_50_percent": {
                "icc_high": round(icc_high, 4),
                "design_effect_high": round(deff_high, 4),
                "total_clusters": total_clusters_icc,
                "total_subjects": total_subjects_icc,
                "total_subjects_with_dropout": total_subjects_icc_dropout
            }
        },
        "assumptions": [
            "Normally distributed continuous outcome",
            "Equal variances between groups",
            "Observations within clusters are correlated (ICC > 0)",
            "Observations between clusters are independent",
            f"Cluster size of {cluster_size} is approximately equal across clusters",
            f"ICC of {icc} is based on prior data or literature",
            f"Effect size of {effect_size} is clinically meaningful and realistic"
        ],
        "disclaimers": [
            "Sample size calculation is preliminary and based on assumptions",
            "Final sample size requires biostatistician review and validation",
            "FDA Pre-Submission meeting may require adjustments",
            "Consider pilot study to validate ICC and cluster size assumptions",
            "Variable cluster sizes may require additional adjustment"
        ]
    }


def calculate_cluster_binary(
    p1: float,
    p2: float,
    cluster_size: int,
    icc: float,
    alpha: float = 0.05,
    power: float = 0.80,
    allocation_ratio: float = 1.0,
    dropout_rate: float = 0.15,
    design: str = "superiority"
) -> Dict[str, Any]:
    """
    Calculate sample size for a cluster randomized trial with binary endpoint.

    Uses two-proportion z-test for individual-level N, then applies design effect.

    Args:
        p1: Expected proportion in control group
        p2: Expected proportion in treatment group
        cluster_size: Number of subjects per cluster
        icc: Intra-cluster correlation coefficient
        alpha: Type I error rate (default 0.05 for two-sided test)
        power: Statistical power (1 - Type II error rate)
        allocation_ratio: Ratio of treatment to control (1.0 = equal allocation)
        dropout_rate: Expected dropout rate (0.15 = 15%)
        design: "superiority" or "non-inferiority"

    Returns:
        Dictionary with sample size results
    """
    try:
        from scipy import stats
    except ImportError:
        return {
            "error": "scipy not installed. Run: pip install scipy"
        }

    # Validate proportions
    if not (0 < p1 < 1 and 0 < p2 < 1):
        return {"error": "Proportions must be between 0 and 1 (exclusive)"}

    # Determine sidedness
    if design == "superiority":
        alpha_adj = alpha / 2  # Two-sided test
        sidedness = "two-sided"
    else:  # non-inferiority
        alpha_adj = alpha  # One-sided test
        sidedness = "one-sided"

    # Calculate pooled proportion
    if allocation_ratio == 1.0:
        p_pooled = (p1 + p2) / 2
    else:
        p_pooled = (p1 + allocation_ratio * p2) / (1 + allocation_ratio)

    # Z-scores
    z_alpha = stats.norm.ppf(1 - alpha_adj)
    z_beta = stats.norm.ppf(power)

    # Effect size
    effect_size = abs(p2 - p1)

    # Individual-level sample size for two proportions
    if allocation_ratio == 1.0:
        numerator = (z_alpha * math.sqrt(2 * p_pooled * (1 - p_pooled)) +
                    z_beta * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    else:
        numerator = (z_alpha * math.sqrt(p_pooled * (1 - p_pooled) * (1 + 1/allocation_ratio)) +
                    z_beta * math.sqrt(p1 * (1 - p1) / allocation_ratio + p2 * (1 - p2))) ** 2

    n_treatment = math.ceil(numerator / (effect_size ** 2))

    if allocation_ratio == 1.0:
        n_control = n_treatment
    else:
        n_control = math.ceil(n_treatment / allocation_ratio)

    total_individual = n_treatment + n_control

    # Design effect
    deff = 1 + (cluster_size - 1) * icc

    # Cluster-adjusted sample sizes
    n_treatment_adj = math.ceil(n_treatment * deff)
    n_control_adj = math.ceil(n_control * deff)
    clusters_treatment = math.ceil(n_treatment_adj / cluster_size)
    clusters_control = math.ceil(n_control_adj / cluster_size)
    total_clusters = clusters_treatment + clusters_control
    total_subjects = total_clusters * cluster_size
    total_subjects_with_dropout = math.ceil(total_subjects / (1 - dropout_rate))

    # --- Sensitivity analysis: power at 90% ---
    z_beta_90 = stats.norm.ppf(0.90)
    if allocation_ratio == 1.0:
        numerator_90 = (z_alpha * math.sqrt(2 * p_pooled * (1 - p_pooled)) +
                       z_beta_90 * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    else:
        numerator_90 = (z_alpha * math.sqrt(p_pooled * (1 - p_pooled) * (1 + 1/allocation_ratio)) +
                       z_beta_90 * math.sqrt(p1 * (1 - p1) / allocation_ratio + p2 * (1 - p2))) ** 2

    n_treatment_90 = math.ceil(numerator_90 / (effect_size ** 2))
    if allocation_ratio == 1.0:
        n_control_90 = n_treatment_90
    else:
        n_control_90 = math.ceil(n_treatment_90 / allocation_ratio)

    n_treatment_adj_90 = math.ceil(n_treatment_90 * deff)
    n_control_adj_90 = math.ceil(n_control_90 * deff)
    clusters_treatment_90 = math.ceil(n_treatment_adj_90 / cluster_size)
    clusters_control_90 = math.ceil(n_control_adj_90 / cluster_size)
    total_clusters_90 = clusters_treatment_90 + clusters_control_90
    total_subjects_90 = total_clusters_90 * cluster_size
    total_subjects_90_dropout = math.ceil(total_subjects_90 / (1 - dropout_rate))

    # --- Sensitivity analysis: ICC increased by 50% ---
    icc_high = icc * 1.5
    deff_high = 1 + (cluster_size - 1) * icc_high

    n_treatment_adj_icc = math.ceil(n_treatment * deff_high)
    n_control_adj_icc = math.ceil(n_control * deff_high)
    clusters_treatment_icc = math.ceil(n_treatment_adj_icc / cluster_size)
    clusters_control_icc = math.ceil(n_control_adj_icc / cluster_size)
    total_clusters_icc = clusters_treatment_icc + clusters_control_icc
    total_subjects_icc = total_clusters_icc * cluster_size
    total_subjects_icc_dropout = math.ceil(total_subjects_icc / (1 - dropout_rate))

    return {
        "endpoint_type": "binary",
        "study_design": design,
        "statistical_test": f"Two-proportion z-test ({sidedness})",
        "control_proportion": p1,
        "treatment_proportion": p2,
        "effect_size": round(effect_size, 4),
        "alpha": alpha,
        "power": power,
        "allocation_ratio": f"{allocation_ratio}:1" if allocation_ratio != 1.0 else "1:1",
        "dropout_rate": dropout_rate,
        "cluster_info": {
            "cluster_size": cluster_size,
            "icc": icc,
            "design_effect": round(deff, 4)
        },
        "sample_size": {
            "individual_level": {
                "treatment_arm": n_treatment,
                "control_arm": n_control,
                "total": total_individual
            },
            "cluster_adjusted": {
                "treatment_arm": n_treatment_adj,
                "control_arm": n_control_adj,
                "clusters_treatment": clusters_treatment,
                "clusters_control": clusters_control,
                "total_clusters": total_clusters,
                "total_subjects": total_subjects,
                "total_subjects_with_dropout": total_subjects_with_dropout
            }
        },
        "sensitivity_analysis": {
            "power_90_percent": {
                "total_clusters": total_clusters_90,
                "total_subjects": total_subjects_90,
                "total_subjects_with_dropout": total_subjects_90_dropout
            },
            "icc_increased_50_percent": {
                "icc_high": round(icc_high, 4),
                "design_effect_high": round(deff_high, 4),
                "total_clusters": total_clusters_icc,
                "total_subjects": total_subjects_icc,
                "total_subjects_with_dropout": total_subjects_icc_dropout
            }
        },
        "assumptions": [
            "Binary outcome (success/failure, event/no event)",
            "Large enough sample for normal approximation",
            "Observations within clusters are correlated (ICC > 0)",
            "Observations between clusters are independent",
            f"Cluster size of {cluster_size} is approximately equal across clusters",
            f"ICC of {icc} is based on prior data or literature",
            f"Effect size of {round(effect_size * 100, 1)}% is clinically meaningful and realistic"
        ],
        "disclaimers": [
            "Sample size calculation is preliminary and based on assumptions",
            "Final sample size requires biostatistician review and validation",
            "FDA Pre-Submission meeting may require adjustments",
            "Consider pilot study to validate ICC and cluster size assumptions",
            "Variable cluster sizes may require additional adjustment"
        ]
    }


def main():
    parser = argparse.ArgumentParser(
        description="Cluster Randomized Trial Sample Size Calculator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Continuous endpoint (mean difference):
    python cluster_sample_size.py --type continuous --effect-size 5.0 --std-dev 15.0 \\
        --cluster-size 20 --icc 0.05

  Binary endpoint (proportions):
    python cluster_sample_size.py --type binary --p1 0.60 --p2 0.75 \\
        --cluster-size 20 --icc 0.05

  Custom parameters:
    python cluster_sample_size.py --type continuous --effect-size 5.0 --std-dev 15.0 \\
        --cluster-size 30 --icc 0.03 --alpha 0.05 --power 0.90 --dropout 0.20 \\
        --output results.json
        """
    )

    parser.add_argument(
        "--type",
        required=True,
        choices=["continuous", "binary"],
        help="Type of primary endpoint"
    )

    # Cluster parameters
    parser.add_argument(
        "--cluster-size",
        type=int,
        required=True,
        help="Number of subjects per cluster"
    )
    parser.add_argument(
        "--icc",
        type=float,
        required=True,
        help="Intra-cluster correlation coefficient"
    )

    # Continuous endpoint parameters
    parser.add_argument(
        "--effect-size",
        type=float,
        help="Expected mean difference (for continuous endpoints)"
    )
    parser.add_argument(
        "--std-dev",
        type=float,
        help="Standard deviation (for continuous endpoints)"
    )

    # Binary endpoint parameters
    parser.add_argument(
        "--p1",
        type=float,
        help="Expected proportion in control group (for binary endpoints)"
    )
    parser.add_argument(
        "--p2",
        type=float,
        help="Expected proportion in treatment group (for binary endpoints)"
    )

    # Common parameters
    parser.add_argument(
        "--alpha",
        type=float,
        default=0.05,
        help="Type I error rate (default: 0.05)"
    )
    parser.add_argument(
        "--power",
        type=float,
        default=0.80,
        help="Statistical power (default: 0.80)"
    )
    parser.add_argument(
        "--dropout",
        type=float,
        default=0.15,
        help="Expected dropout rate (default: 0.15)"
    )
    parser.add_argument(
        "--allocation",
        type=float,
        default=1.0,
        help="Allocation ratio treatment:control (default: 1.0 for equal allocation)"
    )
    parser.add_argument(
        "--design",
        choices=["superiority", "non-inferiority"],
        default="superiority",
        help="Study design type (default: superiority)"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output JSON file path (if not specified, prints to stdout)"
    )

    args = parser.parse_args()

    # Validate inputs based on endpoint type
    if args.type == "continuous":
        if args.effect_size is None or args.std_dev is None:
            parser.error("--effect-size and --std-dev required for continuous endpoints")

        result = calculate_cluster_continuous(
            effect_size=args.effect_size,
            std_dev=args.std_dev,
            cluster_size=args.cluster_size,
            icc=args.icc,
            alpha=args.alpha,
            power=args.power,
            allocation_ratio=args.allocation,
            dropout_rate=args.dropout,
            design=args.design
        )

    elif args.type == "binary":
        if args.p1 is None or args.p2 is None:
            parser.error("--p1 and --p2 required for binary endpoints")

        result = calculate_cluster_binary(
            p1=args.p1,
            p2=args.p2,
            cluster_size=args.cluster_size,
            icc=args.icc,
            alpha=args.alpha,
            power=args.power,
            allocation_ratio=args.allocation,
            dropout_rate=args.dropout,
            design=args.design
        )

    # Check for errors
    if "error" in result:
        print(f"ERROR: {result['error']}", file=sys.stderr)
        sys.exit(1)

    # Output results
    output_json = json.dumps(result, indent=2)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"Results written to {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    main()
