#!/usr/bin/env python3
"""
Time-to-Event (Survival) Sample Size Calculator for Clinical Trial Design

Calculates sample size for survival endpoints using the Schoenfeld formula
for required events, with optional exponential model for event probability.
Supports superiority and non-inferiority designs.
"""

import argparse
import json
import math
import sys
from typing import Any, Dict


def calculate_survival_sample_size(
    hr: float,
    event_prob: float = None,
    median_control: float = None,
    follow_up: float = None,
    accrual: float = None,
    alpha: float = 0.05,
    power: float = 0.80,
    allocation_ratio: float = 1.0,
    dropout_rate: float = 0.15,
    design: str = "superiority",
) -> Dict[str, Any]:
    """
    Calculate sample size for time-to-event primary endpoint.

    Uses Schoenfeld formula for required number of events and converts
    to total patients via event probability.

    Args:
        hr: Hazard ratio (treatment vs control)
        event_prob: Overall probability of observing an event (user-specified)
        median_control: Median survival time in control arm (for exponential model)
        follow_up: Minimum follow-up duration (for exponential model)
        accrual: Accrual period duration (uniform accrual; optional)
        alpha: Type I error rate (default 0.05)
        power: Statistical power (default 0.80)
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

    # Validate HR
    if hr <= 0 or hr == 1.0:
        return {"error": "Hazard ratio must be positive and not equal to 1"}

    # Determine sidedness
    if design == "superiority":
        alpha_adj = alpha / 2  # Two-sided test
        sidedness = "two-sided"
    else:  # non-inferiority
        alpha_adj = alpha  # One-sided test
        sidedness = "one-sided"

    r = allocation_ratio

    # Z-scores for alpha and beta
    z_alpha = stats.norm.ppf(1 - alpha_adj)
    z_beta = stats.norm.ppf(power)

    # Schoenfeld formula for required events
    if r == 1.0:
        k = 4
    else:
        k = (1 + r) ** 2 / r

    d = math.ceil((z_alpha + z_beta) ** 2 / (math.log(hr) ** 2) * k)

    # Compute event probability
    if event_prob is not None:
        prob_event = event_prob
        event_method = "user_specified"
    else:
        # Exponential model
        lambda_control = math.log(2) / median_control
        lambda_treatment = lambda_control * hr

        if accrual is not None:
            # Average survival over uniform accrual
            def s_avg(lam, fu, acc):
                return (1.0 / (acc * lam)) * (math.exp(-lam * fu) - math.exp(-lam * (fu + acc)))

            s_control = s_avg(lambda_control, follow_up, accrual)
            s_treatment = s_avg(lambda_treatment, follow_up, accrual)
        else:
            s_control = math.exp(-lambda_control * follow_up)
            s_treatment = math.exp(-lambda_treatment * follow_up)

        # Combined event probability (allocation-weighted)
        prob_event = 1.0 - s_control ** (1.0 / (1.0 + r)) * s_treatment ** (r / (1.0 + r))
        event_method = "exponential_model"

    # Events to patients
    N = math.ceil(d / prob_event)
    n_treatment = math.ceil(N * r / (1 + r))
    n_control = N - n_treatment
    events_treatment = math.ceil(d * r / (1 + r))
    events_control = d - events_treatment

    # Adjust for dropout
    total_with_dropout = math.ceil(N / (1 - dropout_rate))
    treatment_with_dropout = math.ceil(n_treatment / (1 - dropout_rate))
    control_with_dropout = math.ceil(n_control / (1 - dropout_rate))

    # --- Sensitivity analysis: 90% power ---
    z_beta_90 = stats.norm.ppf(0.90)
    d_90 = math.ceil((z_alpha + z_beta_90) ** 2 / (math.log(hr) ** 2) * k)
    N_90 = math.ceil(d_90 / prob_event)
    total_90_dropout = math.ceil(N_90 / (1 - dropout_rate))

    # --- Sensitivity analysis: HR 10% toward null ---
    hr_sens = hr + (1.0 - hr) * 0.1

    d_sens = math.ceil((z_alpha + z_beta) ** 2 / (math.log(hr_sens) ** 2) * k)

    # Recompute prob_event if using exponential model
    if event_method == "exponential_model":
        lambda_treatment_sens = lambda_control * hr_sens
        if accrual is not None:
            s_treatment_sens = s_avg(lambda_treatment_sens, follow_up, accrual)
        else:
            s_treatment_sens = math.exp(-lambda_treatment_sens * follow_up)
        prob_event_sens = 1.0 - s_control ** (1.0 / (1.0 + r)) * s_treatment_sens ** (r / (1.0 + r))
    else:
        prob_event_sens = prob_event

    N_sens = math.ceil(d_sens / prob_event_sens)
    total_sens_dropout = math.ceil(N_sens / (1 - dropout_rate))

    # Build event probability section
    event_prob_info = {
        "method": event_method,
        "prob_event_overall": round(prob_event, 6),
    }
    if event_method == "exponential_model":
        event_prob_info["median_control"] = median_control
        event_prob_info["lambda_control"] = round(lambda_control, 6)
        event_prob_info["lambda_treatment"] = round(lambda_treatment, 6)
        event_prob_info["follow_up"] = follow_up
        if accrual is not None:
            event_prob_info["accrual"] = accrual

    # Format allocation ratio string
    alloc_str = f"{allocation_ratio}:1" if allocation_ratio != 1.0 else "1:1"

    return {
        "endpoint_type": "time-to-event",
        "study_design": design,
        "statistical_test": f"Log-rank test ({sidedness})",
        "hazard_ratio": hr,
        "alpha": alpha,
        "power": power,
        "allocation_ratio": alloc_str,
        "dropout_rate": dropout_rate,
        "event_probability": event_prob_info,
        "events_required": {
            "total": d,
            "treatment_arm": events_treatment,
            "control_arm": events_control,
        },
        "sample_size": {
            "treatment_arm": n_treatment,
            "control_arm": n_control,
            "total": N,
            "total_with_dropout": total_with_dropout,
            "treatment_with_dropout": treatment_with_dropout,
            "control_with_dropout": control_with_dropout,
        },
        "sensitivity_analysis": {
            "power_90_percent": {
                "events_required": d_90,
                "total_patients": N_90,
                "total_with_dropout": total_90_dropout,
            },
            "hr_less_favorable_10_percent": {
                "hazard_ratio": round(hr_sens, 4),
                "events_required": d_sens,
                "total_patients": N_sens,
                "total_with_dropout": total_sens_dropout,
            },
        },
        "assumptions": [
            "Proportional hazards assumption holds",
            "Log-rank test for primary analysis",
            f"Hazard ratio of {hr} is clinically meaningful and realistic",
            f"Event probability of {round(prob_event, 4)} based on {event_method.replace('_', ' ')}",
            "Censoring is non-informative",
            "Uniform accrual over recruitment period" if accrual is not None else "No staggered accrual assumed",
        ],
        "disclaimers": [
            "Sample size calculation is preliminary and based on assumptions",
            "Final sample size requires biostatistician review and validation",
            "FDA Pre-Submission meeting may require adjustments",
            "Consider pilot study to validate assumptions",
            "Exponential survival model may not hold; consider Weibull or piecewise models if appropriate",
        ],
    }


def main():
    parser = argparse.ArgumentParser(
        description="Time-to-Event (Survival) Sample Size Calculator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  With user-specified event probability:
    python survival_sample_size.py --hr 0.7 --event-prob 0.65

  With exponential model (median + follow-up):
    python survival_sample_size.py --hr 0.7 --median-control 12.0 --follow-up 24.0

  With accrual period:
    python survival_sample_size.py --hr 0.7 --median-control 12.0 --follow-up 24.0 --accrual 12.0

  Custom parameters:
    python survival_sample_size.py --hr 0.7 --event-prob 0.65 \\
        --alpha 0.05 --power 0.90 --dropout 0.20 --output results.json
        """,
    )

    parser.add_argument(
        "--hr",
        required=True,
        type=float,
        help="Hazard ratio (treatment vs control, <1 favors treatment)",
    )
    parser.add_argument(
        "--event-prob",
        type=float,
        help="Overall probability of observing an event (user-specified)",
    )
    parser.add_argument(
        "--median-control",
        type=float,
        help="Median survival time in control arm (for exponential model)",
    )
    parser.add_argument(
        "--follow-up",
        type=float,
        help="Minimum follow-up duration (for exponential model)",
    )
    parser.add_argument(
        "--accrual",
        type=float,
        help="Accrual period duration (uniform accrual; optional with exponential model)",
    )
    parser.add_argument(
        "--alpha",
        type=float,
        default=0.05,
        help="Type I error rate (default: 0.05)",
    )
    parser.add_argument(
        "--power",
        type=float,
        default=0.80,
        help="Statistical power (default: 0.80)",
    )
    parser.add_argument(
        "--allocation",
        type=float,
        default=1.0,
        help="Allocation ratio treatment:control (default: 1.0 for equal allocation)",
    )
    parser.add_argument(
        "--dropout",
        type=float,
        default=0.15,
        help="Expected dropout rate (default: 0.15)",
    )
    parser.add_argument(
        "--design",
        choices=["superiority", "non-inferiority"],
        default="superiority",
        help="Study design type (default: superiority)",
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output JSON file path (if not specified, prints to stdout)",
    )

    args = parser.parse_args()

    # Validate event probability input: must provide either --event-prob OR (--median-control AND --follow-up)
    has_event_prob = args.event_prob is not None
    has_exponential = args.median_control is not None or args.follow_up is not None

    if has_event_prob and has_exponential:
        parser.error("Provide either --event-prob OR (--median-control and --follow-up), not both")
    if not has_event_prob and not has_exponential:
        parser.error("Must provide either --event-prob OR (--median-control and --follow-up)")
    if has_exponential:
        if args.median_control is None or args.follow_up is None:
            parser.error("Both --median-control and --follow-up are required for the exponential model")

    result = calculate_survival_sample_size(
        hr=args.hr,
        event_prob=args.event_prob,
        median_control=args.median_control,
        follow_up=args.follow_up,
        accrual=args.accrual,
        alpha=args.alpha,
        power=args.power,
        allocation_ratio=args.allocation,
        dropout_rate=args.dropout,
        design=args.design,
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
