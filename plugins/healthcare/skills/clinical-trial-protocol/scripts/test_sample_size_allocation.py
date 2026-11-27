"""Tests for unequal allocation in sample_size_calculator.py.

Run: python -m pytest test_sample_size_allocation.py  (needs scipy)
"""
import math
import os
import sys

import pytest

pytest.importorskip("scipy")
from scipy import stats  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sample_size_calculator import (  # noqa: E402
    calculate_binary_sample_size,
    calculate_continuous_sample_size,
)

RATIOS = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0]


def cont(r, **kw):
    return calculate_continuous_sample_size(5.0, 15.0, allocation_ratio=r, **kw)["sample_size"]


def binary(r, p1=0.60, p2=0.75, **kw):
    return calculate_binary_sample_size(p1, p2, allocation_ratio=r, **kw)["sample_size"]


def binary_power(n_c, n_t, p1, p2, alpha=0.05):
    """Power of the unpooled-under-H1 two-proportion z-test at the given sizes."""
    r = n_t / n_c
    p_bar = (p1 + r * p2) / (1 + r)
    z_a = stats.norm.ppf(1 - alpha / 2)
    se0 = math.sqrt(p_bar * (1 - p_bar) * (1 / n_c + 1 / n_t))
    se1 = math.sqrt(p1 * (1 - p1) / n_c + p2 * (1 - p2) / n_t)
    return stats.norm.cdf((abs(p2 - p1) - z_a * se0) / se1)


def test_continuous_equal_allocation_unchanged():
    s = cont(1.0)
    assert (s["treatment_arm"], s["control_arm"], s["total"]) == (142, 142, 284)


def test_continuous_no_jump_near_one():
    assert abs(cont(1.0001)["total"] - cont(1.0)["total"]) <= 2


def test_continuous_two_to_one():
    s = cont(2.0)
    assert (s["control_arm"], s["treatment_arm"], s["total"]) == (106, 212, 318)


@pytest.mark.parametrize("r", RATIOS)
def test_continuous_unequal_never_smaller_than_equal(r):
    assert cont(r)["total"] >= cont(1.0)["total"]


@pytest.mark.parametrize("r", RATIOS)
def test_continuous_arm_ratio_matches_requested(r):
    s = cont(r)
    assert s["treatment_arm"] == math.ceil(r * s["control_arm"])


@pytest.mark.parametrize("r", [0.5, 2.0, 3.0])
def test_continuous_sensitivity_not_below_main(r):
    res = calculate_continuous_sample_size(5.0, 15.0, allocation_ratio=r)
    assert res["sensitivity_analysis"]["power_90_percent"]["total"] >= res["sample_size"]["total"]
    assert res["sensitivity_analysis"]["effect_size_reduced_10_percent"]["total"] >= res["sample_size"]["total"]


def test_binary_equal_allocation_unchanged():
    s = binary(1.0)
    assert (s["treatment_arm"], s["control_arm"], s["total"]) == (152, 152, 304)


@pytest.mark.parametrize("r", RATIOS)
def test_binary_power_meets_target(r):
    s = binary(r)
    assert binary_power(s["control_arm"], s["treatment_arm"], 0.60, 0.75) >= 0.80 - 1e-3


@pytest.mark.parametrize("r", [0.5, 2.0, 3.0])
def test_binary_unequal_not_smaller_than_equal_total_roughly(r):
    # Unequal allocation never needs fewer subjects than 1:1 (up to rounding).
    assert binary(r)["total"] >= binary(1.0)["total"] - 1


@pytest.mark.parametrize("r", [0.5, 2.0, 3.0])
def test_binary_arm_ratio_matches_requested(r):
    s = binary(r)
    assert s["treatment_arm"] == math.ceil(r * s["control_arm"])


def test_binary_two_to_one_not_half_of_equal():
    assert binary(2.0)["total"] > 304
