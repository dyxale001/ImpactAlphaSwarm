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
    from_seven_step,
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
            # Satrix names its steps by temperament instead of by risk. Reading
            # these wrongly is not a near miss: without them four of its funds
            # looked like they published no rating, when the rating is printed
            # plainly on the sheet.
            ("Conservative", 1),
            ("CONSERVATIVE", 1),
            ("Cautious", 2),
            ("Moderate-Aggressive", 4),
            ("MODERATE-AGGRESSIVE", 4),
            ("Aggressive", 5),
        ],
    )
    def test_published_wordings_map_to_the_scale(self, raw, expected):
        assert normalize(raw) == expected

    @pytest.mark.parametrize("raw", ["", "  ", "-", "--", "N/A", "n/a", "None", "not published", "Unknown"])
    def test_an_absent_indicator_is_none(self, raw):
        assert normalize(raw) is None

    @pytest.mark.parametrize("raw", ["catastrophic", "level 7", "spicy", "moderate-ish", "2 of 6"])
    def test_an_unrecognised_wording_is_none_not_a_guess(self, raw):
        # A sheet whose wording we have never seen must not be forced onto the
        # scale. The fund stays browsable and says its manager publishes no
        # indicator we can read, which is true and checkable.
        #
        # "3 of 5" was in this list until 2026-09-09 and has moved to
        # TestAFiveStepScale. It was here as an example of a wording nobody had
        # seen, next to "spicy" — then Curate's sheet turned up printing exactly
        # that, five drawn boxes with only the ends labelled. A five-step
        # position needs no conversion to reach a five-step scale, and
        # `normalize(3)` already returns 3, so recognising the string form only
        # makes it agree with the numeric form. "2 of 6" takes its place: an
        # unseen denominator still must not be forced.
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


class TestASevenStepScale:
    """Ninety One prints seven numbered boxes and no words at all.

    This is the module's one conversion, so it gets its own tests. Two things
    are being defended: that the ends stay the ends, and that the surrounding
    behaviour did not loosen to accommodate it.

    Worth recording how it was found. Searching the text layer of ten sheets in
    the September 2026 batch reported "no risk rating" for nine of them, and
    that was wrong for most — Ninety One draws numbered boxes, Coronation draws
    a small dial. Only looking at the rendered pages showed the ratings were
    there, which is the Satrix 40 lesson holding a second time.
    """

    @pytest.mark.parametrize(
        "printed,expected",
        [
            ("1 of 7", 1),
            ("2 of 7", 1),
            ("3 of 7", 2),
            ("4 of 7", 3),
            ("5 of 7", 4),
            ("6 of 7", 5),
            ("7 of 7", 5),
        ],
    )
    def test_each_step_converts(self, printed, expected):
        assert normalize(printed) == expected

    def test_the_ends_stay_the_ends(self):
        """A fund at the top of seven steps must not land mid-scale on five.

        Proportional rounding would put 7/7 at 5 and 1/7 at 1 too, but it would
        also put 4/7 at 3 by arithmetic that happens to agree — the reason to
        state the table explicitly is that the ends are the part that matters
        for a ceiling comparison.
        """
        assert normalize("1 of 7") == min(RISK_SCALE)
        assert normalize("7 of 7") == max(RISK_SCALE)

    @pytest.mark.parametrize("printed", ["4/7", "4 out of 7", "4 OF 7", " 4 of 7 "])
    def test_the_ways_it_is_written(self, printed):
        """`/` in particular, which the separator collapsing would eat."""
        assert normalize(printed) == 3

    @pytest.mark.parametrize("printed", ["0 of 7", "8 of 7", "9 of 7"])
    def test_a_step_off_the_scale_is_not_a_rating(self, printed):
        assert normalize(printed) is None

    def test_another_denominator_is_not_assumed_to_be_seven(self):
        """Only the seven-step scale is converted, because only it was decided.

        A sheet printing "4 of 10" — Coronation prints "6/10" beside the word
        "Moderate" — must not be quietly run through the seven-step table. The
        word is what Coronation publishes and the word is what gets read.
        """
        assert normalize("4 of 10") is None
        assert normalize("6/10") is None
        # Coronation's own label still reads, because it is a word.
        assert normalize("Moderate") == 3

    def test_the_helper_is_usable_on_its_own(self):
        assert from_seven_step(4) == 3
        assert from_seven_step("4") == 3
        assert from_seven_step(0) is None
        assert from_seven_step(None) is None
        assert from_seven_step("not a number") is None

    def test_a_converted_level_is_still_only_half_the_record(self):
        """The raw label is what the page shows, and that is the mitigation.

        Converting is a computation this module otherwise refuses to do. It is
        tolerable only because `risk_indicator_raw` keeps what the sheet showed,
        so a reader sees "4 of 7" as printed and the converted number is used
        for the ceiling comparison alone. If that ever stops being true, this
        conversion should go.
        """
        assert label_for(normalize("4 of 7")) == "Moderate"
        # And a fund with no indicator at all still never clears a ceiling.
        assert normalize("") is None
        assert not within_ceiling(None, "Aggressive")


class TestAFiveStepScale:
    """A five-step scale needs no conversion: position N is level N.

    Recognised because a manager may draw five boxes and label only the ends.
    Curate labels boxes 1, 3 and 5 "Low risk", "Medium" and "High risk", so a
    fund sitting on box 2 has a published rating and no printed word for it —
    which is exactly the case that read as "publishes nothing" before anyone
    looked at the picture.
    """

    @pytest.mark.parametrize("printed,expected", [(f"{n} of 5", n) for n in range(1, 6)])
    def test_each_step_is_itself(self, printed, expected):
        assert normalize(printed) == expected

    @pytest.mark.parametrize("printed", ["2/5", "2 out of 5", "2 OF 5"])
    def test_the_ways_it_is_written(self, printed):
        assert normalize(printed) == 2

    @pytest.mark.parametrize("printed", ["0 of 5", "6 of 5", "9 of 5"])
    def test_a_step_off_the_scale_is_not_a_rating(self, printed):
        assert normalize(printed) is None

    def test_it_does_not_swallow_other_denominators(self):
        """INVARIANT: only 5 and 7 are recognised, and for different reasons.

        Five is an identity, seven is a conversion this project decided on.
        Coronation prints "6/10" beside the word "Moderate": the word is the
        rating, and running the position through any table would invent a step
        the manager never published. So a tenth-scale must stay unreadable.
        """
        assert normalize("6/10") is None
        assert normalize("4 of 10") is None
        assert normalize("2 of 6") is None
        assert normalize("Moderate") == 3


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
