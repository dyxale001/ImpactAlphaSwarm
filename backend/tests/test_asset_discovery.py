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


# ═════════════════════════════════════════════════════════════════════════════
# The funnel, the chain and the pool
# ═════════════════════════════════════════════════════════════════════════════
# These exercise the orchestration that used to be unreachable from a test: every
# stage reached the network directly, so there was no seam to stand in front of.
# Each stage now names a collaborator, which is what lets these run offline.

from src.agents.asset_discovery import (  # noqa: E402
    CandidatePool,
    CandidateSource,
    ClassificationChain,
    Classifier,
    DiscoveryRun,
    Gate,
    IndustryClassifier,
    LiquidityGate,
    ProfileGate,
    ResearchabilityGate,
    SourceFactory,
    SymbolDirectoryGate,
    ValidationFunnel,
)


class FakeFinnhub:
    """Stands in for FinnhubClient with canned answers."""

    def __init__(self, directory=None, profiles=None, news=None):
        self._directory = directory if directory is not None else set()
        self._profiles = profiles or {}
        self._news = news or {}
        self.profile_calls = []

    def us_common_stock_set(self):
        return self._directory

    def profile(self, ticker):
        self.profile_calls.append(ticker)
        return self._profiles.get(ticker, a_profile())

    def trusted_news_count(self, ticker, now=None):
        return self._news.get(ticker, 5)


class FakeLiquidity:
    def __init__(self, volumes=None):
        self._volumes = volumes or {}

    def avg_dollar_volume(self, ticker):
        return self._volumes.get(ticker, 5e8)


def a_funnel(finnhub=None, liquidity=None):
    finnhub = finnhub or FakeFinnhub()
    return ValidationFunnel(
        gates=[
            SymbolDirectoryGate(),
            ProfileGate(finnhub),
            LiquidityGate(liquidity or FakeLiquidity()),
            ResearchabilityGate(finnhub),
        ],
        finnhub=finnhub,
    )


class TestValidationFunnel:
    def test_a_clean_candidate_survives_every_gate(self):
        survivors, rejections = a_funnel().run({"AAA": a_candidate("AAA")}, NOW)
        assert [c.ticker for c in survivors] == ["AAA"]
        assert rejections == []

    def test_a_ticker_outside_the_directory_is_rejected_at_the_first_gate(self):
        finnhub = FakeFinnhub(directory={"BBB"})
        survivors, rejections = a_funnel(finnhub).run({"AAA": a_candidate("AAA")}, NOW)
        assert survivors == []
        assert rejections == [
            {"ticker": "AAA", "stage": "symbol_directory", "reason": "not_us_common_stock"}
        ]

    def test_an_empty_directory_stands_the_gate_down_rather_than_failing_everything(self):
        # An empty set means the directory fetch failed, not that nothing is listed.
        survivors, _ = a_funnel(FakeFinnhub(directory=set())).run({"AAA": a_candidate("AAA")}, NOW)
        assert len(survivors) == 1

    def test_the_first_gate_to_object_stops_the_candidate(self):
        finnhub = FakeFinnhub(directory={"AAA"}, profiles={"AAA": a_profile(ipo="2026-08-01")})
        _survivors, rejections = a_funnel(finnhub).run({"AAA": a_candidate("AAA")}, NOW)
        assert [r["stage"] for r in rejections] == ["profile"]

    def test_a_rejected_candidate_costs_nothing_downstream(self):
        # Rejected at the directory, so its profile is never fetched.
        finnhub = FakeFinnhub(directory={"BBB"})
        a_funnel(finnhub).run({"AAA": a_candidate("AAA")}, NOW)
        assert finnhub.profile_calls == []

    def test_an_illiquid_candidate_is_rejected(self):
        liquidity = FakeLiquidity({"AAA": 1e6})
        _survivors, rejections = a_funnel(liquidity=liquidity).run({"AAA": a_candidate("AAA")}, NOW)
        assert rejections[0]["stage"] == "liquidity"
        assert rejections[0]["reason"].startswith("illiquid")

    def test_an_unmeasurable_volume_fails_open(self):
        # A data hiccup must not drop a validated large cap.
        liquidity = FakeLiquidity({"AAA": None})
        survivors, rejections = a_funnel(liquidity=liquidity).run({"AAA": a_candidate("AAA")}, NOW)
        assert len(survivors) == 1 and rejections == []

    def test_an_uncovered_candidate_is_rejected(self):
        finnhub = FakeFinnhub(news={"AAA": 0})
        _survivors, rejections = a_funnel(finnhub).run({"AAA": a_candidate("AAA")}, NOW)
        assert rejections[0] == {
            "ticker": "AAA", "stage": "researchability", "reason": "no_trusted_news"
        }

    def test_surviving_candidates_carry_the_facts_the_gates_fetched(self):
        finnhub = FakeFinnhub(news={"AAA": 4})
        liquidity = FakeLiquidity({"AAA": 2.5e8})
        survivors, _ = a_funnel(finnhub, liquidity).run({"AAA": a_candidate("AAA")}, NOW)
        cand = survivors[0]
        assert cand.name == "Example Corp"
        assert cand.industry == "Semiconductors"
        assert cand.dollar_volume == 2.5e8
        assert cand.news_count == 4

    def test_candidates_are_processed_in_ticker_order(self):
        finnhub = FakeFinnhub()
        candidates = {t: a_candidate(t) for t in ("CCC", "AAA", "BBB")}
        a_funnel(finnhub).run(candidates, NOW)
        assert finnhub.profile_calls == ["AAA", "BBB", "CCC"]

    def test_an_extra_gate_needs_no_change_to_the_funnel(self):
        class AlwaysRejects(Gate):
            stage = "custom"

            def check(self, candidate, ctx):
                return "nope"

        funnel = ValidationFunnel(gates=[AlwaysRejects()], finnhub=FakeFinnhub())
        survivors, rejections = funnel.run({"AAA": a_candidate("AAA")}, NOW)
        assert survivors == []
        assert rejections[0]["stage"] == "custom"


class TestClassificationChain:
    def test_the_static_map_places_what_it_can(self):
        cands = [a_candidate("AAA", industry="Software")]
        ClassificationChain(classifiers=[IndustryClassifier()]).apply(cands)
        assert cands[0].universe == "Technology"

    def test_what_the_map_cannot_place_falls_through_to_the_next_classifier(self):
        class FakeLlm(Classifier):
            def classify(self, candidates):
                return {c.ticker: "AI & Robotics" for c in candidates}

        cands = [a_candidate("AAA", industry="Software"), a_candidate("BBB", industry="Aerospace")]
        ClassificationChain(classifiers=[IndustryClassifier(), FakeLlm()]).apply(cands)
        assert cands[0].universe == "Technology"     # placed by the map
        assert cands[1].universe == "AI & Robotics"  # placed by the fallback

    def test_the_expensive_classifier_only_sees_the_residue(self):
        seen = []

        class RecordingLlm(Classifier):
            def classify(self, candidates):
                seen.extend(c.ticker for c in candidates)
                return {}

        cands = [a_candidate("AAA", industry="Software"), a_candidate("BBB", industry="Aerospace")]
        ClassificationChain(classifiers=[IndustryClassifier(), RecordingLlm()]).apply(cands)
        assert seen == ["BBB"]

    def test_a_candidate_nothing_can_place_is_left_unset(self):
        cands = [a_candidate("AAA", industry="Aerospace")]
        ClassificationChain(classifiers=[IndustryClassifier()]).apply(cands)
        assert cands[0].universe is None


class TestCandidatePool:
    def test_the_same_ticker_from_two_sources_is_one_candidate(self):
        pool = CandidatePool()
        pool.add("AAA", "stocktwits_trending", 100)
        pool.add("AAA", "llm")
        assert list(pool.candidates) == ["AAA"]
        assert pool.candidates["AAA"].sources == ["stocktwits_trending", "llm"]

    def test_a_repeated_source_is_recorded_once(self):
        pool = CandidatePool()
        pool.add("AAA", "llm")
        pool.add("AAA", "llm")
        assert pool.candidates["AAA"].sources == ["llm"]

    def test_the_highest_watchlist_count_wins(self):
        pool = CandidatePool()
        pool.add("AAA", "stocktwits_trending", 50)
        pool.add("AAA", "stocktwits_trending", 120)
        pool.add("AAA", "stocktwits_trending", 10)
        assert pool.candidates["AAA"].watchlist_count == 120

    def test_an_unsurveyed_universe_is_recorded(self):
        pool = CandidatePool()
        pool.mark_unsurveyed("Green Energy")
        assert pool.unsurveyed == {"Green Energy"}


class TestGathering:
    def test_every_source_contributes_to_one_pool(self):
        class FakeSource(CandidateSource):
            def __init__(self, name, tickers):
                self.name = name
                self.tickers = tickers

            def contribute(self, pool):
                for t in self.tickers:
                    pool.add(t, self.name)

        run = DiscoveryRun(sources=[FakeSource("a", ["AAA"]), FakeSource("b", ["BBB", "AAA"])])
        pool = run.gather()
        assert set(pool.candidates) == {"AAA", "BBB"}
        assert pool.candidates["AAA"].sources == ["a", "b"]

    def test_the_factory_always_includes_trending(self):
        names = [s.name for s in SourceFactory.from_config()]
        assert "stocktwits_trending" in names

    def test_the_factory_respects_the_gap_fill_switch(self, monkeypatch):
        monkeypatch.setattr(ad, "DISCOVERY_LLM_FILLER", False)
        assert [s.name for s in SourceFactory.from_config()] == ["stocktwits_trending"]
        monkeypatch.setattr(ad, "DISCOVERY_LLM_FILLER", True)
        assert "llm" in [s.name for s in SourceFactory.from_config()]


class TestGroupByUniverse:
    def test_candidates_are_grouped_under_their_universe(self):
        cands = [a_candidate("AAA", universe="Technology"), a_candidate("BBB", universe="Finance")]
        grouped = DiscoveryRun(sources=[]).group_by_universe(cands, [])
        assert [c.ticker for c in grouped["Technology"]] == ["AAA"]
        assert [c.ticker for c in grouped["Finance"]] == ["BBB"]

    def test_an_unclassified_candidate_is_rejected_rather_than_dropped_silently(self):
        rejections = []
        DiscoveryRun(sources=[]).group_by_universe([a_candidate("AAA", universe=None)], rejections)
        assert rejections == [
            {"ticker": "AAA", "stage": "classification", "reason": "no_universe"}
        ]

    def test_every_universe_is_present_even_when_empty(self):
        grouped = DiscoveryRun(sources=[]).group_by_universe([], [])
        assert set(grouped) == set(ad.UNIVERSES)
