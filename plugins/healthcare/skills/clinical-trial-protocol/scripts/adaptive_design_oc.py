#!/usr/bin/env python3
"""
Adaptive Design Operating Characteristics Calculator

Two-stage adaptive design with sample size re-estimation using the inverse
normal combination test. Computes operating characteristics via simulation.
"""

import argparse
import json
import math
import sys


def simulate_adaptive(effect_size, std_dev, n1, n2_initial, n2_max, alpha,
                      futility_bound, promising_lower, promising_upper,
                      simulations, seed):
    try:
        from scipy import stats
        import numpy as np
    except ImportError:
        return {"error": "scipy not installed. Run: pip install scipy"}

    z_alpha = stats.norm.ppf(1 - alpha)

    # Fixed weights based on original plan
    t1 = n1 / (n1 + n2_initial)
    w1 = math.sqrt(t1)
    w2 = math.sqrt(1 - t1)

    # Non-centrality parameters
    # theta for stage with n subjects per arm: delta * sqrt(n) / (sigma * sqrt(2))
    theta1 = effect_size * math.sqrt(n1) / (std_dev * math.sqrt(2))

    rng = np.random.RandomState(seed)

    # Stage 1: generate Z1 for all simulations
    z1 = rng.normal(loc=theta1, scale=1.0, size=simulations)

    # Conditional power with initial n2
    # CP(n2 | Z1) = 1 - Phi((c_alpha - w1*Z1)/w2 - delta_hat*sqrt(n2)/(sigma*sqrt(2)))
    # where delta_hat is estimated from Z1: delta_hat = Z1 * sigma * sqrt(2) / sqrt(n1)
    # So delta_hat * sqrt(n2) / (sigma*sqrt(2)) = Z1 * sqrt(n2/n1)
    theta2_initial = z1 * math.sqrt(n2_initial / n1)
    cp_initial = 1.0 - stats.norm.cdf((z_alpha - w1 * z1) / w2 - theta2_initial)

    # Determine adapted n2 for each trial
    n2_actual = np.full(simulations, float(n2_initial))
    stopped_futility = np.zeros(simulations, dtype=bool)
    increased_n2 = np.zeros(simulations, dtype=bool)

    # Futility zone: CP < futility_bound
    futility_mask = cp_initial < futility_bound
    stopped_futility[futility_mask] = True

    # Favorable zone: CP >= promising_upper -> keep n2_initial
    # (no action needed, n2_actual already set)

    # Promising zone: promising_lower <= CP < promising_upper -> increase n2
    promising_mask = (cp_initial >= promising_lower) & (cp_initial < promising_upper) & ~futility_mask
    if np.any(promising_mask):
        # Solve for n2 that gives target CP = 0.8
        # 0.8 = 1 - Phi((z_alpha - w1*Z1)/w2 - Z1*sqrt(n2/n1))
        # Phi_inv(0.2) = (z_alpha - w1*Z1)/w2 - Z1*sqrt(n2/n1)
        # Z1*sqrt(n2/n1) = (z_alpha - w1*Z1)/w2 - Phi_inv(0.2)
        # sqrt(n2/n1) = ((z_alpha - w1*Z1)/w2 - Phi_inv(0.2)) / Z1
        target_cp = 0.8
        z_target = stats.norm.ppf(1 - target_cp)  # Phi_inv(0.2)
        z1_promising = z1[promising_mask]

        rhs = (z_alpha - w1 * z1_promising) / w2 - z_target
        ratio = rhs / z1_promising

        # Guard: if Z1 <= 0, ratio is invalid -> futility should have caught it,
        # but clamp to n2_max for safety
        valid = z1_promising > 0
        n2_solved = np.full(z1_promising.shape, float(n2_max))
        n2_solved[valid] = np.ceil(n1 * ratio[valid] ** 2)
        n2_solved = np.clip(n2_solved, n2_initial, n2_max)

        n2_actual[promising_mask] = n2_solved
        increased_n2[promising_mask] = n2_solved > n2_initial

    # Stage 2: generate Z2 (skip for futility-stopped trials but still generate for simplicity)
    theta2 = effect_size * np.sqrt(n2_actual) / (std_dev * math.sqrt(2))
    z2 = rng.normal(loc=theta2, scale=1.0, size=simulations)

    # Combine
    z_combined = w1 * z1 + w2 * z2

    # Reject (only if not stopped for futility)
    rejected = (z_combined > z_alpha) & ~stopped_futility

    # Total sample size per trial (2 arms)
    total_n = np.where(stopped_futility, 2 * n1, 2 * (n1 + n2_actual.astype(int)))

    power = float(np.mean(rejected))
    expected_n = float(np.mean(total_n))
    prob_futility = float(np.mean(stopped_futility))
    prob_increase = float(np.mean(increased_n2))
    mean_n2 = float(np.mean(n2_actual[~stopped_futility])) if np.any(~stopped_futility) else 0.0
    mc_se = float(np.std(rejected.astype(float)) / math.sqrt(simulations))

    return {
        "effect_size": effect_size,
        "std_dev": std_dev,
        "power": round(power, 6),
        "expected_n_total": round(expected_n, 1),
        "prob_futility_stop": round(prob_futility, 6),
        "prob_sample_size_increase": round(prob_increase, 6),
        "mean_n2_per_arm": round(mean_n2, 1),
        "monte_carlo_se": round(mc_se, 6),
    }


def main():
    try:
        from scipy import stats  # noqa: F401
    except ImportError:
        print("ERROR: scipy not installed. Run: pip install scipy", file=sys.stderr)
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="Adaptive Design Operating Characteristics Calculator")
    parser.add_argument("--effect-size", type=float)
    parser.add_argument("--effect-sizes", type=str,
                        help="Comma-separated effect sizes for OC curve")
    parser.add_argument("--std-dev", type=float, required=True)
    parser.add_argument("--n1", type=int, required=True,
                        help="Stage 1 sample size per arm")
    parser.add_argument("--n2-initial", type=int, required=True,
                        help="Initial stage 2 sample size per arm")
    parser.add_argument("--n2-max", type=int, required=True,
                        help="Maximum stage 2 sample size per arm")
    parser.add_argument("--alpha", type=float, default=0.025,
                        help="One-sided significance level (default: 0.025)")
    parser.add_argument("--futility-bound", type=float, default=0.1)
    parser.add_argument("--promising-lower", type=float, default=0.3)
    parser.add_argument("--promising-upper", type=float, default=0.9)
    parser.add_argument("--simulations", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=str)
    args = parser.parse_args()

    if args.effect_size is None and args.effect_sizes is None:
        parser.error("Either --effect-size or --effect-sizes is required")

    if args.effect_sizes:
        effect_sizes = [float(x) for x in args.effect_sizes.split(",")]
    else:
        effect_sizes = [args.effect_size]

    t1 = args.n1 / (args.n1 + args.n2_initial)
    w1 = round(math.sqrt(t1), 6)
    w2 = round(math.sqrt(1 - t1), 6)

    results = []
    for es in effect_sizes:
        res = simulate_adaptive(
            effect_size=es, std_dev=args.std_dev,
            n1=args.n1, n2_initial=args.n2_initial, n2_max=args.n2_max,
            alpha=args.alpha, futility_bound=args.futility_bound,
            promising_lower=args.promising_lower,
            promising_upper=args.promising_upper,
            simulations=args.simulations, seed=args.seed)
        if "error" in res:
            print(f"ERROR: {res['error']}", file=sys.stderr)
            sys.exit(1)
        results.append(res)

    output = {
        "analysis": "adaptive_design_oc",
        "design": {
            "n1_per_arm": args.n1,
            "n2_initial_per_arm": args.n2_initial,
            "n2_max_per_arm": args.n2_max,
            "alpha": args.alpha,
            "weights": {"w1": w1, "w2": w2},
            "futility_bound": args.futility_bound,
            "promising_zone": [args.promising_lower, args.promising_upper],
        },
        "results": results,
        "simulation": {
            "n_simulations": args.simulations,
            "seed": args.seed,
        },
        "assumptions": [
            "Two-stage adaptive design with sample size re-estimation",
            "Inverse normal combination test with fixed pre-planned weights",
            "Continuous endpoint with known standard deviation",
            "Independent observations within and between stages",
            "Normally distributed outcome",
        ],
        "disclaimers": [
            "Operating characteristics are based on simulation and subject to Monte Carlo error",
            "Final adaptive design requires biostatistician review and validation",
            "FDA Pre-Submission meeting recommended for adaptive designs",
            "All adaptations must be prospectively planned per FDA 2016 guidance",
        ],
    }

    output_json = json.dumps(output, indent=2)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"Results written to {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    main()
