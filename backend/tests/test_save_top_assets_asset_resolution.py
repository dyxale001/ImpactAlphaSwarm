"""Regression tests for the 2026-09-03 stale-recommendations defect: a
watchlist ticker with no `assets` row used to blow up asset creation
(assets.universe is NOT NULL with no default) and abort save_top_assets
entirely, leaving the previous run's rows on screen while the run reported
`complete`. See the "Watchlist & Research Pages (status)" design note.

These tests exercise src.utils.supabase_client.get_or_create_asset_id and
save_top_assets directly against a tiny hand-rolled fake table, with no live
Supabase/network calls.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import src.utils.supabase_client as sc


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, rows, fail_tickers):
        self.table_name = table
        self.rows = rows
        self.fail_tickers = fail_tickers
        self._filters = {}
        self._insert_payload = None
        self._delete = False

    def select(self, *_a, **_k):
        return self

    def eq(self, col, value):
        self._filters[col] = value
        return self

    def gt(self, *_a, **_k):
        self._filters["__gt__"] = True
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def delete(self):
        self._delete = True
        return self

    def insert(self, payload):
        self._insert_payload = payload
        return self

    def execute(self):
        if self._delete:
            run_id = self._filters.get("run_id")
            before = len(self.rows)
            self.rows[:] = [r for r in self.rows if r.get("run_id") != run_id]
            return _Resp([{"deleted": before - len(self.rows)}])

        if self._insert_payload is not None:
            payload = self._insert_payload
            batch = payload if isinstance(payload, list) else [payload]
            if self.table_name == "assets":
                for row in batch:
                    if row.get("ticker") in self.fail_tickers:
                        # Mirrors assets.universe NOT NULL rejecting a bare
                        # {"ticker", "name"} insert with no universe.
                        raise Exception(
                            'null value in column "universe" of relation '
                            '"assets" violates not-null constraint'
                        )
            inserted = []
            for row in batch:
                row = dict(row)
                row.setdefault("id", f"generated-{row.get('ticker')}")
                self.rows.append(row)
                inserted.append(row)
            return _Resp(inserted)

        # plain select
        results = list(self.rows)
        for col, val in self._filters.items():
            if col == "__gt__":
                continue
            results = [r for r in results if r.get(col) == val]
        limit = getattr(self, "_limit", None)
        if limit is not None:
            results = results[:limit]
        return _Resp(results)


class FakeTables:
    """Minimal stand-in for the `supabase` client used by save_top_assets."""

    def __init__(self, assets=None, ai_recommendation=None, fail_tickers=None):
        self._data = {
            "assets": list(assets or []),
            "ai_recommendation": list(ai_recommendation or []),
        }
        self.fail_tickers = set(fail_tickers or [])

    def table(self, name):
        return _Query(name, self._data.setdefault(name, []), self.fail_tickers)


def _asset(rank, ticker, score=80):
    return {
        "ticker": ticker,
        "unified_score": score,
        "quant_score": score,
        "sentiment_score": score,
        "reasoning": "",
        "adjustments": {},
    }


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    # save_top_assets falls back to a live price fetch when no price_cache
    # entry exists; keep everything in-process for these tests.
    monkeypatch.setattr(sc, "fetch_price_at_run_in_zar", lambda ticker: 100.0)


def test_get_or_create_asset_id_returns_none_instead_of_raising(monkeypatch):
    """A ticker whose assets-row creation fails (e.g. missing universe) must
    come back as None, not propagate the exception to the caller."""
    fake = FakeTables(fail_tickers={"BADTICKER"})
    monkeypatch.setattr(sc, "supabase", fake)

    assert sc.get_or_create_asset_id("BADTICKER") is None


def test_get_or_create_asset_id_still_creates_resolvable_tickers(monkeypatch):
    fake = FakeTables()
    monkeypatch.setattr(sc, "supabase", fake)

    asset_id = sc.get_or_create_asset_id("AAPL")
    assert asset_id is not None
    # Second call finds the row that was just created.
    assert sc.get_or_create_asset_id("AAPL") == asset_id


def test_one_bad_watchlist_ticker_does_not_abort_the_whole_save(monkeypatch):
    """Case A: AAPL, MSFT, GOOGL resolve; a watchlist ticker with no assets
    row does not. The three good rows must still be written."""
    fake = FakeTables(fail_tickers={"NOROW"})
    monkeypatch.setattr(sc, "supabase", fake)

    top = [_asset(1, "AAPL"), _asset(2, "MSFT"), _asset(3, "NOROW"), _asset(4, "GOOGL")]
    result = sc.save_top_assets(
        run_id="run-1",
        user_id="user-1",
        top_5=top,
        quant_results={},
        sentiment_results={},
    )

    assert result["status"] in ("inserted", "inserted_without_v2")
    saved_tickers = {row.get("asset_id") for row in fake._data["ai_recommendation"]}
    # 3 valid rows made it in; the unresolved ticker did not produce a row at all.
    assert len(fake._data["ai_recommendation"]) == 3
    assert None not in saved_tickers


def test_stale_rows_are_cleared_even_when_one_ticker_fails(monkeypatch):
    """The core stale-data regression: a previous run's rows under the same
    run_id must not survive display as though they belonged to the new run,
    even when the new run includes one unresolvable watchlist ticker."""
    fake = FakeTables(
        ai_recommendation=[
            {"asset_id": "old-asset", "run_id": "run-1", "rank": 1, "created_at": "2026-09-02T22:05:00Z"}
        ],
        fail_tickers={"NOROW"},
    )
    monkeypatch.setattr(sc, "supabase", fake)

    top = [_asset(1, "AAPL"), _asset(2, "NOROW")]
    sc.save_top_assets(
        run_id="run-1",
        user_id="user-1",
        top_5=top,
        quant_results={},
        sentiment_results={},
    )

    rows = fake._data["ai_recommendation"]
    assert all(row.get("asset_id") != "old-asset" for row in rows), (
        "previous run's stale recommendation row survived the new run's save"
    )


def test_normal_run_with_only_valid_assets_is_unaffected(monkeypatch):
    fake = FakeTables()
    monkeypatch.setattr(sc, "supabase", fake)

    top = [_asset(1, "AAPL"), _asset(2, "MSFT")]
    result = sc.save_top_assets(
        run_id="run-2",
        user_id="user-1",
        top_5=top,
        quant_results={},
        sentiment_results={},
    )

    assert result["status"] in ("inserted", "inserted_without_v2")
    assert len(fake._data["ai_recommendation"]) == 2


def test_all_tickers_failing_reports_resolution_failed_not_a_success(monkeypatch):
    """Case B (Test A in the follow-up audit): every ticker in the run is
    unresolvable. save_top_assets must not raise, and its status must be
    distinguishable from a successful save -- "resolution_failed", not
    "no_rows" (which means "there was nothing to save", a different, benign
    case) and not "inserted"."""
    fake = FakeTables(
        ai_recommendation=[
            {"asset_id": "old-asset", "run_id": "run-3", "rank": 1}
        ],
        fail_tickers={"BAD1", "BAD2"},
    )
    monkeypatch.setattr(sc, "supabase", fake)

    top = [_asset(1, "BAD1"), _asset(2, "BAD2")]
    result = sc.save_top_assets(
        run_id="run-3",
        user_id="user-1",
        top_5=top,
        quant_results={},
        sentiment_results={},
    )

    assert result["status"] == "resolution_failed"
    assert result["status"] not in ("inserted", "inserted_without_v2", "no_rows")


def test_empty_ranking_is_still_the_benign_no_rows_case(monkeypatch):
    """top_5 itself being empty (nothing was ranked at all) is not the
    resolution-failure defect -- it must keep the old "no_rows" status so
    existing callers that treat it as benign are unaffected."""
    fake = FakeTables()
    monkeypatch.setattr(sc, "supabase", fake)

    result = sc.save_top_assets(
        run_id="run-4",
        user_id="user-1",
        top_5=[],
        quant_results={},
        sentiment_results={},
    )

    assert result["status"] == "no_rows"


def _save_status_for_phase_4(monkeypatch, save_result):
    """Runs the same status-selection logic phase_4_output uses, isolated
    from the rest of the LangGraph pipeline so this test doesn't need a full
    graph invocation."""
    import src.orchestration.langgraph_orchestrator as orch

    monkeypatch.setattr(orch, "save_top_assets", lambda **_kwargs: save_result)
    state = {
        "run_id": "run-5",
        "user_id": "user-1",
        "risk_tolerance": "Moderate",
        "expertise_level": "novice",
        "final_rankings": [{"ticker": "AAPL"}],
        "quant_results": {},
        "sentiment_results": {},
    }
    return orch.phase_4_output(state)


def test_phase_4_output_reports_failed_when_save_resolution_fails(monkeypatch):
    """Test B (audit): a resolution_failed save must make phase_4_output's
    returned status "failed", not the unconditional "complete" it used to
    return regardless of what save_top_assets did."""
    out = _save_status_for_phase_4(
        monkeypatch, {"status": "resolution_failed", "requested": 2}
    )
    assert out["status"] == "failed"


def test_phase_4_output_reports_failed_when_save_raises(monkeypatch):
    import src.orchestration.langgraph_orchestrator as orch

    def _raise(**_kwargs):
        raise Exception("boom")

    monkeypatch.setattr(orch, "save_top_assets", _raise)
    state = {
        "run_id": "run-6",
        "user_id": "user-1",
        "risk_tolerance": "Moderate",
        "expertise_level": "novice",
        "final_rankings": [{"ticker": "AAPL"}],
        "quant_results": {},
        "sentiment_results": {},
    }
    out = orch.phase_4_output(state)
    assert out["status"] == "failed"


def test_phase_4_output_reports_complete_for_a_full_or_partial_save(monkeypatch):
    """Test E/preserving Test C: a fully successful save, and a partial save
    (some tickers skipped but at least one row written), both still report
    "complete" -- only a total resolution failure changes the run's status."""
    for save_result in (
        {"status": "inserted", "requested": 2, "saved": 2},
        {"status": "inserted", "requested": 3, "saved": 2},  # partial
    ):
        out = _save_status_for_phase_4(monkeypatch, save_result)
        assert out["status"] == "complete"


def test_historical_defect_simulation_stale_run_cannot_report_complete(monkeypatch):
    """Test F (audit): the exact historical scenario. An old Technology run's
    rows sit under a run_id; a new Healthcare run reuses tickers that all
    fail asset resolution. The new run must not be reported complete, so the
    caller (api.py's _bg_job) has what it needs to avoid marking it complete
    and the frontend has what it needs to avoid showing the old rows as
    fresh."""
    fake = FakeTables(
        ai_recommendation=[
            {"asset_id": "old-aapl", "run_id": "run-7", "rank": 1},
            {"asset_id": "old-msft", "run_id": "run-7", "rank": 2},
            {"asset_id": "old-nvda", "run_id": "run-7", "rank": 3},
        ],
        fail_tickers={"BAD_WATCHLIST_1", "BAD_WATCHLIST_2"},
    )
    monkeypatch.setattr(sc, "supabase", fake)

    save_res = sc.save_top_assets(
        run_id="run-7",
        user_id="user-1",
        top_5=[_asset(1, "BAD_WATCHLIST_1"), _asset(2, "BAD_WATCHLIST_2")],
        quant_results={},
        sentiment_results={},
    )
    assert save_res["status"] == "resolution_failed"

    import src.orchestration.langgraph_orchestrator as orch

    monkeypatch.setattr(orch, "save_top_assets", lambda **_kwargs: save_res)
    phase_out = orch.phase_4_output(
        {
            "run_id": "run-7",
            "user_id": "user-1",
            "risk_tolerance": "Moderate",
            "expertise_level": "novice",
            "final_rankings": [
                {"ticker": "BAD_WATCHLIST_1"},
                {"ticker": "BAD_WATCHLIST_2"},
            ],
            "quant_results": {},
            "sentiment_results": {},
        }
    )

    # This is what run_analysis()'s return value carries and what _bg_job
    # reads to decide the persisted run.status -- it must not be "complete".
    assert phase_out["status"] == "failed"
    # And the old rows are, as documented, still present under run-7 -- which
    # is exactly why the status must say "failed": that's the caller's only
    # signal not to present them as this run's fresh result.
    old_rows = [r for r in fake._data["ai_recommendation"] if r.get("run_id") == "run-7"]
    assert {r["asset_id"] for r in old_rows} == {"old-aapl", "old-msft", "old-nvda"}
