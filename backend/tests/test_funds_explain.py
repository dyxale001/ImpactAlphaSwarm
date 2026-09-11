"""Tests for the fund explanation and its guards.

Two claims. The first is that a thin fact sheet produces a shorter explanation
rather than a padded one — fund houses publish different amounts, and a sentence
reading "What it holds: None" is worse than no sentence.

The second is the guard, and it matters more than the prose. Every number shown
has to exist in the document it was built from, and no wording may turn a filter
into a proposal. Today the renderer is templated and could barely invent a
figure; the guard is written and tested now so that when a model is eventually
pointed at the same context, the thing it must pass already exists and is
already known not to reject honest output.

No Supabase, no network, no model.
"""

from __future__ import annotations

import logging
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds import copy as copytext  # noqa: E402
from src.funds.explain import (  # noqa: E402
    DEFAULT_SECTIONS,
    CopyGuard,
    CopyViolation,
    CostsSection,
    DistributionSection,
    ExplanationBuilder,
    ExplanationContext,
    ExplanationSection,
    HoldingsSection,
    PerformanceSection,
    ReasonSentence,
    RuleSection,
    WhatItIsSection,
)
from src.funds.matcher import RULE_CATEGORY, RULE_RISK_CEILING  # noqa: E402
from src.funds.models import Goals, MatchResult, Profile  # noqa: E402

TODAY = date(2026, 9, 4)

FUND = {"id": "f-1", "isin": "ZAE000027108", "name": "Example Balanced Fund"}

FULL_SNAPSHOT = {
    "as_of": "2026-07-31",
    "objective": "  to track the performance of the FTSE/JSE Top 40 Index  ",
    "asset_allocation": {"equity": 60.0, "bonds": 30.0, "cash": 10.0},
    "benchmark": "South African - Multi Asset - Medium Equity Category Average",
    "ter": 1.26,
    "tc": 0.09,
    "tic": 1.35,
    "performance": {"1y": 11.74, "3y": 13.38, "5y": 10.69},
    "distribution_frequency": "Quarterly",
    "risk_indicator_raw": "Moderate",
    "risk_indicator_1to5": 3,
}


def context(snapshot=None, match=None, profile=None) -> ExplanationContext:
    return ExplanationContext(
        fund=FUND,
        snapshot=FULL_SNAPSHOT if snapshot is None else snapshot,
        match=match,
        profile=profile,
        today=TODAY,
    )


def match_result(**overrides) -> MatchResult:
    fields = {
        "fund_id": "f-1",
        "isin": "ZAE000027108",
        "name": "Example Balanced Fund",
        "vehicle": "unit_trust",
        "fund_house": "Example",
        "manco": "Example Collective Investments (RF) (Pty) Ltd",
        "asisa_category": "South African - Multi Asset - Medium Equity",
        "as_of": "2026-07-31",
        "risk_indicator_1to5": 3,
        "risk_indicator_raw": "Moderate",
        "ter": 1.26,
        "tic": 1.35,
        "rules_applied": (RULE_RISK_CEILING, RULE_CATEGORY),
    }
    fields.update(overrides)
    return MatchResult(**fields)


def profile(**goal_fields) -> Profile:
    goals = Goals(**goal_fields) if goal_fields else None
    return Profile(user_id="u-1", risk_tolerance="Moderate", goals=goals)


class TestSections:
    def test_the_objective_is_quoted_and_tidied(self):
        rendered = WhatItIsSection().render(context())
        assert rendered is not None
        assert "to track the performance of the FTSE/JSE Top 40 Index." in rendered
        assert "  " not in rendered

    def test_holdings_are_listed_largest_first(self):
        rendered = HoldingsSection().render(context())
        assert rendered is not None
        assert rendered.index("60% equity") < rendered.index("30% bonds") < rendered.index("10% cash")
        assert "31 July 2026" in rendered

    def test_costs_use_both_published_figures(self):
        rendered = CostsSection().render(context())
        assert rendered is not None
        assert "1.35" in rendered and "1.26" in rendered

    def test_costs_fall_back_to_the_expense_ratio_alone(self):
        rendered = CostsSection().render(context({**FULL_SNAPSHOT, "tic": None}))
        assert rendered is not None
        assert "1.26" in rendered
        assert "1.35" not in rendered

    def test_performance_leads_with_the_longest_horizon(self):
        # One year of a fund's life is the least informative figure on the sheet
        # and the likeliest to be read as a forecast.
        rendered = PerformanceSection().render(context())
        assert rendered is not None
        assert rendered.index("over 5 years") < rendered.index("over 3 years")
        assert "11.74" not in rendered
        assert "31 July 2026" in rendered

    def test_performance_is_always_dated_and_always_has_its_benchmark(self):
        assert PerformanceSection().render(context({**FULL_SNAPSHOT, "benchmark": None})) is None

    def test_the_distribution_line_appears_only_for_an_income_purpose(self):
        assert DistributionSection().render(context(profile=profile(purpose="growth"))) is None
        rendered = DistributionSection().render(context(profile=profile(purpose="income")))
        assert rendered is not None and "quarterly" in rendered

    def test_the_rule_line_names_filters_in_plain_words(self):
        rendered = RuleSection().render(context(match=match_result()))
        assert rendered is not None
        assert copytext.RULE_NOTES[RULE_RISK_CEILING] in rendered
        assert RULE_RISK_CEILING not in rendered  # not the internal name

    def test_a_section_with_nothing_to_say_says_nothing(self):
        bare = {"as_of": "2026-07-31"}
        for section in DEFAULT_SECTIONS:
            assert section.render(context(bare)) is None, section.name

    def test_every_section_shares_one_interface(self):
        for section in DEFAULT_SECTIONS:
            assert isinstance(section, ExplanationSection)
            assert section.name


class TestTheBuilder:
    def test_a_full_sheet_produces_the_whole_paragraph(self):
        text = ExplanationBuilder().build(context(match=match_result(), profile=profile(purpose="income")))
        assert "What it is:" in text
        assert "What it holds" in text
        assert "What it costs:" in text
        assert "How it has done:" in text
        assert "Why you are seeing it:" in text
        assert "quarterly" in text

    def test_a_thin_sheet_produces_a_shorter_paragraph_not_a_padded_one(self):
        thin = {"as_of": "2026-07-31", "ter": 0.1}
        text = ExplanationBuilder().build(context(thin, match=match_result()))
        assert "What it costs:" in text
        assert "What it holds" not in text
        assert "None" not in text

    def test_an_empty_sheet_returns_the_unavailable_notice(self):
        text = ExplanationBuilder().build(context({"as_of": "2026-07-31"}))
        assert text == copytext.EXPLANATION_UNAVAILABLE

    def test_the_paragraph_never_contains_a_forbidden_term(self):
        text = ExplanationBuilder().build(context(match=match_result(), profile=profile(purpose="income")))
        assert copytext.find_forbidden_terms(text) == []

    def test_sections_can_be_composed_differently(self):
        # A fund page shows everything; a match card may show less. One builder,
        # not two renderers drifting apart.
        text = ExplanationBuilder(sections=(CostsSection(),)).build(context())
        assert text.startswith("What it costs:")
        assert "What it is:" not in text


class TestTheNumberGuard:
    def test_every_number_in_the_output_is_in_the_sheet(self):
        ctx = context(match=match_result(), profile=profile(horizon_target_year=2031))
        text = ExplanationBuilder().build(ctx)
        CopyGuard().check(text, ctx)  # does not raise

    def test_a_number_absent_from_the_sheet_is_rejected(self):
        ctx = context()
        with pytest.raises(CopyViolation) as raised:
            CopyGuard().check("What it costs: a total investment charge of 0.99% a year.", ctx)
        assert "0.99" in str(raised.value)

    def test_punctuation_does_not_defeat_the_comparison(self):
        # "1,26" and "1.26" are the same figure; a sheet may print either.
        ctx = context()
        CopyGuard().check("The charge is 1,26%.", ctx)

    def test_a_figure_from_the_users_own_answers_is_grounded(self):
        ctx = context(profile=profile(horizon_target_year=2031))
        CopyGuard().check("money you expect to keep invested until 2031", ctx)

    def test_a_forbidden_term_is_rejected_before_any_number_check(self):
        ctx = context()
        with pytest.raises(CopyViolation) as raised:
            CopyGuard().check("We recommend this fund.", ctx)
        assert "forbidden" in str(raised.value)

    def test_a_rejected_paragraph_is_replaced_and_logged(self, caplog):
        # The behaviour that matters in production: never serve it, and make
        # sure somebody can find out why.
        class InventingSection(ExplanationSection):
            name = "inventing"

            def render(self, ctx):
                return "What it costs: a total investment charge of 0.01% a year."

        builder = ExplanationBuilder(sections=(InventingSection(),))
        with caplog.at_level(logging.ERROR):
            text = builder.build(context())
        assert text == copytext.EXPLANATION_UNAVAILABLE
        assert "rejected" in caplog.text
        assert "ZAE000027108" in caplog.text

    def test_the_guard_can_be_given_extra_allowances(self):
        ctx = context()
        CopyGuard(extra_allowed=["2026"]).check("as reported in 2026", ctx)


class TestDates:
    def test_a_stored_string_reads_as_a_sentence(self):
        assert context().as_of_display == "31 July 2026"

    def test_a_date_object_reads_the_same_way(self):
        # Both paths must agree: the repository returns a string, the seed
        # loader holds a date, and the same figure must not be dated two ways.
        assert context({**FULL_SNAPSHOT, "as_of": date(2026, 7, 31)}).as_of_display == "31 July 2026"

    def test_a_single_digit_day_is_not_padded(self):
        assert context({**FULL_SNAPSHOT, "as_of": date(2026, 7, 1)}).as_of_display == "1 July 2026"

    def test_an_unparseable_date_is_shown_as_stored_not_guessed(self):
        assert context({**FULL_SNAPSHOT, "as_of": "July 2026"}).as_of_display == "July 2026"


class TestTheReasonSentence:
    def test_it_names_its_sources_and_the_users_answers(self):
        text = ReasonSentence().render(
            match_result(),
            profile(horizon_target_year=2031, purpose="growth"),
            today=TODAY,
        )
        assert "Example Collective Investments (RF) (Pty) Ltd" in text
        assert "Moderate" in text
        assert "South African - Multi Asset - Medium Equity" in text
        assert "31 July 2026" in text
        assert "2031" in text
        assert "long-term growth" in text

    def test_it_says_what_it_is_not(self):
        text = ReasonSentence().render(match_result(), profile(), today=TODAY)
        assert "This is information, not advice." in text
        assert "Read the fact sheet before deciding." in text

    def test_without_goals_it_claims_only_the_risk_profile(self):
        text = ReasonSentence().render(match_result(), profile(), today=TODAY)
        assert "risk profile is Moderate" in text
        assert "2031" not in text
        assert "emergency" not in text

    def test_it_falls_back_to_the_scale_word_when_no_wording_was_published(self):
        text = ReasonSentence().render(
            match_result(risk_indicator_raw=None, risk_indicator_1to5=2),
            profile(),
            today=TODAY,
        )
        assert "Low to Moderate" in text

    def test_it_never_contains_a_forbidden_term(self):
        for purpose in ("emergency_fund", "goal", "growth", "income"):
            text = ReasonSentence().render(
                match_result(), profile(purpose=purpose, horizon_target_year=2031), today=TODAY
            )
            assert copytext.find_forbidden_terms(text) == [], purpose

    def test_every_purpose_produces_a_readable_sentence(self):
        for purpose in ("emergency_fund", "goal", "growth", "income"):
            text = ReasonSentence().render(match_result(), profile(purpose=purpose), today=TODAY)
            assert text.endswith("Read the fact sheet before deciding.")
            assert "  " not in text
