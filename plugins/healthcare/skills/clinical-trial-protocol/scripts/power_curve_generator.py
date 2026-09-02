#!/usr/bin/env python3
"""
Power Curve Generator for Clinical Trial Design

Generates power curves by sweeping one parameter (effect size or sample size)
across a range while holding others fixed. Outputs JSON with an array of
data points for plotting.
"""

import argparse
import json
import math
import sys


def _z(p):
    """Inverse standard normal CDF (requires scipy)."""
    from scipy import stats
    return stats.norm.ppf(p)


def _phi(z):
    """Standard normal CDF (requires scipy)."""
    from scipy import stats
    return stats.norm.cdf(z)


def _alpha_adj(alpha, design):
    if design == "superiority":
        return alpha / 2
    return alpha


def compute_sample_size_continuous(effect_size, std_dev, alpha, power,
                                   allocation_ratio, dropout_rate, design):
    cohens_d = abs(effect_size) / std_dev
    z_alpha = _z(1 - _alpha_adj(alpha, design))
    z_beta = _z(power)

    if allocation_ratio == 1.0:
        n_per_arm = 2 * ((z_alpha + z_beta) ** 2) / (cohens_d ** 2)
    else:
        n_per_arm = ((1 + 1 / allocation_ratio) ** 2) * ((z_alpha + z_beta) ** 2) / (cohens_d ** 2)

    n_per_arm = math.ceil(n_per_arm)

    if allocation_ratio == 1.0:
        n_treatment = n_per_arm
        n_control = n_per_arm
    else:
        n_treatment = n_per_arm
        n_control = math.ceil(n_per_arm / allocation_ratio)

    total = n_treatment + n_control
    total_dropout = math.ceil(total / (1 - dropout_rate))
    return total, total_dropout


def compute_power_continuous(n_total, effect_size, std_dev, alpha,
                             allocation_ratio, design):
    cohens_d = abs(effect_size) / std_dev
    z_alpha = _z(1 - _alpha_adj(alpha, design))

    if allocation_ratio == 1.0:
        n_per_arm = n_total / 2.0
        z_beta = math.sqrt(n_per_arm * cohens_d ** 2 / 2) - z_alpha
    else:
        r = allocation_ratio
        n_treatment = n_total * r / (1 + r)
        z_beta = math.sqrt(n_treatment * cohens_d ** 2 / ((1 + 1 / r) ** 2)) - z_alpha

    return max(0.0, min(1.0, _phi(z_beta)))


def compute_sample_size_binary(p1, p2, alpha, power,
                                allocation_ratio, dropout_rate, design):
    z_alpha = _z(1 - _alpha_adj(alpha, design))
    z_beta = _z(power)
    effect_size = abs(p2 - p1)

    if allocation_ratio == 1.0:
        p_pooled = (p1 + p2) / 2
        numerator = (z_alpha * math.sqrt(2 * p_pooled * (1 - p_pooled)) +
                     z_beta * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    else:
        r = allocation_ratio
        p_pooled = (p1 + r * p2) / (1 + r)
        numerator = (z_alpha * math.sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / r)) +
                     z_beta * math.sqrt(p1 * (1 - p1) / r + p2 * (1 - p2))) ** 2

    n_treatment = math.ceil(numerator / (effect_size ** 2))

    if allocation_ratio == 1.0:
        n_control = n_treatment
    else:
        n_control = math.ceil(n_treatment / allocation_ratio)

    total = n_treatment + n_control
    total_dropout = math.ceil(total / (1 - dropout_rate))
    return total, total_dropout


def compute_power_binary(n_total, p1, p2, alpha, allocation_ratio, design):
    z_alpha = _z(1 - _alpha_adj(alpha, design))
    effect_size = abs(p2 - p1)

    if allocation_ratio == 1.0:
        p_pooled = (p1 + p2) / 2
        n_treatment = n_total / 2.0
        z_beta = (math.sqrt(n_treatment) * effect_size -
                  z_alpha * math.sqrt(2 * p_pooled * (1 - p_pooled))) / \
                 math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))
    else:
        r = allocation_ratio
        p_pooled = (p1 + r * p2) / (1 + r)
        n_treatment = n_total * r / (1 + r)
        z_beta = (math.sqrt(n_treatment) * effect_size -
                  z_alpha * math.sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / r))) / \
                 math.sqrt(p1 * (1 - p1) / r + p2 * (1 - p2))

    return max(0.0, min(1.0, _phi(z_beta)))


def generate_sweep(min_val, max_val, steps):
    if steps == 1:
        return [min_val]
    step_size = (max_val - min_val) / (steps - 1)
    return [round(min_val + i * step_size, 10) for i in range(steps)]


def main():
    try:
        from scipy import stats  # noqa: F401
    except ImportError:
        print("ERROR: scipy not installed. Run: pip install scipy", file=sys.stderr)
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Power Curve Generator")
    parser.add_argument("--type", required=True, choices=["continuous", "binary"])
    parser.add_argument("--vary", required=True, choices=["effect-size", "sample-size"])
    parser.add_argument("--min", required=True, type=float)
    parser.add_argument("--max", required=True, type=float)
    parser.add_argument("--steps", type=int, default=20)
    parser.add_argument("--effect-size", type=float)
    parser.add_argument("--std-dev", type=float)
    parser.add_argument("--p1", type=float)
    parser.add_argument("--p2", type=float)
    parser.add_argument("--alpha", type=float, default=0.05)
    parser.add_argument("--power", type=float, default=0.80)
    parser.add_argument("--dropout", type=float, default=0.15)
    parser.add_argument("--allocation", type=float, default=1.0)
    parser.add_argument("--design", choices=["superiority", "non-inferiority"], default="superiority")
    parser.add_argument("--output", type=str)
    args = parser.parse_args()

    # Validation
    if args.type == "continuous":
        if args.std_dev is None:
            parser.error("--std-dev required for continuous endpoints")
        if args.vary == "sample-size" and args.effect_size is None:
            parser.error("--effect-size required when varying sample-size for continuous endpoints")
    else:
        if args.vary == "effect-size" and args.p1 is None:
            parser.error("--p1 required when varying effect-size for binary endpoints")
        if args.vary == "sample-size" and (args.p1 is None or args.p2 is None):
            parser.error("--p1 and --p2 required when varying sample-size for binary endpoints")

    sweep = generate_sweep(args.min, args.max, args.steps)
    curve = []

    for val in sweep:
        if args.vary == "effect-size":
            if args.type == "continuous":
                total, total_do = compute_sample_size_continuous(
                    val, args.std_dev, args.alpha, args.power,
                    args.allocation, args.dropout, args.design)
                curve.append({
                    "param_value": val,
                    "sample_size": total,
                    "sample_size_with_dropout": total_do,
                    "power": args.power,
                })
            else:
                p2 = args.p1 + val
                if p2 >= 1.0 or p2 <= 0.0:
                    continue
                total, total_do = compute_sample_size_binary(
                    args.p1, p2, args.alpha, args.power,
                    args.allocation, args.dropout, args.design)
                curve.append({
                    "param_value": val,
                    "sample_size": total,
                    "sample_size_with_dropout": total_do,
                    "power": args.power,
                })
        else:  # vary sample-size
            n = int(round(val))
            if n < 2:
                continue
            if args.type == "continuous":
                pwr = compute_power_continuous(
                    n, args.effect_size, args.std_dev, args.alpha,
                    args.allocation, args.design)
            else:
                pwr = compute_power_binary(
                    n, args.p1, args.p2, args.alpha,
                    args.allocation, args.design)
            total_do = math.ceil(n / (1 - args.dropout))
            curve.append({
                "param_value": n,
                "sample_size": n,
                "sample_size_with_dropout": total_do,
                "power": round(pwr, 6),
            })

    # Build fixed_parameters
    fixed = {
        "alpha": args.alpha,
        "allocation_ratio": args.allocation,
        "dropout_rate": args.dropout,
        "design": args.design,
    }
    if args.type == "continuous":
        fixed["std_dev"] = args.std_dev
        if args.vary == "sample-size":
            fixed["effect_size"] = args.effect_size
        if args.power is not None:
            fixed["power"] = args.power
    else:
        fixed["p1"] = args.p1
        if args.vary == "sample-size":
            fixed["p2"] = args.p2
        if args.power is not None:
            fixed["power"] = args.power

    result = {
        "endpoint_type": args.type,
        "study_design": args.design,
        "varied_parameter": args.vary,
        "fixed_parameters": fixed,
        "curve": curve,
    }

    output_json = json.dumps(result, indent=2)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"Results written to {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    main()
