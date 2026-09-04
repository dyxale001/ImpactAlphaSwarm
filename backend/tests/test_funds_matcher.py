"""Tests for the fund matcher.

The five scenario tests in ``TestTheWorkedCases`` are the specification, not
illustrations of it. Each one is a sentence someone said out loud while the
feature was being designed — "an aggressive investor saving an emergency fund
should still see money market funds" — turned into an assertion. If the bracket
policy is ever revised, these are the tests that have to be argued with.

Everything after them defends the properties that make the output honest: an
unpublished risk label never matches, a horizon caps a bracket but never raises
it, a missing answer degrades one axis instead of the whole match, and nothing
is ever ordered by past performance.

The catalogue is a fixture with one fund per category, carrying the risk labels
and minimum terms those categories really print. No Supabase, no network.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds.asisa import ASISA, BRACKET_CATEGORIES  # noqa: E402
from src.funds.matcher import (  # noqa: E402
    DEFAULT_RULES,
    ORDER_BY_COST,
    ORDER_BY_NAME,
    RULE_CATEGORY,
    RULE_ELIGIBILITY,
    RULE_HORIZON,
    RULE_PURPOSE,
    RULE_RISK_CEILING,
    RULE_SKIPPED_NO_GOALS,
    CategoryRule,
    FundMatcher,
    HorizonRule,
    MatchRule,
    PurposeRule,
    RiskCeilingRule,
)
from src.funds.models import FundCandidate, Goals, Profile  # noqa: E402

TODAY = date(2026, 9, 4)

# One fund per category, with the risk label and minimum term such a fund really
# publishes. Names are alphabetical-order-revealing on purpose.
CATALOGUE_SPEC: tuple[tuple[str, str, int | None, float | None, bool], ...] = (
    # (code, name, risk 1-5, recommended minimum term in years, index tracker)
    ("sa_ib_money_market",  "Alpha Money Market Fund",      1, 0.25, False),
    ("sa_ib_short_term",    "Bravo Short Term Income Fund", 1, 1.0,  False),
    ("sa_ma_income",        "Charlie Income Fund",          2, 1.0,  False),
    ("sa_ma_low_equity",    "Delta Low Equity Fund",        2, 3.0,  False),
    ("sa_ib_variable_term", "Echo Bond Fund",               3, 3.0,  False),
    ("sa_ma_medium_equity", "Foxtrot Balanced Fund",        3, 3.0,  False),
    ("sa_ma_high_equity",   "Golf High Equity Fund",        4, 5.0,  False),
    ("sa_eq_general",       "Hotel Top 40 Index ETF",       4, 5.0,  True),
    ("sa_eq_general",       "India Equity Alpha Fund",      4, 5.0,  False),
    ("gl_eq_general",       "Juliett World Index ETF",      5, 7.0,  True),
    ("gl_ma_high_equity",   "Kilo Global Growth Fund",      4, 5.0,  False),
    ("sa_re_general",       "Lima Property Fund",           5, 5.0,  False),
    ("gl_re_general",       "Mike Global Property Fund",    5, 5.0,  False),
    ("ww_ma_flexible",      "November Flexible Fund",       4, 5.0,  False),
    ("sa_ma_flexible",      "Oscar SA Flexible Fund",       3, 3.0,  False),
)


def build_candidate(
    code: str,
    name: str,
    risk: int | None,
    term: float | None,
    tracker: bool,
    *,
    tfsa: bool = True,
    tic: float | None = 1.0,
    min_debit_order: float | None = None,
    as_of: str = "2026-07-31",
    with_snapshot: bool = True,
) -> FundCandidate:
    category = ASISA.by_code(code)
    assert category is not None, code
    fund = {
        "id": f"f-{name.split()[0].lower()}",
        "isin": "ZAE000000000",
        "name": name,
        "fund_house": "Example",
        "manco": "Example Managers (RF) (Pty) Ltd",
        "vehicle": "etf" if tracker else "unit_trust",
        "is_index_tracker": tracker,
        "asisa_geography": category.tier1,
        "asisa_asset_class": category.tier2,
        "asisa_category": category.name,
        "tfsa_eligible": tfsa,
    }
    if not with_snapshot:
        return FundCandidate(fund=fund, snapshot=None)
    return FundCandidate(
        fund=fund,
        snapshot={
            "as_of": as_of,
            "risk_indicator_1to5": risk,
            "risk_indicator_raw": None,
            "recommended_min_term_years": term,
            "ter": 0.9,
            "tic": tic,
            "min_debit_order": min_debit_order,
        },
    )


@pytest.fixture
def catalogue() -> list[FundCandidate]:
    return [build_candidate(*spec) for spec in CATALOGUE_SPEC]


@pytest.fixture
def matcher() -> FundMatcher:
    return FundMatcher(clock=lambda: TODAY)


def profile(risk: str, **goal_fields) -> Profile:
    goals = Goals(**goal_fields) if goal_fields else None
    return Profile(user_id="u-1", risk_tolerance=risk, goals=goals)


def names(outcome) -> set[str]:
    return {m.name for m in outcome.matches}


def categories(outcome) -> set[str]:
    return {m.asisa_category for m in outcome.matches}


# ═════════════════════════════════════════════════════════════════════════════
# The specification
# ═════════════════════════════════════════════════════════════════════════════

class TestTheWorkedCases:
    def test_aggressive_saving_an_emergency_fund_sees_only_accessible_money(self, matcher, catalogue):
        # The panel's own example, and the case the equity side of the product
        # cannot serve at all. Appetite for risk does not change when you need
        # the money back.
        outcome = matcher.match(
            profile("Aggressive", purpose="emergency_fund", horizon_target_year=2027),
            catalogue,
        )
        assert names(outcome) == {"Alpha Money Market Fund", "Bravo Short Term Income Fund"}
        assert outcome.bracket.effective == "Conservative"
        assert RULE_PURPOSE in outcome.rules_applied

    def test_conservative_with_a_long_horizon_still_sees_cash(self, matcher, catalogue):
        # A long horizon may not lift a ceiling. What it does is let the more
        # patient cautious options in alongside the immediate ones.
        outcome = matcher.match(
            profile("Conservative", purpose="growth", horizon_target_year=2031),
            catalogue,
        )
        assert names(outcome) == {
            "Alpha Money Market Fund",
            "Bravo Short Term Income Fund",
            "Charlie Income Fund",
            "Delta Low Equity Fund",
        }
        assert outcome.bracket.effective == "Conservative"

    def test_moderate_over_three_years_sees_balanced_and_bonds(self, matcher, catalogue):
        # High Equity is dropped by the ceiling (its label is 4, above 3) and
        # the five-year funds are dropped by the horizon. What is left is what a
        # three-year moderate saver is actually shown.
        outcome = matcher.match(
            profile("Moderate", purpose="goal", horizon_target_year=2029),
            catalogue,
        )
        assert names(outcome) == {"Foxtrot Balanced Fund", "Echo Bond Fund"}
        assert RULE_HORIZON in outcome.rules_applied
        assert RULE_RISK_CEILING in outcome.rules_applied

    def test_moderate_under_two_years_drops_to_the_cautious_bracket(self, matcher, catalogue):
        # Eighteen months caps the bracket, and the three-year funds fall to the
        # minimum term stated on their own sheets.
        outcome = matcher.match(
            profile("Moderate", purpose="goal", horizon_target_year=2027),
            catalogue,
        )
        assert names(outcome) == {"Alpha Money Market Fund", "Bravo Short Term Income Fund", "Charlie Income Fund"}
        assert outcome.bracket.effective == "Conservative"
        assert outcome.bracket.horizon_band == "under_2"

    def test_aggressive_over_five_years_sees_the_growth_categories(self, matcher, catalogue):
        # Equity, property and flexible mandates, AND the balanced and bond
        # funds a moderate profile is shown: a higher tolerance for risk adds
        # options, it does not take them away. What it does not add is cash —
        # those categories are dropped on relevance, not on risk.
        outcome = matcher.match(
            profile("Aggressive", purpose="growth", horizon_target_year=2033),
            catalogue,
        )
        assert names(outcome) == {
            "Echo Bond Fund",
            "Foxtrot Balanced Fund",
            "Golf High Equity Fund",
            "Hotel Top 40 Index ETF",
            "India Equity Alpha Fund",
            "Juliett World Index ETF",
            "Kilo Global Growth Fund",
            "Lima Property Fund",
            "Mike Global Property Fund",
            "November Flexible Fund",
            "Oscar SA Flexible Fund",
        }
        assert outcome.bracket.effective == "Aggressive"

    def test_an_aggressive_growth_profile_is_not_shown_cash(self, matcher, catalogue):
        outcome = matcher.match(
            profile("Aggressive", purpose="growth", horizon_target_year=2033), catalogue
        )
        assert not names(outcome) & {
            "Alpha Money Market Fund",
            "Bravo Short Term Income Fund",
            "Charlie Income Fund",
            "Delta Low Equity Fund",
        }

    def test_a_higher_risk_profile_never_sees_fewer_funds_than_a_lower_one(self, matcher, catalogue):
        # The property the curated bracket list originally broke. Asserted on
        # the growth path, where the comparison is meaningful.
        moderate = matcher.match(profile("Moderate", purpose="growth", horizon_target_year=2033), catalogue)
        aggressive = matcher.match(profile("Aggressive", purpose="growth", horizon_target_year=2033), catalogue)
        assert names(moderate) <= names(aggressive)


# ═════════════════════════════════════════════════════════════════════════════
# The properties that keep it honest
# ═════════════════════════════════════════════════════════════════════════════

class TestTheCeilingIsAbsolute:
    def test_a_fund_with_no_published_label_never_matches_anyone(self, matcher, catalogue):
        # The single most important behaviour in the feature. A manager who
        # publishes no risk indicator cannot have their fund filtered by one.
        unlabelled = build_candidate("sa_ma_low_equity", "Papa Unlabelled Fund", None, 1.0, False)
        for risk in ("Conservative", "Moderate", "Aggressive"):
            outcome = matcher.match(profile(risk, horizon_target_year=2035), catalogue + [unlabelled])
            assert "Papa Unlabelled Fund" not in names(outcome)

    def test_a_fund_with_no_approved_sheet_never_matches(self, matcher):
        # Nothing to read a label off, so the same rule applies.
        sheetless = build_candidate(
            "sa_ib_money_market", "Quebec Sheetless Fund", 1, 0.25, False, with_snapshot=False
        )
        outcome = matcher.match(profile("Conservative"), [sheetless])
        assert outcome.matches == ()

    def test_no_fund_above_the_ceiling_survives(self, matcher, catalogue):
        for risk, ceiling in (("Conservative", 2), ("Moderate", 3), ("Aggressive", 5)):
            outcome = matcher.match(profile(risk, horizon_target_year=2040), catalogue)
            assert all(m.risk_indicator_1to5 <= ceiling for m in outcome.matches), risk


class TestHorizon:
    def test_a_horizon_caps_the_bracket_but_never_raises_it(self, matcher, catalogue):
        patient = matcher.match(profile("Conservative", horizon_target_year=2040), catalogue)
        assert patient.bracket.effective == "Conservative"

    def test_a_target_year_already_past_reads_as_no_time_left(self, matcher, catalogue):
        outcome = matcher.match(profile("Aggressive", horizon_target_year=2020), catalogue)
        assert outcome.bracket.horizon_years == 0
        assert outcome.bracket.effective == "Conservative"

    def test_the_band_is_derived_from_what_is_left_not_what_was_answered(self, matcher, catalogue):
        # Someone who answered "five years or more" in 2026 has two years left
        # in 2029, and the match has to move with them.
        stale = profile("Aggressive", horizon_target_year=2031, horizon_band_answered="5_plus")
        outcome = FundMatcher(clock=lambda: date(2029, 9, 4)).match(stale, catalogue)
        assert outcome.bracket.horizon_band == "2_to_5"

    def test_a_fund_stating_no_minimum_term_is_kept(self, matcher):
        # Silence is not a claim, and dropping the fund would penalise a manager
        # for publishing less.
        quiet = build_candidate("sa_ib_money_market", "Romeo Quiet Fund", 1, None, False)
        outcome = matcher.match(profile("Conservative", horizon_target_year=2027), [quiet])
        assert names(outcome) == {"Romeo Quiet Fund"}


class TestPurpose:
    def test_income_narrows_to_distributing_categories(self, matcher, catalogue):
        outcome = matcher.match(
            profile("Aggressive", purpose="income", horizon_target_year=2033), catalogue
        )
        assert categories(outcome) <= {
            ASISA.by_code(code).name
            for code in ("sa_ma_income", "sa_ib_short_term", "sa_ib_variable_term", "sa_re_general")
        }

    @pytest.mark.parametrize("purpose", ["growth", "goal"])
    def test_growth_and_a_general_goal_add_no_opinion_of_our_own(self, matcher, catalogue, purpose):
        # The ceiling already bounds these. A second judgement on top would have
        # no published label behind it.
        with_purpose = matcher.match(profile("Moderate", purpose=purpose, horizon_target_year=2033), catalogue)
        without = matcher.match(profile("Moderate", horizon_target_year=2033), catalogue)
        assert names(with_purpose) == names(without)


class TestEligibility:
    def test_a_tax_free_account_excludes_funds_that_cannot_be_held_in_one(self, matcher):
        eligible = build_candidate("sa_ma_income", "Sierra TFSA Fund", 2, 1.0, False, tfsa=True)
        not_eligible = build_candidate("sa_ma_income", "Tango Plain Fund", 2, 1.0, False, tfsa=False)
        outcome = matcher.match(
            profile("Conservative", account_type="tfsa", horizon_target_year=2031),
            [eligible, not_eligible],
        )
        assert names(outcome) == {"Sierra TFSA Fund"}
        assert RULE_ELIGIBILITY in outcome.rules_applied

    def test_a_monthly_contribution_is_a_no_op_where_the_platform_has_no_minimum(self, matcher):
        # The hook exists so a future platform with a real minimum needs a value
        # rather than a new rule; today it must change nothing.
        steep = build_candidate("sa_ma_income", "Uniform Fund", 2, 1.0, False, min_debit_order=100000)
        outcome = matcher.match(
            profile("Conservative", contribution_style="monthly", horizon_target_year=2031), [steep]
        )
        assert names(outcome) == {"Uniform Fund"}


class TestMissingAnswers:
    def test_no_goals_degrades_one_axis_not_the_whole_match(self, matcher, catalogue):
        outcome = matcher.match(profile("Conservative"), catalogue)
        assert names(outcome) == {
            "Alpha Money Market Fund",
            "Bravo Short Term Income Fund",
            "Charlie Income Fund",
            "Delta Low Equity Fund",
        }
        assert outcome.fallback_risk_only is True
        assert RULE_SKIPPED_NO_GOALS in outcome.rules_applied
        assert RULE_HORIZON not in outcome.rules_applied

    def test_a_partial_profile_uses_the_answers_it_has(self, matcher, catalogue):
        outcome = matcher.match(profile("Moderate", purpose="emergency_fund"), catalogue)
        assert names(outcome) == {"Alpha Money Market Fund", "Bravo Short Term Income Fund"}
        assert outcome.fallback_risk_only is False
        assert RULE_HORIZON not in outcome.rules_applied

    def test_an_unrecognised_risk_label_falls_back_to_the_middle(self, matcher, catalogue):
        outcome = matcher.match(profile("Balanced-ish", horizon_target_year=2033), catalogue)
        assert outcome.bracket.ceiling == 3


class TestTrackerRestriction:
    def test_a_moderate_bracket_sees_broad_equity_only_as_a_tracker(self, matcher, catalogue):
        # Both funds sit in the same category with the same published risk label.
        # One tracks the market, the other picks stocks.
        relaxed = [
            build_candidate("sa_eq_general", "Hotel Top 40 Index ETF", 3, 1.0, True),
            build_candidate("sa_eq_general", "India Equity Alpha Fund", 3, 1.0, False),
        ]
        outcome = matcher.match(profile("Moderate", horizon_target_year=2033), relaxed)
        assert names(outcome) == {"Hotel Top 40 Index ETF"}

    def test_the_top_bracket_sees_both(self, matcher):
        relaxed = [
            build_candidate("sa_eq_general", "Hotel Top 40 Index ETF", 4, 1.0, True),
            build_candidate("sa_eq_general", "India Equity Alpha Fund", 4, 1.0, False),
        ]
        outcome = matcher.match(profile("Aggressive", horizon_target_year=2033), relaxed)
        assert names(outcome) == {"Hotel Top 40 Index ETF", "India Equity Alpha Fund"}


class TestOrdering:
    def test_the_default_order_is_alphabetical(self, matcher, catalogue):
        outcome = matcher.match(profile("Aggressive", horizon_target_year=2033), catalogue)
        rendered = [m.name for m in outcome.matches]
        assert rendered == sorted(rendered, key=str.casefold)

    def test_cost_order_puts_the_cheapest_first(self, matcher):
        funds = [
            build_candidate("sa_ma_income", "Expensive Fund", 2, 1.0, False, tic=2.5),
            build_candidate("sa_ma_income", "Cheap Fund", 2, 1.0, False, tic=0.4),
        ]
        outcome = matcher.match(
            profile("Conservative", horizon_target_year=2031), funds, order_by=ORDER_BY_COST
        )
        assert [m.name for m in outcome.matches] == ["Cheap Fund", "Expensive Fund"]

    def test_a_fund_with_no_published_charge_orders_last(self, matcher):
        # Absent is not cheap. Sorting a missing fee to the front would present
        # the least disclosed fund as the most attractive.
        funds = [
            build_candidate("sa_ma_income", "Undisclosed Fund", 2, 1.0, False, tic=None),
            build_candidate("sa_ma_income", "Disclosed Fund", 2, 1.0, False, tic=1.8),
        ]
        outcome = matcher.match(
            profile("Conservative", horizon_target_year=2031), funds, order_by=ORDER_BY_COST
        )
        assert [m.name for m in outcome.matches] == ["Disclosed Fund", "Undisclosed Fund"]

    def test_nothing_is_ever_ordered_by_performance(self, matcher, catalogue):
        # There is no code path that reads a return to decide position, and the
        # page says so. This asserts the absence.
        assert ORDER_BY_NAME == "name" and ORDER_BY_COST == "tic"
        outcome = matcher.match(profile("Aggressive", horizon_target_year=2033), catalogue)
        assert all("performance" not in m.rules_applied for m in outcome.matches)


class TestTheOutcome:
    def test_an_empty_result_still_reports_the_bracket(self, matcher):
        # "Your profile covers these categories and our catalogue has nothing in
        # them" is a different statement from "no matches", and only the first
        # is honest about whose limitation it is.
        outcome = matcher.match(profile("Conservative", horizon_target_year=2031), [])
        assert outcome.matches == ()
        assert outcome.bracket is not None
        assert outcome.bracket.categories == tuple(sorted(BRACKET_CATEGORIES["Conservative"]))

    def test_every_match_carries_the_rules_that_produced_it(self, matcher, catalogue):
        outcome = matcher.match(
            profile("Conservative", purpose="growth", horizon_target_year=2031, account_type="tfsa"),
            catalogue,
        )
        assert outcome.matches
        for match in outcome.matches:
            assert RULE_RISK_CEILING in match.rules_applied
            assert RULE_CATEGORY in match.rules_applied

    def test_a_match_carries_the_facts_the_explanation_needs(self, matcher, catalogue):
        outcome = matcher.match(profile("Conservative", horizon_target_year=2031), catalogue)
        match = outcome.matches[0]
        assert match.manco and match.asisa_category and match.as_of
        assert match.risk_indicator_1to5 >= 1
        assert match.isin and match.fund_id

    def test_matching_is_deterministic(self, matcher, catalogue):
        user = profile("Moderate", purpose="goal", horizon_target_year=2029)
        first = matcher.match(user, catalogue)
        second = matcher.match(user, catalogue)
        assert [m.name for m in first.matches] == [m.name for m in second.matches]
        assert first.rules_applied == second.rules_applied


class TestTheChainItself:
    def test_the_default_chain_is_the_five_rules_in_order(self):
        assert [type(rule).__name__ for rule in DEFAULT_RULES] == [
            "RiskCeilingRule",
            "CategoryRule",
            "HorizonRule",
            "PurposeRule",
            "EligibilityFilters",
        ]

    def test_every_rule_shares_one_interface(self):
        for rule in DEFAULT_RULES:
            assert isinstance(rule, MatchRule)
            assert rule.name

    def test_a_rule_can_be_added_without_touching_the_matcher(self):
        # The reason the chain is a chain. A new policy is a new class.
        class NoTrackersRule(MatchRule):
            name = "no_trackers"

            def apply(self, state):
                kept = tuple(c for c in state.candidates if not c.is_index_tracker)
                return state.with_rule(self.name, candidates=kept)

        rules = (RiskCeilingRule(), CategoryRule(), HorizonRule(), PurposeRule(), NoTrackersRule())
        outcome = FundMatcher(rules=rules, clock=lambda: TODAY).match(
            profile("Aggressive", horizon_target_year=2033),
            [build_candidate(*spec) for spec in CATALOGUE_SPEC],
        )
        assert "no_trackers" in outcome.rules_applied
        assert "Hotel Top 40 Index ETF" not in names(outcome)

    def test_rules_do_not_mutate_the_candidates_they_are_given(self, matcher, catalogue):
        before = [dict(c.fund) for c in catalogue]
        matcher.match(profile("Moderate", purpose="income", horizon_target_year=2029), catalogue)
        assert [dict(c.fund) for c in catalogue] == before

    def test_a_rule_name_appears_once_however_often_it_runs(self, matcher, catalogue):
        outcome = matcher.match(
            profile("Aggressive", purpose="emergency_fund", horizon_target_year=2027), catalogue
        )
        assert len(outcome.rules_applied) == len(set(outcome.rules_applied))
