#!/usr/bin/env python3
"""
Stratified Randomization Planner for Clinical Trial Design

Generates permuted block randomization sequences within strata, computes
balance metrics, and supports varying block sizes to prevent prediction.
"""

import argparse
import json
import math
import random
import sys


def generate_blocks(n_per_stratum, allocation_ratio, block_sizes, seed):
    """Generate a permuted block randomization sequence.

    Returns list of treatment assignments ('T' or 'C') and block size sequence used.
    """
    rng = random.Random(seed)

    # Subjects per block: ratio r means r treatment + 1 control per "unit"
    # For ratio 1.0 and block_size 4: 2T + 2C
    # For ratio 2.0 and block_size 6: 4T + 2C
    r = allocation_ratio
    unit_size = r + 1  # subjects per allocation unit

    assignments = []
    blocks_used = []

    while len(assignments) < n_per_stratum:
        bsize = rng.choice(block_sizes)

        # Ensure block size is divisible by unit_size for clean allocation
        n_units = bsize / unit_size
        if n_units != int(n_units):
            # Skip invalid block size for this ratio
            continue
        n_units = int(n_units)

        block = ['T'] * int(n_units * r) + ['C'] * n_units
        rng.shuffle(block)

        remaining = n_per_stratum - len(assignments)
        assignments.extend(block[:remaining])
        blocks_used.append(bsize)

    return assignments[:n_per_stratum], blocks_used


def compute_balance(assignments):
    """Compute running balance metrics."""
    n_t = sum(1 for a in assignments if a == 'T')
    n_c = len(assignments) - n_t
    imbalance = abs(n_t - n_c)

    # Running imbalance at each point
    running = []
    count_t = 0
    count_c = 0
    max_imbalance = 0
    for a in assignments:
        if a == 'T':
            count_t += 1
        else:
            count_c += 1
        imb = abs(count_t - count_c)
        max_imbalance = max(max_imbalance, imb)
        running.append(imb)

    return {
        "n_treatment": n_t,
        "n_control": n_c,
        "final_imbalance": imbalance,
        "max_running_imbalance": max_imbalance,
    }


def validate_block_sizes(block_sizes, allocation_ratio):
    """Return only block sizes divisible by (ratio + 1)."""
    unit = allocation_ratio + 1
    valid = [b for b in block_sizes if b / unit == int(b / unit)]
    return valid


def main():
    parser = argparse.ArgumentParser(
        description="Stratified Randomization Planner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python stratified_randomization.py --strata "Age<65,Age>=65" --n-per-stratum 50
  python stratified_randomization.py --strata "Male,Female" --n-per-stratum 30,40 --block-sizes 4,6,8
        """,
    )
    parser.add_argument("--strata", required=True,
                        help="Comma-separated stratum labels")
    parser.add_argument("--n-per-stratum", required=True,
                        help="Subjects per stratum (single int or comma-separated)")
    parser.add_argument("--block-sizes", type=str, default="4,6,8",
                        help="Comma-separated block sizes (default: 4,6,8)")
    parser.add_argument("--allocation", type=float, default=1.0,
                        help="Treatment:control ratio (default: 1.0)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=str)
    args = parser.parse_args()

    strata = args.strata.split(",")
    block_sizes = [int(x) for x in args.block_sizes.split(",")]

    n_values = [int(x) for x in args.n_per_stratum.split(",")]
    if len(n_values) == 1:
        n_values = n_values * len(strata)
    elif len(n_values) != len(strata):
        print("ERROR: --n-per-stratum must be a single value or match number of strata",
              file=sys.stderr)
        sys.exit(1)

    valid_blocks = validate_block_sizes(block_sizes, args.allocation)
    if not valid_blocks:
        print(f"ERROR: No block sizes are divisible by {args.allocation + 1} "
              f"(allocation ratio + 1). Provide valid block sizes.",
              file=sys.stderr)
        sys.exit(1)

    strata_results = []
    total_t = 0
    total_c = 0

    for i, (stratum, n) in enumerate(zip(strata, n_values)):
        # Use a deterministic per-stratum seed
        stratum_seed = args.seed + i
        assignments, blocks_used = generate_blocks(
            n, args.allocation, valid_blocks, stratum_seed)
        balance = compute_balance(assignments)

        total_t += balance["n_treatment"]
        total_c += balance["n_control"]

        strata_results.append({
            "stratum": stratum,
            "n_subjects": n,
            "n_treatment": balance["n_treatment"],
            "n_control": balance["n_control"],
            "final_imbalance": balance["final_imbalance"],
            "max_running_imbalance": balance["max_running_imbalance"],
            "blocks_used": blocks_used,
            "n_blocks": len(blocks_used),
        })

    alloc_str = (f"{args.allocation}:1"
                 if args.allocation != 1.0 else "1:1")

    total_n = total_t + total_c
    result = {
        "analysis": "stratified_randomization",
        "n_strata": len(strata),
        "allocation_ratio": alloc_str,
        "block_sizes_available": valid_blocks,
        "seed": args.seed,
        "overall": {
            "total_subjects": total_n,
            "total_treatment": total_t,
            "total_control": total_c,
            "overall_imbalance": abs(total_t - total_c),
        },
        "strata": strata_results,
        "assumptions": [
            "Permuted block randomization within each stratum",
            "Randomly varying block sizes to prevent allocation prediction",
            f"Block sizes drawn uniformly from {valid_blocks}",
            "Stratification factors are strong prognostic variables",
        ],
        "disclaimers": [
            "Randomization plan is preliminary and requires unblinded statistician review",
            "Final randomization should use a validated IWRS/IXRS system",
            "Block sizes should remain confidential to prevent prediction",
            "Consider Pocock-Simon minimization for >4 stratification factors",
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
