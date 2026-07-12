#!/usr/bin/env python3
"""
Bayesian Assurance (Expected Power) Calculator

Computes expected power by averaging statistical power over a prior distribution
on the treatment effect size. Uses Monte Carlo simulation with a normal prior.
Supports continuous and binary primary endpoints.
"""

import argparse
import json
import math
import sys
from typing import Dict, Any


def compute_power_continuous(
    effect_sizes,
    std_dev: float,
    n_total: int,
    alpha: float,
    allocation_ratio: float,
    design: str
):
    """
    Vectorized power computation for continuous endpoints.

    Args:
        effect_sizes: numpy array of effect size draws from the prior
        std_dev: Standard deviation (pooled or common)
        n_total: Total sample size
        alpha: Type I error rate
        allocation_ratio: Ratio of treatment to control
        design: "superiority" or "non-inferiority"

    Returns:
        numpy array of power values
    """
    try:
        from scipy import stats
    except ImportError:
        raise ImportError("scipy not installed. Run: pip install scipy numpy")

    import numpy as np

    cohens_d = np.abs(effect_sizes) / std_dev

    if design == "superiority":
        alpha_adj = alpha / 2
    else:
        alpha_adj = alpha

    z_alpha = stats.norm.ppf(1 - alpha_adj)

    if allocation_ratio == 1.0:
        n_per_arm = n_total / 2.0
        z_beta = np.sqrt(n_per_arm * cohens_d ** 2 / 2) - z_alpha
    else:
        r = allocation_ratio
        n_treatment = n_total * r / (1 + r)
        z_beta = np.sqrt(n_treatment * cohens_d ** 2 / ((1 + 1 / r) ** 2)) - z_alpha

    powers = stats.norm.cdf(z_beta)
    powers = np.clip(powers, 0, 1)
    return powers


def compute_power_binary(
    effect_sizes,
    p1: float,
    n_total: int,
    alpha: float,
    allocation_ratio: float,
    design: str
):
    """
    Vectorized power computation for binary endpoints.

    Args:
        effect_sizes: numpy array of effect size draws from the prior
        p1: Control group proportion
        n_total: Total sample size
        alpha: Type I error rate
        allocation_ratio: Ratio of treatment to control
        design: "superiority" or "non-inferiority"

    Returns:
        Tuple of (numpy array of power values, number of clamped draws)
    """
    try:
        from scipy import stats
    except ImportError:
        raise ImportError("scipy not installed. Run: pip install scipy numpy")

    import numpy as np

    p2 = p1 + effect_sizes

    # Identify invalid draws (p2 out of bounds)
    invalid = (p2 <= 0) | (p2 >= 1)
    clamped_count = int(np.sum(invalid))

    # Work with valid draws only
    p2_valid = np.clip(p2, 1e-10, 1 - 1e-10)
    effect = np.abs(p2_valid - p1)

    if design == "superiority":
        alpha_adj = alpha / 2
    else:
        alpha_adj = alpha

    z_alpha = stats.norm.ppf(1 - alpha_adj)

    if allocation_ratio == 1.0:
        p_pooled = (p1 + p2_valid) / 2
        n_treatment = n_total / 2.0
        z_beta = (np.sqrt(n_treatment) * effect -
                  z_alpha * np.sqrt(2 * p_pooled * (1 - p_pooled))) / \
                 np.sqrt(p1 * (1 - p1) + p2_valid * (1 - p2_valid))
    else:
        r = allocation_ratio
        p_pooled = (p1 + r * p2_valid) / (1 + r)
        n_treatment = n_total * r / (1 + r)
        z_beta = (np.sqrt(n_treatment) * effect -
                  z_alpha * np.sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / r))) / \
                 np.sqrt(p1 * (1 - p1) / r + p2_valid * (1 - p2_valid))

    powers = stats.norm.cdf(z_beta)
    powers = np.clip(powers, 0, 1)

    # Set power to 0 for invalid draws
    powers[invalid] = 0.0

    return powers, clamped_count


def calculate_bayesian_assurance(
    endpoint_type: str,
    prior_mean: float,
    prior_sd: float,
    n_total: int,
    alpha: float = 0.05,
    allocation_ratio: float = 1.0,
    design: str = "superiority",
    simulations: int = 100000,
    seed: int = 42,
    std_dev: float = None,
    p1: float = None
) -> Dict[str, Any]:
    """
    Calculate Bayesian assurance (expected power) via Monte Carlo simulation.

    Args:
        endpoint_type: "continuous" or "binary"
        prior_mean: Mean of the normal prior on treatment effect
        prior_sd: SD of the normal prior on treatment effect
        n_total: Total planned sample size
        alpha: Type I error rate
        allocation_ratio: Ratio of treatment to control
        design: "superiority" or "non-inferiority"
        simulations: Number of Monte Carlo draws
        seed: Random seed
        std_dev: Standard deviation (required for continuous)
        p1: Control proportion (required for binary)

    Returns:
        Dictionary with assurance results
    """
    try:
        from scipy import stats
    except ImportError:
        return {
            "error": "scipy not installed. Run: pip install scipy numpy"
        }

    import numpy as np

    # Draw effect sizes from the prior
    effect_draws = stats.norm.rvs(
        loc=prior_mean, scale=prior_sd, size=simulations, random_state=seed
    )

    # Compute power for each draw
    if endpoint_type == "continuous":
        powers = compute_power_continuous(
            effect_draws, std_dev, n_total, alpha, allocation_ratio, design
        )
        clamped_count = None
    else:
        powers, clamped_count = compute_power_binary(
            effect_draws, p1, n_total, alpha, allocation_ratio, design
        )

    # Assurance = mean power across prior draws
    assurance = float(np.mean(powers))
    power_sd = float(np.std(powers))
    monte_carlo_se = power_sd / math.sqrt(simulations)

    # Power at the prior mean (point estimate)
    if endpoint_type == "continuous":
        power_at_prior = compute_power_continuous(
            np.array([prior_mean]), std_dev, n_total, alpha, allocation_ratio, design
        )
    else:
        power_at_prior, _ = compute_power_binary(
            np.array([prior_mean]), p1, n_total, alpha, allocation_ratio, design
        )
    power_at_prior_mean = float(power_at_prior[0])

    # Format allocation ratio string
    if allocation_ratio != 1.0:
        alloc_str = f"{allocation_ratio}:1"
    else:
        alloc_str = "1:1"

    # Build result
    result = {
        "analysis": "bayesian_assurance",
        "endpoint_type": endpoint_type,
        "study_design": design,
        "prior": {
            "distribution": "normal",
            "mean": prior_mean,
            "sd": prior_sd
        },
        "planned_sample_size": n_total,
        "alpha": alpha,
        "allocation_ratio": alloc_str
    }

    if endpoint_type == "continuous":
        result["standard_deviation"] = std_dev
    else:
        result["control_proportion"] = p1

    result["power_at_prior_mean"] = round(power_at_prior_mean, 6)
    result["assurance"] = round(assurance, 6)

    simulation_block = {
        "n_simulations": simulations,
        "seed": seed,
        "power_sd": round(power_sd, 6),
        "monte_carlo_se": round(monte_carlo_se, 6)
    }

    if endpoint_type == "binary":
        simulation_block["clamped_draws"] = clamped_count
        simulation_block["clamped_fraction"] = round(clamped_count / simulations, 6)

    result["simulation"] = simulation_block

    # Assumptions
    assumptions = [
        "Normal prior on treatment effect size",
        f"Prior mean of {prior_mean} with SD of {prior_sd}"
    ]
    if endpoint_type == "continuous":
        assumptions.append(f"Common standard deviation of {std_dev}")
        assumptions.append("Normally distributed continuous outcome")
        assumptions.append("Equal variances between groups")
    else:
        assumptions.append(f"Control group proportion of {p1}")
        assumptions.append("Binary outcome (success/failure)")
        assumptions.append("Large enough sample for normal approximation")
    assumptions.append("Independent observations")

    result["assumptions"] = assumptions

    result["disclaimers"] = [
        "Assurance calculation is preliminary and based on assumed prior",
        "Prior distribution should be informed by available evidence",
        "Final analysis requires biostatistician review"
    ]

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Bayesian Assurance (Expected Power) Calculator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Continuous endpoint:
    python bayesian_assurance.py --type continuous --prior-mean 5.0 --prior-sd 2.0 \\
        --n-total 284 --std-dev 15.0

  Binary endpoint:
    python bayesian_assurance.py --type binary --prior-mean 0.15 --prior-sd 0.05 \\
        --n-total 200 --p1 0.60

  Custom parameters:
    python bayesian_assurance.py --type continuous --prior-mean 5.0 --prior-sd 2.0 \\
        --n-total 284 --std-dev 15.0 --alpha 0.05 --design non-inferiority \\
        --simulations 200000 --seed 123 --output results.json
        """
    )

    parser.add_argument(
        "--type",
        required=True,
        choices=["continuous", "binary"],
        help="Type of primary endpoint"
    )

    # Prior parameters
    parser.add_argument(
        "--prior-mean",
        type=float,
        required=True,
        help="Mean of the normal prior on treatment effect"
    )
    parser.add_argument(
        "--prior-sd",
        type=float,
        required=True,
        help="Standard deviation of the normal prior on treatment effect"
    )

    # Sample size
    parser.add_argument(
        "--n-total",
        type=int,
        required=True,
        help="Total planned sample size"
    )

    # Continuous endpoint parameters
    parser.add_argument(
        "--std-dev",
        type=float,
        help="Standard deviation (required for continuous endpoints)"
    )

    # Binary endpoint parameters
    parser.add_argument(
        "--p1",
        type=float,
        help="Control group proportion (required for binary endpoints)"
    )

    # Common parameters
    parser.add_argument(
        "--alpha",
        type=float,
        default=0.05,
        help="Type I error rate (default: 0.05)"
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
        "--simulations",
        type=int,
        default=100000,
        help="Number of Monte Carlo simulations (default: 100000)"
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed (default: 42)"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output JSON file path (if not specified, prints to stdout)"
    )

    args = parser.parse_args()

    # Validate inputs based on endpoint type
    if args.type == "continuous":
        if args.std_dev is None:
            parser.error("--std-dev required for continuous endpoints")

    elif args.type == "binary":
        if args.p1 is None:
            parser.error("--p1 required for binary endpoints")

    result = calculate_bayesian_assurance(
        endpoint_type=args.type,
        prior_mean=args.prior_mean,
        prior_sd=args.prior_sd,
        n_total=args.n_total,
        alpha=args.alpha,
        allocation_ratio=args.allocation,
        design=args.design,
        simulations=args.simulations,
        seed=args.seed,
        std_dev=args.std_dev,
        p1=args.p1
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
