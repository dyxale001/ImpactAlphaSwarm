"""Admin Reports (P0 + P1): authorization, aggregation correctness, date-
range filtering, and empty-dataset handling. Uses FakeSupabase (see
_fake_supabase.py) — no live Supabase/network calls.
"""
from __future__ import annotations

import asyncio
import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import HTTPException

import src.api as api
from _fake_supabase import FakeSupabase

NOW = datetime.datetime.now(datetime.timezone.utc)

# Captured at collection time: conftest's autouse fixture no-ops
# api._log_ask_query for every test, so the tests that exercise the REAL
# function restore this reference (same pattern as test_ask_query_logging).
_REAL_LOG_ASK_QUERY = api._log_ask_query


def _iso(days_ago: float) -> str:
    return (NOW - datetime.timedelta(days=days_ago)).isoformat()


def _patch_auth(monkeypatch, user_id: str):
    async def _fake(_authorization):
        return user_id
    monkeypatch.setattr(api, "_get_user_id_from_bearer", _fake)


def _install(monkeypatch, tables: dict, *, active_ids=None):
    fake = FakeSupabase(tables)
    monkeypatch.setattr(api, "supabase", fake)
    monkeypatch.setattr("src.utils.supabase_client.get_active_user_ids", lambda days: list(active_ids or []))
    return fake


BASE_USERS = [
    {"id": "admin-1", "role": "admin", "is_active": True, "learning_xp": 500, "created_at": _iso(200)},
    {"id": "u1", "role": "user", "is_active": True, "learning_xp": 50, "created_at": _iso(1)},
    {"id": "u2", "role": "user", "is_active": True, "learning_xp": 150, "created_at": _iso(5)},
    {"id": "u3", "role": "user", "is_active": False, "learning_xp": 0, "created_at": _iso(40)},
    {"id": "u4", "role": "user", "is_active": True, "learning_xp": 1200, "created_at": _iso(100)},
]


# ── Authorization ────────────────────────────────────────────────────────

@pytest.mark.parametrize("endpoint_coro_name,kwargs", [
    ("admin_reports_overview", {}),
    ("admin_reports_users", {}),
    ("admin_reports_learners", {}),
    ("admin_reports_badges", {}),
    ("admin_reports_assets", {}),
    ("admin_reports_retention", {}),
    ("admin_reports_chatbot", {}),
])
@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_non_admin_is_rejected(monkeypatch, endpoint_coro_name, kwargs):
    _patch_auth(monkeypatch, "u1")
    _install(monkeypatch, {"users": BASE_USERS})
    endpoint = getattr(api, endpoint_coro_name)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(endpoint(authorization="Bearer x", **kwargs))
    assert exc_info.value.status_code == 403


@pytest.mark.smoke  # tier: smoke -- one happy path per file (TESTING.md, 'Tiers')
def test_admin_can_access_overview(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    _install(monkeypatch, {"users": BASE_USERS}, active_ids=["u1", "u2"])
    result = asyncio.run(api.admin_reports_overview(range="30d", authorization="Bearer x"))
    assert result["total_users"] == len(BASE_USERS)


def test_missing_or_invalid_token_is_rejected(monkeypatch):
    async def _boom(_authorization):
        raise HTTPException(status_code=401, detail="Invalid Supabase token")
    monkeypatch.setattr(api, "_get_user_id_from_bearer", _boom)
    _install(monkeypatch, {"users": BASE_USERS})
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(api.admin_reports_overview(range="30d", authorization="Bearer bad"))
    assert exc_info.value.status_code == 401


# ── Overview ─────────────────────────────────────────────────────────────

def test_overview_totals_and_role_counts(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    _install(monkeypatch, {"users": BASE_USERS}, active_ids=["u1", "u2", "u4"])
    result = asyncio.run(api.admin_reports_overview(range="30d", authorization="Bearer x"))
    assert result["total_users"] == 5
    assert result["users_by_role"] == {"admin": 1, "user": 4}
    assert result["active_users"] == 3
    assert result["inactive_users"] == 2


def test_overview_new_users_respects_range(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    _install(monkeypatch, {"users": BASE_USERS}, active_ids=[])
    result_7d = asyncio.run(api.admin_reports_overview(range="7d", authorization="Bearer x"))
    # Only u1 (1 day ago) and u2 (5 days ago) fall within 7 days.
    assert result_7d["new_users"] == 2
    result_all = asyncio.run(api.admin_reports_overview(range="all", authorization="Bearer x"))
    assert result_all["new_users"] == len(BASE_USERS)


def test_overview_trend_delta_is_none_with_no_prior_window(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    _install(monkeypatch, {"users": [
        {"id": "admin-1", "role": "admin", "is_active": True, "learning_xp": 0, "created_at": _iso(1)},
        {"id": "only", "role": "user", "is_active": True, "learning_xp": 0, "created_at": _iso(1)},
    ]}, active_ids=[])
    result = asyncio.run(api.admin_reports_overview(range="30d", authorization="Bearer x"))
    assert result["new_user_trends"]["7d"]["previous"] == 0
    assert result["new_user_trends"]["7d"]["delta_pct"] is None


# ── Users ────────────────────────────────────────────────────────────────

def test_users_report_account_status_and_registration_trend(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    _install(monkeypatch, {"users": BASE_USERS})
    result = asyncio.run(api.admin_reports_users(range="all", authorization="Bearer x"))
    assert result["account_status"] == {"active": 4, "inactive": 1}
    assert sum(p["new_users"] for p in result["registration_trend"]) == len(BASE_USERS)


def test_users_report_no_registrations_in_range(monkeypatch):
    """No user registered within the selected range -> empty trend/cohort,
    not an error, even though the users table itself isn't empty."""
    _patch_auth(monkeypatch, "admin-1")
    _install(monkeypatch, {"users": [
        {"id": "admin-1", "role": "admin", "is_active": True, "learning_xp": 0, "created_at": _iso(200)},
    ]})
    result = asyncio.run(api.admin_reports_users(range="7d", authorization="Bearer x"))
    assert result["registration_trend"] == []
    assert result["total_in_range"] == 0
    assert result["account_status"] == {"active": 1, "inactive": 0}


# ── Learners ─────────────────────────────────────────────────────────────

def test_learners_watchlist_counts(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    tables = {
        "users": BASE_USERS,
        "user_watchlist_assets": [
            {"ticker": "GOOGL", "created_at": _iso(1)},
            {"ticker": "MSFT", "created_at": _iso(40)},
        ],
    }
    _install(monkeypatch, tables)
    result = asyncio.run(api.admin_reports_learners(range="7d", authorization="Bearer x"))
    assert result["watchlist_additions"] == {"total": 2, "in_range": 1}
    assert result["learning_xp"]["learner_count"] == 4  # role == "user" only
    assert "analysis_runs" not in result  # moved to the Assets report, not a learning-feature metric


def test_learners_xp_distribution_buckets(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    _install(monkeypatch, {"users": BASE_USERS, "user_watchlist_assets": []})
    result = asyncio.run(api.admin_reports_learners(range="all", authorization="Bearer x"))
    dist = result["learning_xp"]["distribution"]
    assert dist["0"] == 1     # u3
    assert dist["1-99"] == 1  # u1
    assert dist["100-499"] == 1  # u2
    assert dist["1000+"] == 1  # u4


# ── Badges ───────────────────────────────────────────────────────────────

def test_badges_leaderboard_and_rarity(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    tables = {
        "users": BASE_USERS,  # 4 users with role "user" == eligible_learners
        "badges": [{"id": "b1", "name": "First Steps"}, {"id": "b2", "name": "Rare One"}],
        "user_badges": [
            {"user_id": "u1", "badge_id": "b1", "earned_at": _iso(1)},
            {"user_id": "u2", "badge_id": "b1", "earned_at": _iso(2)},
            {"user_id": "u3", "badge_id": "b2", "earned_at": _iso(60)},
        ],
    }
    _install(monkeypatch, tables)
    result = asyncio.run(api.admin_reports_badges(range="all", authorization="Bearer x"))
    leaderboard = {row["badge_id"]: row for row in result["leaderboard"]}
    assert leaderboard["b1"]["earned_count"] == 2
    assert leaderboard["b1"]["pct_of_learners"] == 50.0  # 2 / 4 eligible learners
    assert leaderboard["b2"]["earned_count"] == 1
    # Leaderboard sorted most-earned first.
    assert result["leaderboard"][0]["badge_id"] == "b1"


def test_badges_report_with_no_badges_earned_yet(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    tables = {"users": BASE_USERS, "badges": [{"id": "b1", "name": "X"}], "user_badges": []}
    _install(monkeypatch, tables)
    result = asyncio.run(api.admin_reports_badges(range="30d", authorization="Bearer x"))
    assert result["leaderboard"] == []
    assert result["average_badges_per_learner"] == 0.0


# ── Assets ───────────────────────────────────────────────────────────────

def test_assets_most_watchlisted_and_most_analyzed(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    tables = {
        "users": BASE_USERS,
        "user_watchlist_assets": [
            {"ticker": "GOOGL", "created_at": _iso(1)},
            {"ticker": "GOOGL", "created_at": _iso(2)},
            {"ticker": "MSFT", "created_at": _iso(3)},
        ],
        "ai_runs": [{"id": "r1", "status": "complete", "created_at": _iso(1)}],
        "ai_recommendation": [
            {"asset_id": "a1", "run_id": "r1"},
            {"asset_id": "a1", "run_id": "r1"},
            {"asset_id": "a2", "run_id": "r1"},
        ],
        "assets": [{"id": "a1", "ticker": "GOOGL"}, {"id": "a2", "ticker": "MSFT"}],
    }
    _install(monkeypatch, tables)
    result = asyncio.run(api.admin_reports_assets(range="all", authorization="Bearer x"))
    assert result["most_watchlisted"][0] == {"ticker": "GOOGL", "count": 2}
    assert result["most_analyzed"][0] == {"ticker": "GOOGL", "count": 2}
    assert result["analysis_runs"] == {"total": 1, "in_range": 1}


def test_assets_report_empty_dataset(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    tables = {"users": BASE_USERS, "user_watchlist_assets": [], "ai_runs": [], "ai_recommendation": [], "assets": []}
    _install(monkeypatch, tables)
    result = asyncio.run(api.admin_reports_assets(range="30d", authorization="Bearer x"))
    assert result["most_watchlisted"] == []
    assert result["most_analyzed"] == []


# ── Retention ────────────────────────────────────────────────────────────

def test_retention_dau_wau_mau_and_new_vs_returning(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    users = [
        {"id": "admin-1", "role": "admin", "created_at": _iso(300)},
        {"id": "new1", "created_at": _iso(1)},   # new, active
        {"id": "old1", "created_at": _iso(100)},  # old, active -> returning
        {"id": "old2", "created_at": _iso(200)},  # old, not active
    ]

    def _active(days):
        if days == 1:
            return ["new1"]
        if days == 7:
            return ["new1"]
        if days == 30:
            return ["new1", "old1"]
        return []

    fake = FakeSupabase({"users": users})
    monkeypatch.setattr(api, "supabase", fake)
    monkeypatch.setattr("src.utils.supabase_client.get_active_user_ids", _active)

    result = asyncio.run(api.admin_reports_retention(authorization="Bearer x"))
    assert result["dau"] == 1
    assert result["wau"] == 1
    assert result["mau"] == 2
    assert result["new_active_last_30d"] == 1     # new1
    assert result["returning_active_last_30d"] == 1  # old1


# ── Chatbot ──────────────────────────────────────────────────────────────

def test_chatbot_report_no_data_yet(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    _install(monkeypatch, {"users": BASE_USERS, "ask_query_logs": []})
    result = asyncio.run(api.admin_reports_chatbot(range="30d", authorization="Bearer x"))
    assert result["available"] is False
    assert result["total_queries"] == 0


def test_chatbot_report_missing_table_degrades_gracefully(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")

    class _BoomSupabase:
        def table(self, name):
            if name == "ask_query_logs":
                raise Exception("relation \"ask_query_logs\" does not exist")
            return FakeSupabase({"users": BASE_USERS}).table(name)

    monkeypatch.setattr(api, "supabase", _BoomSupabase())
    result = asyncio.run(api.admin_reports_chatbot(range="30d", authorization="Bearer x"))
    assert result["available"] is False


def test_chatbot_report_aggregates_rates_and_top_assets(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    logs = [
        {"intent": "ASSET_SEARCH", "success": True, "fallback_used": False, "validation_failed": False,
         "latency_ms": 100, "asset_symbol": "GOOGL", "user_id": "u1", "created_at": _iso(1)},
        {"intent": "ASSET_SEARCH", "success": True, "fallback_used": True, "validation_failed": True,
         "latency_ms": 300, "asset_symbol": "GOOGL", "user_id": "u2", "created_at": _iso(1)},
        {"intent": "UNKNOWN", "success": False, "fallback_used": False, "validation_failed": False,
         "latency_ms": 50, "asset_symbol": None, "user_id": "u1", "created_at": _iso(2)},
    ]
    _install(monkeypatch, {"users": BASE_USERS, "ask_query_logs": logs})
    result = asyncio.run(api.admin_reports_chatbot(range="all", authorization="Bearer x"))
    assert result["available"] is True
    assert result["total_queries"] == 3
    assert result["unique_users"] == 2
    assert round(result["success_rate_pct"], 1) == round(2 / 3 * 100, 1)
    assert round(result["fallback_rate_pct"], 1) == round(1 / 3 * 100, 1)
    assert round(result["validation_failure_rate_pct"], 1) == round(1 / 3 * 100, 1)
    assert result["average_latency_ms"] == round((100 + 300 + 50) / 3)
    assert result["top_queried_assets"][0] == {"ticker": "GOOGL", "count": 2}


def test_chatbot_report_shows_the_question_but_never_the_answer_or_the_asker(monkeypatch):
    """The privacy boundary, as of migration 037.

    This used to pin that NO raw text was ever returned. The product owner
    has since asked to see the questions people ask, so the boundary moved —
    but to a specific place, and this test holds it there: the QUESTION is
    shown; the model's ANSWER is not, and neither is who asked. A row that
    carries an answer column anyway (as a buggy writer might) must still
    not have it echoed back."""
    _patch_auth(monkeypatch, "admin-1")
    logs = [{
        "intent": "ASSET_SEARCH", "success": True, "fallback_used": False, "validation_failed": False,
        "latency_ms": 100, "asset_symbol": "GOOGL", "user_id": "u1-secret-id", "created_at": _iso(1),
        "query_text": "what is GOOGL price",
        # Simulates a row that (incorrectly) also carried an answer.
        "narration": "GOOGL is trading at R5,345",
    }]
    _install(monkeypatch, {"users": BASE_USERS, "ask_query_logs": logs})
    result = asyncio.run(api.admin_reports_chatbot(range="all", authorization="Bearer x"))

    assert [q["query"] for q in result["recent_queries"]] == ["what is GOOGL price"]
    dumped = str(result)
    assert "GOOGL is trading at R5,345" not in dumped
    assert "u1-secret-id" not in dumped
    assert all("user_id" not in q for q in result["recent_queries"])


def test_recent_questions_are_newest_first_and_skip_rows_with_no_text(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    base = {"intent": "LEARNING_QUESTION", "success": True, "fallback_used": False,
            "validation_failed": False, "latency_ms": 50, "asset_symbol": None, "user_id": "u1"}
    logs = [
        {**base, "created_at": _iso(5), "query_text": "oldest question"},
        {**base, "created_at": _iso(1), "query_text": "newest question"},
        {**base, "created_at": _iso(3), "query_text": None},
        {**base, "created_at": _iso(2), "query_text": "middle question"},
    ]
    _install(monkeypatch, {"users": BASE_USERS, "ask_query_logs": logs})
    result = asyncio.run(api.admin_reports_chatbot(range="all", authorization="Bearer x"))
    assert [q["query"] for q in result["recent_queries"]] == [
        "newest question", "middle question", "oldest question",
    ]
    # The aggregates still count every row, text or not.
    assert result["total_queries"] == 4


def test_recent_questions_respect_the_date_range(monkeypatch):
    _patch_auth(monkeypatch, "admin-1")
    base = {"intent": "UNKNOWN", "success": False, "fallback_used": False,
            "validation_failed": False, "latency_ms": 50, "asset_symbol": None, "user_id": "u1"}
    logs = [
        {**base, "created_at": _iso(1), "query_text": "inside the window"},
        {**base, "created_at": _iso(60), "query_text": "outside the window"},
    ]
    _install(monkeypatch, {"users": BASE_USERS, "ask_query_logs": logs})
    result = asyncio.run(api.admin_reports_chatbot(range="7d", authorization="Bearer x"))
    assert [q["query"] for q in result["recent_queries"]] == ["inside the window"]


def test_a_logged_question_is_truncated_and_whitespace_collapsed():
    assert api._clean_logged_query("  what   is\n\tGOOGL  ") == "what is GOOGL"
    assert api._clean_logged_query("x" * 5000) == "x" * api._ASK_LOG_QUERY_MAX_CHARS
    assert api._clean_logged_query("   ") is None
    assert api._clean_logged_query(None) is None
    assert api._clean_logged_query("") is None


class _RecordingSupabase:
    """Records every insert; optionally rejects any row carrying query_text,
    as a database without migration 037 would."""

    def __init__(self, reject_text=False, always_fail=False):
        self.attempts = []
        self._reject_text = reject_text
        self._always_fail = always_fail

    def table(self, _name):
        outer = self

        class _T:
            def insert(self, row):
                self._row = row
                return self

            def execute(self):
                outer.attempts.append(dict(self._row))
                if outer._always_fail:
                    raise RuntimeError("db down")
                if outer._reject_text and "query_text" in self._row:
                    raise RuntimeError('column "query_text" does not exist')

        return _T()


def test_logging_stores_the_question_and_never_the_answer(monkeypatch):
    db = _RecordingSupabase()
    monkeypatch.setattr(api, "supabase", db)
    _REAL_LOG_ASK_QUERY(user_id="u1", asset_symbol="AAPL", intent="ANALYSIS_EXPLANATION",
                       success=True, fallback_used=False, validation_failed=False,
                       latency_ms=120, query_text="tell me about AAPL")
    assert db.attempts[0]["query_text"] == "tell me about AAPL"
    assert not any(k in db.attempts[0] for k in ("narration", "answer", "response"))


def test_a_failed_text_insert_retries_without_it_rather_than_losing_the_row(monkeypatch):
    """If migration 037 has not run, the insert that includes query_text
    fails on the unknown column. Without the retry the WHOLE row is lost and
    every usage metric goes dark for the sake of one optional field."""
    db = _RecordingSupabase(reject_text=True)
    monkeypatch.setattr(api, "supabase", db)
    _REAL_LOG_ASK_QUERY(user_id="u1", asset_symbol=None, intent="UNKNOWN", success=False,
                       fallback_used=False, validation_failed=False, latency_ms=10,
                       query_text="some question")
    # The ladder drops optional columns progressively, ending at exactly the
    # row that existed before either migration. It must LAND, not just try.
    assert "query_text" in db.attempts[0]
    assert "query_text" not in db.attempts[-1]
    assert db.attempts[-1]["intent"] == "UNKNOWN"


def test_logging_never_raises_even_when_every_insert_fails(monkeypatch):
    """A logging failure may never break an /api/ask answer."""
    monkeypatch.setattr(api, "supabase", _RecordingSupabase(always_fail=True))
    _REAL_LOG_ASK_QUERY(user_id=None, asset_symbol=None, intent="X", success=False,
                       fallback_used=False, validation_failed=False, latency_ms=1,
                       query_text="q")


def test_no_question_text_is_sent_when_there_is_none(monkeypatch):
    """A blank question stores nothing rather than an empty string, and takes
    the plain-metrics path with a single insert."""
    db = _RecordingSupabase()
    monkeypatch.setattr(api, "supabase", db)
    _REAL_LOG_ASK_QUERY(user_id="u1", asset_symbol=None, intent="UNKNOWN", success=False,
                       fallback_used=False, validation_failed=False, latency_ms=1, query_text="   ")
    assert len(db.attempts) == 1 and "query_text" not in db.attempts[0]
