"""Unit tests for the analysis pipeline's scoping and phase wiring
(src/orchestration/langgraph_orchestrator.py).

Two things are pinned here.

**Scoping.** `TickerScoper` decides which tickers a run looks at, and it is the
one part of the orchestrator that is pure given its input rows. The rules that
matter are easy to break silently: the watchlist is never dropped by the cap,
universes are represented round-robin rather than one universe filling the whole
budget, seeds stay eligible while retired and quarantined discoveries do not, and
ordering is deterministic so two runs over the same pool agree.

**Phase wiring.** The phases are objects now, so the graph can be built from them
and each one can be run against a hand-made state. What is asserted is the
contract every phase shares — return only the keys you changed — plus the
deliberate decision that the two gathering phases swallow their own failures,
because they run in parallel and one empty result is a degraded run rather than a
failed one.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import pytest  # noqa: E402

from src.orchestration import langgraph_orchestrator as lo  # noqa: E402
from src.orchestration.langgraph_orchestrator import (  # noqa: E402
    InitializePhase,
    OutputPhase,
    Phase,
    QuantPhase,
    SentimentPhase,
    SynthesizePhase,
    TickerScoper,
)

NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def seed(ticker, universe="Technology", **kw):
    row = {"ticker": ticker, "universe": universe, "origin": "seed", "is_active": True}
    row.update(kw)
    return row


def discovered(ticker, universe="Technology", score=0.5, **kw):
    row = {
        "ticker": ticker,
        "universe": universe,
        "origin": "discovered",
        "is_active": True,
        "discovery_score": score,
    }
    row.update(kw)
    return row


# ═════════════════════════════════════════════════════════════════════════════
# Quarantine
# ═════════════════════════════════════════════════════════════════════════════

class TestQuarantine:
    def test_no_quarantine_is_not_benched(self):
        assert TickerScoper().is_quarantined(None, NOW) is False

    def test_a_future_expiry_is_still_benched(self):
        assert TickerScoper().is_quarantined("2026-12-01T00:00:00Z", NOW) is True

    def test_a_past_expiry_has_lapsed(self):
        assert TickerScoper().is_quarantined("2026-01-01T00:00:00Z", NOW) is False

    def test_a_naive_timestamp_is_read_as_utc(self):
        assert TickerScoper().is_quarantined("2026-12-01T00:00:00", NOW) is True

    def test_an_unparseable_timestamp_fails_open(self):
        # Failing open on purpose: a bad value must not silently shrink the pool
        # below the crowd the cross-sectional quant percentiles need.
        assert TickerScoper().is_quarantined("garbage", NOW) is False


# ═════════════════════════════════════════════════════════════════════════════
# Ranking one universe
# ═════════════════════════════════════════════════════════════════════════════

class TestRankUniverse:
    def test_a_higher_discovery_score_ranks_first(self):
        rows = [discovered("LOW", score=0.1), discovered("HIGH", score=0.9)]
        assert TickerScoper().rank_universe(rows, NOW) == ["HIGH", "LOW"]

    def test_seeds_are_always_eligible(self):
        assert TickerScoper().rank_universe([seed("AAA")], NOW) == ["AAA"]

    def test_a_discovered_name_outranks_a_seed(self):
        # Seeds carry the fixed baseline, so they fill only the shortfall.
        rows = [seed("SEED"), discovered("DISC", score=0.5)]
        assert TickerScoper().rank_universe(rows, NOW) == ["DISC", "SEED"]

    def test_a_retired_discovery_is_excluded(self):
        rows = [discovered("DEAD", is_active=False), seed("AAA")]
        assert TickerScoper().rank_universe(rows, NOW) == ["AAA"]

    def test_a_quarantined_discovery_is_excluded(self):
        rows = [discovered("BENCH", quarantined_until="2026-12-01T00:00:00Z"), seed("AAA")]
        assert TickerScoper().rank_universe(rows, NOW) == ["AAA"]

    def test_a_retired_seed_is_still_eligible(self):
        # The active/quarantine guards apply to discoveries only — a curated seed
        # is the hand-picked floor of the universe.
        assert TickerScoper().rank_universe([seed("AAA", is_active=False)], NOW) == ["AAA"]

    def test_a_null_discovery_score_is_treated_as_zero(self):
        rows = [discovered("NULL", score=None), discovered("REAL", score=0.3)]
        assert TickerScoper().rank_universe(rows, NOW) == ["REAL", "NULL"]

    def test_a_row_without_a_ticker_is_skipped(self):
        assert TickerScoper().rank_universe([{"origin": "seed"}], NOW) == []

    def test_ties_break_on_ticker_so_two_runs_agree(self):
        rows = [discovered(t, score=0.5) for t in ("CCC", "AAA", "BBB")]
        assert TickerScoper().rank_universe(rows, NOW) == ["AAA", "BBB", "CCC"]

    def test_the_pool_size_caps_the_universe(self):
        rows = [discovered("T%02d" % i, score=i / 100) for i in range(20)]
        assert len(TickerScoper(pool_size=5).rank_universe(rows, NOW)) == 5


# ═════════════════════════════════════════════════════════════════════════════
# Assembling the scope
# ═════════════════════════════════════════════════════════════════════════════

class TestSelectFromPool:
    def test_the_watchlist_comes_first(self):
        rows = [discovered("DISC", score=0.9)]
        out = TickerScoper().select_from_pool(rows, ["Technology"], ["MINE"], NOW)
        assert out[0] == "MINE"

    def test_a_watchlisted_ticker_survives_the_cap(self):
        # Personalization outranks pool hygiene: the cap must never drop a name the
        # user chose.
        rows = [discovered("T%02d" % i, score=0.9) for i in range(30)]
        out = TickerScoper(max_tickers=5).select_from_pool(rows, ["Technology"], ["MINE"], NOW)
        assert "MINE" in out and len(out) == 5

    def test_a_watchlisted_ticker_is_kept_even_when_retired(self):
        rows = [discovered("MINE", is_active=False)]
        out = TickerScoper().select_from_pool(rows, ["Technology"], ["MINE"], NOW)
        assert out == ["MINE"]

    def test_universes_are_interleaved_rather_than_drained_one_at_a_time(self):
        rows = [
            discovered("T1", "Technology", 0.9), discovered("T2", "Technology", 0.8),
            discovered("F1", "Finance", 0.7), discovered("F2", "Finance", 0.6),
        ]
        out = TickerScoper().select_from_pool(rows, ["Technology", "Finance"], [], NOW)
        # Round-robin by rank, so each universe is fairly represented under the cap.
        assert out == ["T1", "F1", "T2", "F2"]

    def test_a_shallow_universe_does_not_stall_the_others(self):
        rows = [
            discovered("T1", "Technology", 0.9), discovered("T2", "Technology", 0.8),
            discovered("F1", "Finance", 0.7),
        ]
        out = TickerScoper().select_from_pool(rows, ["Technology", "Finance"], [], NOW)
        assert out == ["T1", "F1", "T2"]

    def test_rows_outside_the_users_universes_are_ignored(self):
        rows = [discovered("H1", "Healthcare", 0.9), discovered("T1", "Technology", 0.5)]
        out = TickerScoper().select_from_pool(rows, ["Technology"], [], NOW)
        assert out == ["T1"]

    def test_a_duplicate_between_watchlist_and_pool_appears_once(self):
        rows = [discovered("MINE", score=0.9)]
        out = TickerScoper().select_from_pool(rows, ["Technology"], ["MINE"], NOW)
        assert out == ["MINE"]

    def test_the_cap_is_applied_last(self):
        rows = [discovered("T%02d" % i, score=1 - i / 100) for i in range(50)]
        out = TickerScoper(max_tickers=7).select_from_pool(rows, ["Technology"], [], NOW)
        assert len(out) == 7

    def test_an_empty_pool_yields_just_the_watchlist(self):
        assert TickerScoper().select_from_pool([], ["Technology"], ["MINE"], NOW) == ["MINE"]


class TestScope:
    def test_the_seeded_path_is_watchlist_first_then_sorted(self, monkeypatch):
        monkeypatch.setattr(lo, "DISCOVERY_ENABLED", False)
        monkeypatch.setattr(
            "src.utils.supabase_client.get_assets_by_universes",
            lambda universes: ["CCC", "AAA", "BBB"],
        )
        assert TickerScoper().scope(["Technology"], ["MINE"]) == ["MINE", "AAA", "BBB", "CCC"]

    def test_a_duplicated_watchlist_entry_is_collapsed(self, monkeypatch):
        monkeypatch.setattr(lo, "DISCOVERY_ENABLED", False)
        monkeypatch.setattr(
            "src.utils.supabase_client.get_assets_by_universes", lambda universes: []
        )
        assert TickerScoper().scope(["Technology"], ["MINE", "MINE"]) == ["MINE"]

    def test_shadow_mode_still_uses_the_seeded_path(self, monkeypatch):
        monkeypatch.setattr(lo, "DISCOVERY_ENABLED", True)
        monkeypatch.setattr(lo, "DISCOVERY_SHADOW_MODE", True)
        monkeypatch.setattr(
            "src.utils.supabase_client.get_assets_by_universes", lambda universes: ["SEEDED"]
        )
        monkeypatch.setattr(
            "src.utils.supabase_client.get_discovery_pool_rows",
            lambda universes: pytest.fail("the pool must not be read in shadow mode"),
        )
        assert TickerScoper().scope(["Technology"], []) == ["SEEDED"]

    def test_a_live_pool_is_used_when_discovery_is_on(self, monkeypatch):
        monkeypatch.setattr(lo, "DISCOVERY_ENABLED", True)
        monkeypatch.setattr(lo, "DISCOVERY_SHADOW_MODE", False)
        monkeypatch.setattr(
            "src.utils.supabase_client.get_discovery_pool_rows",
            lambda universes: [discovered("DISC", score=0.9)],
        )
        assert TickerScoper().scope(["Technology"], []) == ["DISC"]

    def test_an_empty_pool_degrades_to_the_seeded_path(self, monkeypatch):
        # A missing migration or a read failure must not starve the run.
        monkeypatch.setattr(lo, "DISCOVERY_ENABLED", True)
        monkeypatch.setattr(lo, "DISCOVERY_SHADOW_MODE", False)
        monkeypatch.setattr(
            "src.utils.supabase_client.get_discovery_pool_rows", lambda universes: []
        )
        monkeypatch.setattr(
            "src.utils.supabase_client.get_assets_by_universes", lambda universes: ["SEEDED"]
        )
        assert TickerScoper().scope(["Technology"], []) == ["SEEDED"]

    def test_the_cap_bounds_the_seeded_path_too(self, monkeypatch):
        monkeypatch.setattr(lo, "DISCOVERY_ENABLED", False)
        monkeypatch.setattr(
            "src.utils.supabase_client.get_assets_by_universes",
            lambda universes: ["T%02d" % i for i in range(50)],
        )
        assert len(TickerScoper(max_tickers=9).scope(["Technology"], [])) == 9


# ═════════════════════════════════════════════════════════════════════════════
# Phases
# ═════════════════════════════════════════════════════════════════════════════

def a_state(**kw):
    state = {
        "user_id": "u1",
        "risk_tolerance": "Moderate",
        "expertise_level": "novice",
        "universes": ["Technology"],
        "watchlist": [],
        "tickers": ["AAA"],
        "quant_results": {},
        "sentiment_results": {},
        "final_rankings": [],
        "run_id": "run-1",
        "status": "pending",
    }
    state.update(kw)
    return state


class TestPhases:
    def test_every_phase_is_a_phase(self):
        for cls in (InitializePhase, QuantPhase, SentimentPhase, SynthesizePhase, OutputPhase):
            assert issubclass(cls, Phase)

    def test_a_phase_is_callable_so_the_graph_needs_no_adapter(self):
        phase = InitializePhase(TickerScoper())
        assert callable(phase)

    def test_calling_a_phase_runs_it(self, monkeypatch):
        class Recording(Phase):
            name = "recording"

            def __init__(self):
                self.ran = False

            def run(self, state):
                self.ran = True
                return {"status": "done"}

        phase = Recording()
        assert phase(a_state()) == {"status": "done"}
        assert phase.ran is True

    def test_every_phase_has_a_distinct_graph_node_name(self):
        names = [p.name for p in lo._PHASES.values()]
        assert len(names) == len(set(names))
        assert set(names) == set(lo._PHASES)

    def test_initialize_scopes_the_tickers_and_clears_the_results(self):
        class FixedScoper(TickerScoper):
            def scope(self, universes, watchlist=None):
                return ["AAA", "BBB"]

        out = InitializePhase(FixedScoper()).run(a_state())
        assert out["tickers"] == ["AAA", "BBB"]
        assert out["status"] == "initialized"
        assert out["quant_results"] == {} and out["sentiment_results"] == {}

    def test_the_quant_phase_swallows_its_own_failure(self, monkeypatch):
        # It runs in parallel with sentiment; an empty result is a degraded run,
        # not a failed one.
        def explode(_tickers):
            raise RuntimeError("yfinance is down")

        monkeypatch.setattr(lo, "analyze_quant_tickers", explode)
        assert QuantPhase().run(a_state()) == {"quant_results": {}}

    def test_the_sentiment_phase_swallows_its_own_failure(self, monkeypatch):
        def explode(_tickers, **kw):
            raise RuntimeError("stocktwits is down")

        monkeypatch.setattr(lo, "analyze_sentiment_tickers", explode)
        assert SentimentPhase().run(a_state()) == {"sentiment_results": {}}

    def test_the_quant_phase_returns_what_it_measured(self, monkeypatch):
        monkeypatch.setattr(lo, "analyze_quant_tickers", lambda t: {"AAA": {"rsi": 55.0}})
        assert QuantPhase().run(a_state()) == {"quant_results": {"AAA": {"rsi": 55.0}}}

    def test_the_sentiment_phase_reads_the_cache_not_the_api(self, monkeypatch):
        # The live Marketaux budget belongs to the nightly batch; a user refresh
        # must read what that batch already stored.
        seen = {}

        def fake(tickers, marketaux=None):
            seen["marketaux"] = marketaux
            return {}

        monkeypatch.setattr(lo, "analyze_sentiment_tickers", fake)
        SentimentPhase().run(a_state())
        assert seen["marketaux"] == "cache"

    def test_quant_metrics_are_flattened_for_the_trace(self):
        metrics = QuantPhase._trace_metrics("AAA", {"rsi": 55.0, "macd": "bullish_crossover"})
        assert metrics.ticker == "AAA"
        assert metrics.rsi == 55.0
        assert metrics.macd_signal == "bullish_crossover"

    def test_absent_metrics_become_none_rather_than_raising(self):
        metrics = QuantPhase._trace_metrics("AAA", {})
        assert metrics.rsi is None and metrics.beta is None


class TestGraph:
    def test_the_graph_is_built_from_the_phase_objects(self):
        app = lo.build_graph()
        nodes = set(app.get_graph().nodes)
        assert set(lo._PHASES).issubset(nodes)

    def test_the_graph_can_be_built_from_substituted_phases(self):
        class Noop(Phase):
            def __init__(self, name):
                self.name = name

            def run(self, state):
                return {}

        phases = {name: Noop(name) for name in lo._PHASES}
        app = lo.build_graph(phases)
        assert set(lo._PHASES).issubset(set(app.get_graph().nodes))
