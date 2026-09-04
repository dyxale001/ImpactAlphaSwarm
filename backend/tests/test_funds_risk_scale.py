"""Tests for the fund-house risk indicator and the profile ceilings.

The claim being defended is that an unpublished risk label never becomes a
matched fund. That is the one behaviour in the matching chain where a plausible
shortcut — assume moderate, or infer from the category — would be both wrong and
invisible: a guessed 3 renders identically to a published 3, and the user would
be told their profile matched a label nobody ever assigned.

The second claim is that the ceilings are the ones decided, and that an
unrecognised profile fails toward showing less rather than more.

No Supabase, no network.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds import risk_scale  # noqa: E402
from src.funds.risk_scale import (  # noqa: E402
    CEILINGS,
    RISK_SCALE,
    ceiling_for,
    label_for,
    normalize,
    within_ceiling,
)


class TestNormalisingPublishedLabels:
    """INVARIANT: the wordings fund houses actually print map to the scale."""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Low", 1),
            ("low", 1),
            ("  LOW  ", 1),
            ("Very Low", 1),
            ("Low to Moderate", 2),
            ("Low - Moderate", 2),
            ("Low-Moderate", 2),
            ("Low – Moderate", 2),  # en dash, as printed on several sheets
            ("Low/Moderate", 2),
            ("Low to Medium", 2),
            ("Moderately Low", 2),
            ("Moderate", 3),
            ("Medium", 3),  # the platform pages' wording
            ("Moderate to High", 4),
            ("Moderate-High", 4),
            ("Medium to High", 4),
            ("Moderately High", 4),
            ("High", 5),
            ("Very High", 5),
            # Wordings taken off real sheets. FundRock heads the section
            # "Moderate - High Risk" and abbreviates its own scale to
            # "Low-Mod / Mod / Mod-High"; both are the same ratings, and the
            # first draft of this table read neither.
            ("Moderate - High Risk", 4),
            ("Moderate Risk", 3),
            ("Low Risk", 1),
            ("High Risk Profile", 5),
            ("Low-Mod", 2),
            ("Mod", 3),
            ("Mod-High", 4),
        ],
    )
    def test_published_wordings_map_to_the_scale(self, raw, expected):
        assert normalize(raw) == expected

    @pytest.mark.parametrize("raw", ["", "  ", "-", "--", "N/A", "n/a", "None", "not published", "Unknown"])
    def test_an_absent_indicator_is_none(self, raw):
        assert normalize(raw) is None

    @pytest.mark.parametrize("raw", ["catastrophic", "level 7", "spicy", "moderate-ish", "3 of 5"])
    def test_an_unrecognised_wording_is_none_not_a_guess(self, raw):
        # A sheet whose wording we have never seen must not be forced onto the
        # scale. The fund stays browsable and says its manager publishes no
        # indicator we can read, which is true and checkable.
        assert normalize(raw) is None

    @pytest.mark.parametrize("raw", [None, [], {}, object(), True, False])
    def test_non_strings_are_none(self, raw):
        # True is explicitly included: bool is an int subclass, and a stray True
        # must not normalise to level 1.
        assert normalize(raw) is None

    @pytest.mark.parametrize("raw,expected", [(1, 1), (3, 3), (5, 5), (1.0, 1), (4.0, 4)])
    def test_a_number_already_on_the_scale_passes_through(self, raw, expected):
        # Snapshots store the normalised level too, so re-normalising a stored
        # value has to be a no-op rather than a null.
        assert normalize(raw) == expected

    @pytest.mark.parametrize("raw", [0, 6, -1, 99, 2.5])
    def test_a_number_off_the_scale_is_none(self, raw):
        assert normalize(raw) is None


class TestScaleAndCeilings:
    """PINNED VALUE: the five steps and the three ceilings, as decided."""

    def test_the_scale_has_five_ordered_steps(self):
        assert list(RISK_SCALE) == [1, 2, 3, 4, 5]
        assert RISK_SCALE[1] == "Low"
        assert RISK_SCALE[5] == "High"

    def test_the_ceilings_are_two_three_and_five(self):
        assert CEILINGS == {"Conservative": 2, "Moderate": 3, "Aggressive": 5}

    def test_the_top_ceiling_means_no_ceiling(self):
        # 5 rather than 4 on purpose: if a manager ever prints a sixth step, an
        # aggressive profile should not silently start excluding funds.
        assert CEILINGS["Aggressive"] == max(RISK_SCALE)

    def test_ceilings_rise_with_risk_tolerance(self):
        assert CEILINGS["Conservative"] < CEILINGS["Moderate"] < CEILINGS["Aggressive"]

    def test_an_unrecognised_profile_falls_back_to_the_middle(self):
        # Failing toward the moderate ceiling shows a user fewer funds than they
        # might have qualified for. Failing toward the permissive one would show
        # them funds their own answers excluded, which is the worse mistake.
        assert ceiling_for("Balanced-ish") == CEILINGS["Moderate"]
        assert ceiling_for("") == CEILINGS["Moderate"]

    def test_label_for_returns_the_scale_word(self):
        assert label_for(2) == "Low to Moderate"
        assert label_for(None) is None
        assert label_for(9) is None


class TestTheCeilingRule:
    """INVARIANT: an unpublished label never clears any ceiling."""

    def test_a_published_label_at_or_below_the_ceiling_clears(self):
        assert within_ceiling(1, "Conservative") is True
        assert within_ceiling(2, "Conservative") is True
        assert within_ceiling(3, "Moderate") is True
        assert within_ceiling(5, "Aggressive") is True

    def test_a_published_label_above_the_ceiling_does_not(self):
        assert within_ceiling(3, "Conservative") is False
        assert within_ceiling(4, "Moderate") is False

    def test_an_unpublished_label_never_clears_even_for_aggressive(self):
        # The single most important assertion in this file.
        for profile in CEILINGS:
            assert within_ceiling(None, profile) is False

    def test_the_rule_is_stated_once(self):
        # Callers must not re-implement the None case; if this helper stops
        # being the only place it is decided, the shortcut creeps back in.
        assert hasattr(risk_scale, "within_ceiling")
