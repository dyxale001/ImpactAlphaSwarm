"""Offline regression tests for shared deactivation and admin-only reactivation."""
import asyncio
import datetime
import sys
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import src.api as api

REAL_AUTH = api._get_user_id_from_bearer


@pytest.fixture
def accounts(monkeypatch):
    state = SimpleNamespace(caller="admin", role="admin", active=True, admin_active=True,
        banned=False, db_failure=False, empty_update=False, auth_failure=False,
        invalid_auth_response=False, auth_state_mismatch=False, events=[])

    class Query:
        def select(self, *_args): return self
        def eq(self, _key, value):
            self.user_id = value
            return self
        def maybe_single(self): return self
        def update(self, patch):
            self.patch = patch
            return self
        def execute(self):
            if hasattr(self, "patch"):
                state.events.append(("profile", self.patch["is_active"]))
                if state.db_failure: raise RuntimeError("database unavailable")
                if state.empty_update: return SimpleNamespace(data=[])
                state.active = self.patch["is_active"]
                return SimpleNamespace(data=[{"id": self.user_id, "is_active": state.active}])
            return SimpleNamespace(data={"id": self.user_id, "role": state.role,
                "is_active": state.admin_active if self.user_id == "admin" else state.active})

    class AuthClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): return False
        async def get(self, url, **kwargs):
            if url.endswith("/auth/v1/user"):
                return httpx.Response(200, json={"id": state.caller})
            raise AssertionError("Unexpected Auth lookup")
        async def put(self, url, **kwargs):
            assert url.endswith("/auth/v1/admin/users/target")
            assert kwargs["headers"]["Authorization"] == f"Bearer {api.SUPABASE_SERVICE_ROLE_KEY}"
            banned = kwargs["json"]["ban_duration"] != "none"
            state.events.append(("auth-write", banned))
            if state.auth_failure: return httpx.Response(500, json={})
            state.banned = banned
            if state.invalid_auth_response:
                return httpx.Response(200, json={})
            reported_ban = not banned if state.auth_state_mismatch else banned
            until = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).isoformat() if reported_ban else None
            return httpx.Response(200, json={"id": "target", "banned_until": until})

    async def authenticate(_header): return state.caller
    monkeypatch.setattr(api, "supabase", SimpleNamespace(table=lambda _name: Query()))
    monkeypatch.setattr(api, "_get_user_id_from_bearer", authenticate)
    monkeypatch.setattr(api.httpx, "AsyncClient", AuthClient)
    return state


def toggle(active):
    return asyncio.run(api.toggle_user_status(api.ToggleUserStatusRequest(user_id="target", is_active=active), "Bearer caller"))


@pytest.mark.parametrize("self_service", [False, True])
@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_both_deactivation_paths_ban_and_mark_inactive(accounts, self_service):
    if self_service:
        accounts.caller = "target"
        result = asyncio.run(api.deactivate_own_account("Bearer caller"))
    else:
        result = toggle(False)
    assert result["ok"] is True
    assert accounts.banned and not accounts.active
    assert accounts.events == [("auth-write", True), ("profile", False)]


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_admin_reactivation_restores_profile_and_unbans(accounts):
    accounts.active, accounts.banned = False, True
    assert toggle(True)["is_active"] is True
    assert accounts.active and not accounts.banned
    assert accounts.events == [("profile", True), ("auth-write", False)]


@pytest.mark.parametrize("banned", [False, True])
@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_self_reactivation_is_disabled_even_with_an_existing_token(accounts, banned):
    accounts.active, accounts.banned = False, banned
    with pytest.raises(HTTPException) as error:
        asyncio.run(api.reactivate_own_account())
    assert error.value.status_code == 403
    assert accounts.events == []
    assert not accounts.active


@pytest.mark.parametrize("self_service", [False, True])
@pytest.mark.parametrize("failure", ["db_failure", "empty_update", "auth_failure", "invalid_auth_response", "auth_state_mismatch"])
def test_failed_deactivation_never_reports_success(accounts, self_service, failure):
    setattr(accounts, failure, True)
    with pytest.raises(HTTPException) as error:
        if self_service:
            accounts.caller = "target"
            asyncio.run(api.deactivate_own_account("Bearer caller"))
        else:
            toggle(False)
    assert error.value.status_code == 502
    assert "Auth and profile status may differ" in error.value.detail


@pytest.mark.parametrize("failure", ["db_failure", "empty_update", "auth_failure", "invalid_auth_response", "auth_state_mismatch"])
def test_failed_activation_never_reports_success(accounts, failure):
    accounts.active, accounts.banned = False, True
    setattr(accounts, failure, True)
    with pytest.raises(HTTPException) as error: toggle(True)
    assert error.value.status_code == 502
    if failure in ("db_failure", "empty_update"):
        assert accounts.banned
        assert not any(e[0] == "auth-write" for e in accounts.events)


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_non_admin_cannot_restore_an_account(accounts):
    accounts.role = "user"
    with pytest.raises(HTTPException) as error: toggle(True)
    assert error.value.status_code == 403
    assert accounts.events == []


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_admin_cannot_change_own_status(accounts):
    accounts.caller = "target"
    with pytest.raises(HTTPException) as error: toggle(False)
    assert error.value.status_code == 400
    assert accounts.events == []


@pytest.mark.parametrize("active", [True, False, None])
@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_authenticated_requests_require_an_active_account(accounts, monkeypatch, active):
    accounts.caller, accounts.active = "target", active
    monkeypatch.setattr(api, "_get_user_id_from_bearer", REAL_AUTH)
    if active is True:
        assert asyncio.run(api._get_user_id_from_bearer("Bearer token")) == "target"
    else:
        with pytest.raises(HTTPException) as error:
            asyncio.run(api._get_user_id_from_bearer("Bearer token"))
        assert error.value.status_code == 403


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_inactive_admin_cannot_reactivate_accounts(accounts, monkeypatch):
    accounts.admin_active = False
    monkeypatch.setattr(api, "_get_user_id_from_bearer", REAL_AUTH)
    with pytest.raises(HTTPException) as error: toggle(True)
    assert error.value.status_code == 403
    assert accounts.events == []


@pytest.mark.parametrize("endpoint", ["start_analysis", "analysis_status", "analysis_result"])
@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_analysis_endpoints_deny_inactive_accounts(accounts, monkeypatch, endpoint):
    accounts.caller, accounts.active = "target", False
    monkeypatch.setattr(api, "_get_user_id_from_bearer", REAL_AUTH)
    argument = api.StartAnalysisRequest(universes=[]) if endpoint == "start_analysis" else "run"
    with pytest.raises(HTTPException) as error:
        asyncio.run(getattr(api, endpoint)(argument, authorization="Bearer token"))
    assert error.value.status_code == 403
    assert accounts.events == []


@pytest.mark.parametrize("endpoint", ["analysis_status", "analysis_result"])
@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_analysis_reads_require_run_ownership(accounts, monkeypatch, endpoint):
    from _fake_supabase import FakeSupabase
    monkeypatch.setattr(api, "supabase", FakeSupabase({"ai_runs": [{"id": "run", "user_id": "other"}]}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(getattr(api, endpoint)("run", authorization="Bearer token"))
    assert error.value.status_code == 404


@pytest.mark.smoke  # tier: smoke -- one happy path per file (TESTING.md, 'Tiers')
def test_active_user_can_start_analysis(accounts, monkeypatch):
    accounts.caller = "target"
    monkeypatch.setattr(api, "_get_user_id_from_bearer", REAL_AUTH)
    monkeypatch.setattr(api, "acquire_ai_run", lambda uid: ("run", False))
    assert asyncio.run(api.start_analysis(api.StartAnalysisRequest(universes=[]), "Bearer token"))["run_id"] == "run"


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_missing_profile_denies_access(accounts, monkeypatch):
    from _fake_supabase import FakeSupabase
    monkeypatch.setattr(api, "_get_user_id_from_bearer", REAL_AUTH)
    monkeypatch.setattr(api, "supabase", FakeSupabase({"users": []}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(api._get_user_id_from_bearer("Bearer token"))
    assert error.value.status_code == 403


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
def test_missing_bearer_token_is_rejected(accounts, monkeypatch):
    monkeypatch.setattr(api, "_get_user_id_from_bearer", REAL_AUTH)
    with pytest.raises(HTTPException) as error:
        asyncio.run(api._get_user_id_from_bearer(None))
    assert error.value.status_code == 401
    assert accounts.events == []
