#!/usr/bin/env python3
"""
Multiplicity Adjustment Calculator for Clinical Trial Design

Adjusts p-values for multiple comparisons using Bonferroni, Holm (step-down),
and Hochberg (step-up) procedures. Reports adjusted p-values, rejection
decisions, and adjusted significance levels.
"""

import argparse
import json
import sys


def bonferroni(p_values, alpha):
    """Bonferroni correction: multiply each p-value by m."""
    m = len(p_values)
    adjusted = [min(p * m, 1.0) for p in p_values]
    rejected = [p <= alpha for p in adjusted]
    return adjusted, rejected


def holm(p_values, alpha):
    """Holm step-down procedure."""
    m = len(p_values)
    indexed = sorted(enumerate(p_values), key=lambda x: x[1])

    adjusted = [0.0] * m
    rejected = [False] * m

    cummax = 0.0
    for rank, (orig_idx, p) in enumerate(indexed):
        adj_p = min(p * (m - rank), 1.0)
        cummax = max(cummax, adj_p)
        adjusted[orig_idx] = cummax

    for i in range(m):
        rejected[i] = adjusted[i] <= alpha

    return adjusted, rejected


def hochberg(p_values, alpha):
    """Hochberg step-up procedure."""
    m = len(p_values)
    indexed = sorted(enumerate(p_values), key=lambda x: x[1], reverse=True)

    adjusted = [0.0] * m
    rejected = [False] * m

    cummin = 1.0
    for rank_from_end, (orig_idx, p) in enumerate(indexed):
        k = rank_from_end  # 0 = largest p
        adj_p = min(p * (k + 1), 1.0)
        cummin = min(cummin, adj_p)
        adjusted[orig_idx] = cummin

    for i in range(m):
        rejected[i] = adjusted[i] <= alpha

    return adjusted, rejected


METHODS = {
    "bonferroni": bonferroni,
    "holm": holm,
    "hochberg": hochberg,
}


def main():
    parser = argparse.ArgumentParser(
        description="Multiplicity Adjustment Calculator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python multiplicity_adjustment.py --p-values 0.01,0.04,0.03 --method holm
  python multiplicity_adjustment.py --p-values 0.01,0.04,0.03 --method all
        """,
    )
    parser.add_argument("--p-values", required=True,
                        help="Comma-separated p-values")
    parser.add_argument("--method", required=True,
                        choices=["bonferroni", "holm", "hochberg", "all"],
                        help="Adjustment method (or 'all' for all methods)")
    parser.add_argument("--alpha", type=float, default=0.05,
                        help="Family-wise error rate (default: 0.05)")
    parser.add_argument("--labels", type=str,
                        help="Comma-separated hypothesis labels (optional)")
    parser.add_argument("--output", type=str)
    args = parser.parse_args()

    p_values = [float(x) for x in args.p_values.split(",")]
    m = len(p_values)

    if any(p < 0 or p > 1 for p in p_values):
        print("ERROR: All p-values must be between 0 and 1", file=sys.stderr)
        sys.exit(1)

    if args.labels:
        labels = args.labels.split(",")
        if len(labels) != m:
            print("ERROR: Number of labels must match number of p-values",
                  file=sys.stderr)
            sys.exit(1)
    else:
        labels = [f"H{i+1}" for i in range(m)]

    methods = list(METHODS.keys()) if args.method == "all" else [args.method]

    adjustments = {}
    for method_name in methods:
        adjusted, rejected = METHODS[method_name](p_values, args.alpha)
        adjustments[method_name] = {
            "adjusted_p_values": [round(p, 10) for p in adjusted],
            "rejected": rejected,
            "n_rejected": sum(rejected),
        }

    result = {
        "analysis": "multiplicity_adjustment",
        "n_hypotheses": m,
        "alpha": args.alpha,
        "hypotheses": labels,
        "original_p_values": p_values,
        "adjustments": adjustments,
        "assumptions": [
            "P-values are valid (uniformly distributed under H0)",
            f"Family-wise error rate controlled at {args.alpha}",
            "Bonferroni: valid for any dependency structure",
            "Holm: valid for any dependency structure (uniformly more powerful than Bonferroni)",
            "Hochberg: requires non-negative dependency (e.g., independent or positively correlated tests)",
        ],
        "disclaimers": [
            "Multiplicity adjustment is preliminary",
            "Final analysis plan requires biostatistician review",
            "Consider graphical procedures (Bretz et al.) for complex endpoint hierarchies",
        ],
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
