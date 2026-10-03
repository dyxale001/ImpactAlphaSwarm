"""The nightly run must analyse each user's watchlist.

Until 2026-10-03 the /api/analysis/run-daily handler built each user's batch entry
from their sectors, risk and expertise, and never their watchlist, so
run_daily_batch always received an empty one. A followed company was analysed only
if it made its sector's top 15, and every morning the night's run replaced the
user's results without it: 76 of 86 watchlist entries were missing from their
owners' latest runs. The interactive run was unaffected; it sends the watchlist
from the browser.

Everything the handler touches is faked here, so this runs offline.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.api as api  # noqa: E402
import src.orchestration.langgraph_orchestrator as orch  # noqa: E402
import src.utils.supabase_client as sc  # noqa: E402


def run_nightly(monkeypatch, watchlists):
    captured = {}

    async def no_whales():
        return {}

    def fake_batch(users):
        captured["users"] = users
        return {"succeeded": len(users), "failed": 0, "tickers": 0}

    monkeypatch.setattr(api, "DAILY_RUN_SECRET", "s3cret")
    monkeypatch.setenv("DISCOVERY_ENABLED", "false")
    monkeypatch.setattr(api.whales, "refresh_nightly", no_whales)
    monkeypatch.setattr(api, "acquire_ai_run", lambda uid: (f"run-{uid}", True))
    monkeypatch.setattr(sc, "get_active_user_ids", lambda days: list(watchlists))
    monkeypatch.setattr(
        sc, "get_user_preferences",
        lambda uid: {"universes": ["Technology"], "risk_tolerance": "Medium", "expertise_level": "novice"},
    )
    monkeypatch.setattr(sc, "get_user_watchlist_tickers", lambda uid: watchlists[uid])
    monkeypatch.setattr(orch, "run_daily_batch", fake_batch)

    asyncio.run(api.run_daily(x_daily_run_secret="s3cret"))
    return {u["user_id"]: u for u in captured["users"]}


def test_each_users_watchlist_reaches_the_nightly_batch(monkeypatch):
    users = run_nightly(monkeypatch, {"u1": ["AAPL", "COST"], "u2": []})
    assert users["u1"]["watchlist"] == ["AAPL", "COST"]
    assert users["u2"]["watchlist"] == []


def test_the_batch_scopes_the_watchlist_first(monkeypatch):
    # The scoper already puts watchlist names first and keeps them however they
    # rank; this pins that the batch hands it the watchlist to do so.
    monkeypatch.setattr(orch, "DISCOVERY_ENABLED", False)
    # The seeded path imports this from supabase_client at call time, so stub it there.
    monkeypatch.setattr(sc, "get_assets_by_universes", lambda u: ["AAA", "BBB"])
    assert orch.scope_tickers(["Technology"], ["COST"]) == ["COST", "AAA", "BBB"]
