#!/usr/bin/env python3
"""
Sensitivity Table Generator for Clinical Trial Design

Generates a 2D grid of total sample sizes (with dropout adjustment) across
combinations of two varying parameters. Outputs JSON.
"""

import argparse
import json
import math
import sys


PARAM_NAMES = {
    "effect-size": "effect_size",
    "std-dev": "std_dev",
    "dropout": "dropout_rate",
    "power": "power",
    "alpha": "alpha",
    "p1": "p1",
    "p2": "p2",
}

CONTINUOUS_PARAMS = {"effect-size", "std-dev", "dropout", "power", "alpha"}
BINARY_PARAMS = {"p1", "p2", "dropout", "power", "alpha"}


def _z(p):
    from scipy import stats
    return stats.norm.ppf(p)


def compute_continuous(effect_size, std_dev, alpha, power,
                       allocation_ratio, dropout_rate, design):
    cohens_d = abs(effect_size) / std_dev
    alpha_adj = alpha / 2 if design == "superiority" else alpha
    z_alpha = _z(1 - alpha_adj)
    z_beta = _z(power)

    if allocation_ratio == 1.0:
        n_per_arm = 2 * ((z_alpha + z_beta) ** 2) / (cohens_d ** 2)
    else:
        n_per_arm = ((1 + 1 / allocation_ratio) ** 2) * ((z_alpha + z_beta) ** 2) / (cohens_d ** 2)

    n_per_arm = math.ceil(n_per_arm)
    if allocation_ratio == 1.0:
        total = n_per_arm * 2
    else:
        total = n_per_arm + math.ceil(n_per_arm / allocation_ratio)

    return math.ceil(total / (1 - dropout_rate))


def compute_binary(p1, p2, alpha, power,
                   allocation_ratio, dropout_rate, design):
    alpha_adj = alpha / 2 if design == "superiority" else alpha
    z_alpha = _z(1 - alpha_adj)
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
        total = n_treatment * 2
    else:
        total = n_treatment + math.ceil(n_treatment / allocation_ratio)

    return math.ceil(total / (1 - dropout_rate))


def main():
    try:
        from scipy import stats  # noqa: F401
    except ImportError:
        print("ERROR: scipy not installed. Run: pip install scipy", file=sys.stderr)
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Sensitivity Table Generator")
    parser.add_argument("--type", required=True, choices=["continuous", "binary"])
    parser.add_argument("--row-param", required=True)
    parser.add_argument("--col-param", required=True)
    parser.add_argument("--row-values", required=True)
    parser.add_argument("--col-values", required=True)
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

    row_values = [float(x) for x in args.row_values.split(",")]
    col_values = [float(x) for x in args.col_values.split(",")]

    valid_params = CONTINUOUS_PARAMS if args.type == "continuous" else BINARY_PARAMS
    if args.row_param not in valid_params:
        parser.error(f"--row-param '{args.row_param}' invalid for {args.type} type")
    if args.col_param not in valid_params:
        parser.error(f"--col-param '{args.col_param}' invalid for {args.type} type")
    if args.row_param == args.col_param:
        parser.error("--row-param and --col-param must differ")

    # Build base params
    base = {
        "alpha": args.alpha,
        "power": args.power,
        "dropout_rate": args.dropout,
        "allocation_ratio": args.allocation,
        "design": args.design,
    }
    if args.type == "continuous":
        if args.effect_size is not None:
            base["effect_size"] = args.effect_size
        if args.std_dev is not None:
            base["std_dev"] = args.std_dev
    else:
        if args.p1 is not None:
            base["p1"] = args.p1
        if args.p2 is not None:
            base["p2"] = args.p2

    table = []
    for rv in row_values:
        row = []
        for cv in col_values:
            params = dict(base)
            params[PARAM_NAMES[args.row_param]] = rv
            params[PARAM_NAMES[args.col_param]] = cv

            if args.type == "continuous":
                cell = compute_continuous(
                    params["effect_size"], params["std_dev"],
                    params["alpha"], params["power"],
                    params["allocation_ratio"], params["dropout_rate"],
                    params["design"])
            else:
                cell = compute_binary(
                    params["p1"], params["p2"],
                    params["alpha"], params["power"],
                    params["allocation_ratio"], params["dropout_rate"],
                    params["design"])
            row.append(cell)
        table.append(row)

    # Build fixed_params (exclude the two varied params)
    fixed = {}
    varied = {PARAM_NAMES[args.row_param], PARAM_NAMES[args.col_param]}
    for k, v in base.items():
        if k not in varied:
            fixed[k] = v

    result = {
        "endpoint_type": args.type,
        "row_param": args.row_param,
        "col_param": args.col_param,
        "row_values": row_values,
        "col_values": col_values,
        "fixed_params": fixed,
        "table": table,
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
