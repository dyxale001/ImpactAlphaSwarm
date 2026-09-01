"""Unit tests for the exploratory asset-discovery agent (src/agents/asset_discovery.py).

These are characterization tests: they were written against the module as it stood
BEFORE it was restructured into classes, so they describe what discovery already
does rather than what it ought to do. That is the point — they are the evidence
that the restructuring changed nothing.

The pure half of the funnel is what is pinned here: the seasoning/size/exchange
gates, the industry map, the score blend, hysteresis, and the LLM-reply parsers.
The network calls (StockTwits, Finnhub, Groq, yfinance) are deliberately not
exercised; they are thin and live behind their own seams.

Two behaviours are easy to break and matter more than they look:

  * a universe that failed to survey must not be treated as a universe with
    nothing in it — decay and retirement are the half that rests on NOT having
    seen a ticker, and running them on a failed gap fill took DUK out of Green
    Energy once already;
  * the entrant cap is per night, and the names that miss the cut must be
    deferred rather than dropped, or the pool can never refill.

Thresholds are pinned to their documented defaults in conftest.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import pytest  # noqa: E402

from src.agents import asset_discovery as ad  # noqa: E402
from src.agents.asset_discovery import (  # noqa: E402
    Candidate,
    _exchange_ok,
    _extract_json,
    _ipo_age_days,
    _parse_json_object,
    _parse_ticker_array,
    _still_quarantined,
    apply_hysteresis,
    classify_by_industry,
    discovery_score,
    profile_gate,
)

TODAY = date(2026, 9, 1)
NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def a_profile(**kw):
    """A profile that passes every gate unless a field is overridden."""
    base = {
        "name": "Example Corp",
        "finnhubIndustry": "Semiconductors",
        "marketCapitalization": 5000,          # Finnhub reports MILLIONS → $5B
        "ipo": "2015-01-01",
        "exchange": "NASDAQ NMS - GLOBAL MARKET",
    }
    base.update(kw)
    return base


def a_candidate(ticker="AAA", **kw):
    return Candidate(ticker=ticker, **kw)


def incumbent(ticker, score=1.0, **kw):
    row = {"ticker": ticker, "discovery_score": score, "is_active": True}
    row.update(kw)
    return row


# ═════════════════════════════════════════════════════════════════════════════
# IPO age
# ═════════════════════════════════════════════════════════════════════════════

class TestIpoAge:
    def test_a_full_iso_date_is_measured_in_days(self):
        assert _ipo_age_days("2026-08-02", TODAY) == 30

    def test_a_timestamp_is_truncated_to_its_date(self):
        assert _ipo_age_days("2026-08-02T09:30:00Z", TODAY) == 30

    def test_a_missing_date_is_unknown_rather_than_zero(self):
        # None and 0 must stay distinguishable: 0 would read as "listed today".
        assert _ipo_age_days(None, TODAY) is None
        assert _ipo_age_days("", TODAY) is None

    def test_an_unparseable_date_is_unknown_rather_than_raising(self):
        assert _ipo_age_days("not-a-date", TODAY) is None
        assert _ipo_age_days("2026-13-45", TODAY) is None

    def test_a_future_listing_gives_a_negative_age(self):
        assert _ipo_age_days("2026-10-01", TODAY) == -30


# ═════════════════════════════════════════════════════════════════════════════
# Exchange
# ═════════════════════════════════════════════════════════════════════════════

class TestExchangeGate:
    @pytest.mark.parametrize("exchange", [
        "NASDAQ NMS - GLOBAL MARKET",
        "NEW YORK STOCK EXCHANGE, INC.",
        "NYSE ARCA",
        "nasdaq capital market",
    ])
    def test_us_primary_listings_are_accepted(self, exchange):
        assert _exchange_ok(exchange) is True

    @pytest.mark.parametrize("exchange", [
        "LONDON STOCK EXCHANGE", "TORONTO", "OTC MARKETS", "", None,
    ])
    def test_everything_else_is_rejected(self, exchange):
        assert _exchange_ok(exchange) is False

    def test_the_match_is_case_insensitive(self):
        assert _exchange_ok("nyse american") is True


# ═════════════════════════════════════════════════════════════════════════════
# The profile gate
# ═════════════════════════════════════════════════════════════════════════════

class TestProfileGate:
    def test_a_good_profile_passes(self):
        assert profile_gate(a_candidate(), a_profile(), TODAY) is None

    def test_passing_caches_the_facts_onto_the_candidate(self):
        cand = a_candidate()
        profile_gate(cand, a_profile(), TODAY)
        assert cand.name == "Example Corp"
        assert cand.industry == "Semiconductors"
        assert cand.market_cap_usd == 5000 * 1e6
        assert cand.ipo_date == "2015-01-01"

    def test_market_cap_is_converted_from_millions(self):
        # Finnhub reports millions; the threshold is in dollars. Getting this wrong
        # by 1e6 would admit every micro-cap on the exchange.
        cand = a_candidate()
        profile_gate(cand, a_profile(marketCapitalization=2500), TODAY)
        assert cand.market_cap_usd == 2.5e9

    def test_a_young_listing_is_rejected_with_its_age(self):
        recent = (TODAY - timedelta(days=90)).isoformat()
        reason = profile_gate(a_candidate(), a_profile(ipo=recent), TODAY)
        assert reason == "too_new(90d)"

    def test_the_seasoning_threshold_is_exact(self):
        at = (TODAY - timedelta(days=180)).isoformat()
        just_under = (TODAY - timedelta(days=179)).isoformat()
        assert profile_gate(a_candidate(), a_profile(ipo=at), TODAY) is None
        assert profile_gate(a_candidate(), a_profile(ipo=just_under), TODAY).startswith("too_new")

    def test_a_missing_ipo_date_is_rejected_rather_than_assumed_seasoned(self):
        assert profile_gate(a_candidate(), a_profile(ipo=None), TODAY) == "no_ipo_date"

    def test_a_small_company_is_rejected(self):
        reason = profile_gate(a_candidate(), a_profile(marketCapitalization=500), TODAY)
        assert reason.startswith("below_market_cap")

    def test_the_market_cap_threshold_is_exact(self):
        assert profile_gate(a_candidate(), a_profile(marketCapitalization=2000), TODAY) is None
        assert profile_gate(
            a_candidate(), a_profile(marketCapitalization=1999), TODAY
        ).startswith("below_market_cap")

    def test_a_missing_market_cap_is_rejected(self):
        reason = profile_gate(a_candidate(), a_profile(marketCapitalization=None), TODAY)
        assert reason.startswith("below_market_cap")

    def test_a_foreign_listing_is_rejected_with_its_exchange(self):
        reason = profile_gate(a_candidate(), a_profile(exchange="LONDON STOCK EXCHANGE"), TODAY)
        assert reason == "wrong_exchange(LONDON STOCK EXCHANGE)"

    def test_seasoning_is_checked_before_size(self):
        # Both fail; the reported reason pins the order the funnel applies them.
        reason = profile_gate(
            a_candidate(),
            a_profile(ipo=(TODAY - timedelta(days=10)).isoformat(), marketCapitalization=1),
            TODAY,
        )
        assert reason.startswith("too_new")

    def test_a_nameless_profile_falls_back_to_the_ticker(self):
        cand = a_candidate("ZZZ")
        profile_gate(cand, a_profile(name=None), TODAY)
        assert cand.name == "ZZZ"


# ═════════════════════════════════════════════════════════════════════════════
# Industry classification
# ═════════════════════════════════════════════════════════════════════════════

class TestClassifyByIndustry:
    @pytest.mark.parametrize("industry,universe", [
        ("Semiconductors", "Technology"),
        ("Software", "Technology"),
        ("Biotechnology", "Healthcare"),
        ("Pharmaceuticals", "Healthcare"),
        ("Banking", "Finance"),
        ("Insurance", "Finance"),
        ("Renewable Energy", "Green Energy"),
        ("Solar", "Green Energy"),
    ])
    def test_known_industries_map_to_their_universe(self, industry, universe):
        assert classify_by_industry(industry) == universe

    def test_the_match_is_case_insensitive_and_on_substrings(self):
        assert classify_by_industry("SEMICONDUCTOR EQUIPMENT") == "Technology"

    def test_an_unmapped_industry_defers_to_the_llm(self):
        # None means "hand this to the classifier", not "no universe".
        assert classify_by_industry("Aerospace") is None
        assert classify_by_industry("Restaurants") is None

    def test_a_missing_industry_defers_to_the_llm(self):
        assert classify_by_industry(None) is None
        assert classify_by_industry("") is None

    def test_green_energy_wins_over_technology_when_both_could_match(self):
        # First match in INDUSTRY_KEYWORDS wins, and Green Energy is listed first
        # precisely so "solar technology" is not swallowed by Technology.
        assert classify_by_industry("Solar Technology") == "Green Energy"


# ═════════════════════════════════════════════════════════════════════════════
# The discovery score
# ═════════════════════════════════════════════════════════════════════════════

class TestDiscoveryScore:
    def test_a_candidate_with_nothing_scores_zero(self):
        assert discovery_score(a_candidate(), max_watchlist=0) == 0.0

    def test_the_three_components_are_blended_at_their_weights(self):
        cand = a_candidate(watchlist_count=100, news_count=10, dollar_volume=5e8)
        # every component saturated → 0.5 + 0.3 + 0.2
        assert discovery_score(cand, max_watchlist=100) == pytest.approx(1.0)

    def test_trending_is_relative_to_the_busiest_name_tonight(self):
        cand = a_candidate(watchlist_count=50)
        assert discovery_score(cand, max_watchlist=100) == pytest.approx(0.25)  # 0.5 * 0.5

    def test_a_zero_max_watchlist_does_not_divide_by_zero(self):
        cand = a_candidate(watchlist_count=10)
        assert discovery_score(cand, max_watchlist=0) == 0.0

    def test_news_saturates_at_the_cap(self):
        ten = discovery_score(a_candidate(news_count=10), max_watchlist=0)
        fifty = discovery_score(a_candidate(news_count=50), max_watchlist=0)
        assert ten == fifty == pytest.approx(0.3)

    def test_liquidity_saturates_at_the_cap(self):
        at = discovery_score(a_candidate(dollar_volume=5e8), max_watchlist=0)
        over = discovery_score(a_candidate(dollar_volume=5e10), max_watchlist=0)
        assert at == over == pytest.approx(0.2)

    def test_a_missing_dollar_volume_contributes_nothing_rather_than_raising(self):
        assert discovery_score(a_candidate(dollar_volume=None), max_watchlist=0) == 0.0

    def test_the_score_is_rounded_for_stable_persistence(self):
        cand = a_candidate(watchlist_count=1, news_count=3, dollar_volume=1.234e7)
        assert discovery_score(cand, max_watchlist=7) == round(
            discovery_score(cand, max_watchlist=7), 6
        )


# ═════════════════════════════════════════════════════════════════════════════
# Quarantine
# ═════════════════════════════════════════════════════════════════════════════

class TestStillQuarantined:
    def test_no_quarantine_is_not_quarantined(self):
        assert _still_quarantined(None, NOW) is False
        assert _still_quarantined("", NOW) is False

    def test_a_future_expiry_is_still_quarantined(self):
        assert _still_quarantined("2026-12-01T00:00:00Z", NOW) is True

    def test_a_past_expiry_has_lapsed(self):
        assert _still_quarantined("2026-01-01T00:00:00Z", NOW) is False

    def test_a_naive_timestamp_is_read_as_utc(self):
        assert _still_quarantined("2026-12-01T00:00:00", NOW) is True

    def test_an_unparseable_timestamp_does_not_bench_the_asset(self):
        # Failing open matters: a bad value must not silently freeze a ticker.
        assert _still_quarantined("garbage", NOW) is False


# ═════════════════════════════════════════════════════════════════════════════
# Hysteresis
# ═════════════════════════════════════════════════════════════════════════════

class TestHysteresis:
    def test_an_incumbent_seen_again_is_refreshed(self):
        plan = apply_hysteresis([incumbent("AAA")], {"AAA": 0.9}, NOW)
        assert plan.refreshed == ["AAA"]
        assert plan.score_updates == {}
        assert plan.retired == []

    def test_a_quiet_incumbent_decays(self):
        plan = apply_hysteresis([incumbent("AAA", score=1.0)], {}, NOW)
        assert plan.score_updates == {"AAA": pytest.approx(0.7)}
        assert plan.retired == []

    def test_a_decayed_incumbent_below_the_floor_retires(self):
        plan = apply_hysteresis([incumbent("AAA", score=0.1)], {}, NOW)
        assert plan.retired == ["AAA"]
        assert plan.score_updates == {}

    def test_the_retirement_threshold_is_exact(self):
        # 0.15 * 0.7 = 0.105, still above the 0.1 floor.
        assert apply_hysteresis([incumbent("AAA", score=0.15)], {}, NOW).retired == []
        # 0.14 * 0.7 = 0.098, below it.
        assert apply_hysteresis([incumbent("AAA", score=0.14)], {}, NOW).retired == ["AAA"]

    def test_a_quarantined_incumbent_is_left_alone(self):
        rows = [incumbent("AAA", score=1.0, quarantined_until="2026-12-01T00:00:00Z")]
        plan = apply_hysteresis(rows, {}, NOW)
        assert plan.score_updates == {} and plan.retired == []

    def test_an_inactive_incumbent_is_left_alone(self):
        plan = apply_hysteresis([incumbent("AAA", score=1.0, is_active=False)], {}, NOW)
        assert plan.score_updates == {} and plan.retired == []

    def test_a_row_without_a_ticker_is_skipped(self):
        plan = apply_hysteresis([{"discovery_score": 1.0}], {}, NOW)
        assert plan.refreshed == [] and plan.score_updates == {}

    def test_new_names_enter_up_to_the_nightly_cap(self):
        fresh = {"T%d" % i: 0.9 - i * 0.01 for i in range(8)}
        plan = apply_hysteresis([], fresh, NOW)
        assert len(plan.new_entrants) == 5
        assert len(plan.deferred) == 3

    def test_entrants_are_chosen_by_score_not_arrival(self):
        fresh = {"LOW": 0.1, "HIGH": 0.9, "MID": 0.5}
        plan = apply_hysteresis([], fresh, NOW)
        assert plan.new_entrants[:3] == ["HIGH", "MID", "LOW"]

    def test_ties_break_on_ticker_so_the_pass_is_reproducible(self):
        plan = apply_hysteresis([], {"BBB": 0.5, "AAA": 0.5, "CCC": 0.5}, NOW)
        assert plan.new_entrants == ["AAA", "BBB", "CCC"]

    def test_names_over_the_cap_are_deferred_not_discarded(self):
        # Deferred names may enter a later night; dropping them would stop the pool
        # refilling after a churn.
        fresh = {"T%d" % i: 1.0 - i * 0.01 for i in range(7)}
        plan = apply_hysteresis([], fresh, NOW)
        assert set(plan.new_entrants) | set(plan.deferred) == set(fresh)

    def test_an_incumbent_is_never_counted_as_a_new_entrant(self):
        plan = apply_hysteresis([incumbent("AAA")], {"AAA": 0.9, "BBB": 0.8}, NOW)
        assert plan.new_entrants == ["BBB"]
        assert plan.refreshed == ["AAA"]

    def test_an_empty_universe_produces_an_empty_plan(self):
        plan = apply_hysteresis([], {}, NOW)
        assert plan.new_entrants == [] and plan.refreshed == []
        assert plan.score_updates == {} and plan.retired == [] and plan.deferred == []


# ═════════════════════════════════════════════════════════════════════════════
# LLM reply parsing
# ═════════════════════════════════════════════════════════════════════════════

class TestExtractJson:
    def test_a_bare_array_is_returned_as_is(self):
        assert _extract_json('["AAA","BBB"]') == '["AAA","BBB"]'

    def test_an_array_is_pulled_out_of_surrounding_prose(self):
        assert _extract_json('Sure! Here you go: ["AAA"] Hope that helps.') == '["AAA"]'

    def test_an_object_is_pulled_out_of_a_fenced_block(self):
        raw = '```json\n{"AAA": "Technology"}\n```'
        assert _extract_json(raw) == '{"AAA": "Technology"}'

    def test_an_array_is_preferred_when_both_appear(self):
        assert _extract_json('[{"a":1}]').startswith("[")

    def test_an_empty_reply_yields_nothing(self):
        assert _extract_json("") == ""
        assert _extract_json("no json here") == ""


class TestParseTickerArray:
    def test_a_clean_array_parses(self):
        assert _parse_ticker_array('["aaa","bbb"]') == ["AAA", "BBB"]

    def test_tickers_are_upper_cased_and_trimmed(self):
        assert _parse_ticker_array('[" aaa ", "bBb"]') == ["AAA", "BBB"]

    def test_non_strings_are_dropped_rather_than_coerced(self):
        assert _parse_ticker_array('["AAA", 42, null, "BBB"]') == ["AAA", "BBB"]

    def test_blank_entries_are_dropped(self):
        assert _parse_ticker_array('["AAA", "", "  "]') == ["AAA"]

    def test_malformed_json_yields_an_empty_list(self):
        assert _parse_ticker_array("{not json") == []
        assert _parse_ticker_array("") == []

    def test_an_object_reply_is_not_treated_as_a_list(self):
        assert _parse_ticker_array('{"AAA": "Technology"}') == []


class TestParseJsonObject:
    def test_a_clean_object_parses(self):
        assert _parse_json_object('{"AAA":"Technology"}') == {"AAA": "Technology"}

    def test_malformed_json_yields_an_empty_dict(self):
        assert _parse_json_object("{oops") == {}
        assert _parse_json_object("") == {}

    def test_an_array_reply_is_not_treated_as_an_object(self):
        assert _parse_json_object('["AAA"]') == {}


# ═════════════════════════════════════════════════════════════════════════════
# Module wiring
# ═════════════════════════════════════════════════════════════════════════════

class TestUniverses:
    def test_the_universe_labels_are_the_five_the_product_ships(self):
        # These must match the seed labels and onboardingData.ts exactly, or a
        # classified candidate lands in a universe nothing reads.
        assert ad.UNIVERSES == [
            "Technology", "Green Energy", "Finance", "AI & Robotics", "Healthcare",
        ]

    def test_every_industry_keyword_maps_to_a_real_universe(self):
        for universe, _keywords in ad.INDUSTRY_KEYWORDS:
            assert universe in ad.UNIVERSES
