"""Tests for the fund catalogue's admin surface.

Three claims.

The first is that **nothing here can delete anything**, because the schema will
not allow it: migration 024 grants only select/insert/update on funds and
snapshots. A catalogue of published documents is evidence, so a fund is retired
by clearing a flag and a fact sheet is corrected by recording another one. An
interface offering a delete would be promising what the database refuses.

The second is that a form and a CSV are held to **one standard** — the same
``ValidatorChain`` the seed loader runs — and that a rejection lists every
problem rather than the first, because someone filling a form wants to fix it
all in one pass.

The third is the flag and the admin check: with the feature off nothing mounts,
and with it on every route still requires an admin.

No network, no Supabase.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fund_fakes import FakeClient  # noqa: E402
from src.funds.admin_routes import (  # noqa: E402
    SOFT_STALE_DAYS,
    STALE_DAYS,
    _staleness,
    get_repository,
    mount_fund_catalogue_admin,
    require_admin,
    router,
)
from src.funds.repository import FundRepository  # noqa: E402

TODAY = date(2026, 9, 5)

FUND = {
    "id": "f-1",
    "isin": "ZAE000000001",
    "name": "Alpha Money Market Fund",
    "fund_house": "Alpha",
    "manco": "Alpha Collective Investments (RF) (Pty) Ltd",
    "vehicle": "unit_trust",
    "is_index_tracker": False,
    "jse_code": None,
    "yahoo_symbol": None,
    "asisa_geography": "South African",
    "asisa_asset_class": "Interest Bearing",
    "asisa_category": "South African - Interest Bearing - Money Market",
    "tfsa_eligible": False,
    "platforms": ["EasyEquities"],
    "curation_rule": "largest money market fund by fund size",
    "mdd_page_url": "https://alpha.invalid/funds",
    "is_active": True,
}

SHEET = {
    "id": "s-1",
    "fund_id": "f-1",
    "as_of": "2026-07-31",
    "mdd_url": "https://alpha.invalid/mm.pdf",
    "mdd_sha256": "abc",
    "risk_indicator_raw": "Low",
    "risk_indicator_1to5": 1,
    "ter": 0.3,
    "tc": 0.0,
    "tic": 0.3,
    "review_status": "approved",
    "created_at": "2026-08-01T00:00:00Z",
}

VALID_FUND_BODY = {
    "isin": "ZAE000000002",
    "name": "Beta Income Fund",
    "fund_house": "Beta",
    "manco": "Beta Collective Investments",
    "vehicle": "unit_trust",
    "asisa_geography": "South African",
    "asisa_asset_class": "Multi Asset",
    "asisa_category": "South African - Multi Asset - Income",
}


def build_app(rows=None, admin: bool = True) -> FastAPI:
    app = FastAPI()
    assert mount_fund_catalogue_admin(app, enabled=True) is True
    client = FakeClient(
        rows=rows if rows is not None else {"funds": [FUND], "fund_factsheet_snapshots": [SHEET]}
    )
    app.dependency_overrides[get_repository] = lambda: FundRepository(client)
    if admin:
        # Stands in for a verified admin token; the real dependency is the
        # backend's own two helpers, exercised by TestTheAdminCheck.
        app.dependency_overrides[require_admin] = lambda: "admin-1"
    app.state.fake = client
    return app


@pytest.fixture
def client() -> TestClient:
    return TestClient(build_app())


class TestNothingDeletes:
    """INVARIANT: the surface offers no way to destroy a record."""

    def test_no_route_accepts_delete(self):
        for route in router.routes:
            assert "DELETE" not in getattr(route, "methods", set()), route.path

    def test_retiring_a_fund_is_an_update_not_a_removal(self, client):
        res = client.patch("/api/admin/fund-catalogue/funds/f-1", json={"is_active": False})
        assert res.status_code == 200
        calls = client.app.state.fake.calls_on("funds")
        assert any(name == "update" for name, *_ in calls)
        assert not any(name == "delete" for name, *_ in calls)

    def test_a_retired_fund_can_still_be_edited_and_restored(self):
        # The public side hides it; the admin must not, or retiring would be a
        # one-way door and this feature's only removal would be irreversible.
        app = build_app(rows={"funds": [{**FUND, "is_active": False}], "fund_factsheet_snapshots": []})
        res = TestClient(app).patch("/api/admin/fund-catalogue/funds/f-1", json={"is_active": True})
        assert res.status_code == 200

    def test_a_sheet_can_be_recorded_against_a_retired_fund(self):
        # The document was published whether or not we still list the fund.
        app = build_app(rows={"funds": [{**FUND, "is_active": False}], "fund_factsheet_snapshots": []})
        res = TestClient(app).post(
            "/api/admin/fund-catalogue/funds/f-1/snapshots",
            json={"as_of": "2026-07-31", "risk_indicator_raw": "Low", "risk_indicator_1to5": 1},
        )
        assert res.status_code == 201

    def test_a_correction_is_recorded_as_another_sheet(self, client):
        # Same fund, same date, a different reading. It must insert, because
        # the earlier reading is the record of what the catalogue said then.
        res = client.post(
            "/api/admin/fund-catalogue/funds/f-1/snapshots",
            json={"as_of": "2026-07-31", "risk_indicator_raw": "Low", "risk_indicator_1to5": 1, "ter": 0.35},
        )
        assert res.status_code == 201
        calls = client.app.state.fake.calls_on("fund_factsheet_snapshots")
        assert not any(name == "delete" for name, *_ in calls)


class TestOneStandardForFormsAndCsv:
    """INVARIANT: the form runs the validators the seed loader runs."""

    def test_a_bad_isin_is_refused(self, client):
        res = client.post(
            "/api/admin/fund-catalogue/funds", json={**VALID_FUND_BODY, "isin": "nonsense"}
        )
        assert res.status_code == 422
        fields = [p["field"] for p in res.json()["detail"]["problems"]]
        assert "isin" in fields

    def test_an_unknown_category_is_refused(self, client):
        res = client.post(
            "/api/admin/fund-catalogue/funds",
            json={**VALID_FUND_BODY, "asisa_category": "South African - Equity - Mining"},
        )
        assert res.status_code == 422
        assert any(p["field"] == "asisa_category" for p in res.json()["detail"]["problems"])

    def test_every_problem_is_listed_not_just_the_first(self, client):
        res = client.post(
            "/api/admin/fund-catalogue/funds",
            json={**VALID_FUND_BODY, "isin": "nonsense", "asisa_category": "Nowhere - Nothing - None"},
        )
        assert res.status_code == 422
        fields = {p["field"] for p in res.json()["detail"]["problems"]}
        assert {"isin", "asisa_category"} <= fields

    def test_fees_that_cannot_both_be_true_are_refused(self, client):
        # ter + tc should equal tic; a tic below the ter is a transcription slip.
        res = client.post(
            "/api/admin/fund-catalogue/funds/f-1/snapshots",
            json={"as_of": "2026-07-31", "ter": 2.0, "tc": 0.1, "tic": 0.5},
        )
        assert res.status_code == 422

    def test_a_valid_fund_is_written(self, client):
        res = client.post("/api/admin/fund-catalogue/funds", json=VALID_FUND_BODY)
        assert res.status_code == 201
        assert any(name == "upsert" for name, *_ in client.app.state.fake.calls_on("funds"))

    def test_a_duplicate_isin_is_a_conflict_not_a_silent_overwrite(self, client):
        res = client.post("/api/admin/fund-catalogue/funds", json={**VALID_FUND_BODY, "isin": FUND["isin"]})
        assert res.status_code == 409

    def test_a_warning_does_not_block_the_save(self, client):
        # A sheet older than the freshness threshold may still be the newest one
        # the manager has published, so it saves and says so.
        res = client.post(
            "/api/admin/fund-catalogue/funds/f-1/snapshots",
            json={"as_of": "2020-01-31", "risk_indicator_raw": "Low", "risk_indicator_1to5": 1},
        )
        assert res.status_code == 201
        assert res.json()["warnings"], "a five-year-old sheet should warn"


class TestTheStalenessOrdering:
    """PINNED: the list answers 'what needs re-reading' before anything else."""

    def test_the_oldest_sheet_comes_first_and_no_sheet_beats_it(self):
        # Three funds: one never transcribed, one long overdue, one current.
        # The page exists to answer "what needs re-reading", so that is the
        # order it must return regardless of name or insertion order.
        never = {**FUND, "id": "f-never", "isin": "ZAE000000009", "name": "Aaa Never Read"}
        current = {**FUND, "id": "f-current", "isin": "ZAE000000008", "name": "Zzz Current"}
        app = build_app(
            rows={
                "funds": [current, FUND, never],
                "fund_factsheet_snapshots": [
                    {**SHEET, "id": "s-old", "fund_id": "f-1", "as_of": "2025-01-31"},
                    {**SHEET, "id": "s-new", "fund_id": "f-current", "as_of": "2026-09-01"},
                ],
            }
        )
        body = TestClient(app).get("/api/admin/fund-catalogue/funds").json()
        assert [f["id"] for f in body["funds"]] == ["f-never", "f-1", "f-current"]
        assert [f["staleness"]["status"] for f in body["funds"]] == ["missing", "stale", "current"]

    def test_the_thresholds_are_published_with_the_list(self, client):
        # The page renders the badges, so it needs the numbers rather than a
        # second copy of them.
        body = client.get("/api/admin/fund-catalogue/funds").json()
        assert body["soft_stale_days"] == SOFT_STALE_DAYS
        assert body["stale_days"] == STALE_DAYS

    @pytest.mark.parametrize(
        "age,expected",
        [(0, "current"), (SOFT_STALE_DAYS, "current"), (SOFT_STALE_DAYS + 1, "ageing"),
         (STALE_DAYS, "ageing"), (STALE_DAYS + 1, "stale")],
    )
    def test_the_thresholds_are_the_ones_decided(self, age, expected):
        from datetime import timedelta

        as_of = (TODAY - timedelta(days=age)).isoformat()
        assert _staleness(as_of, TODAY)["status"] == expected

    def test_a_missing_sheet_is_its_own_status(self):
        assert _staleness(None, TODAY)["status"] == "missing"

    def test_an_unreadable_date_is_not_silently_treated_as_fresh(self):
        # Failing toward "current" would hide a fund from the list that exists
        # to surface exactly this.
        assert _staleness("not a date", TODAY)["status"] == "unreadable"


class TestTheFlagAndTheAdminCheck:
    def test_nothing_mounts_when_the_feature_is_off(self):
        app = FastAPI()
        assert mount_fund_catalogue_admin(app, enabled=False) is False
        assert TestClient(app).get("/api/admin/fund-catalogue/funds").status_code == 404

    def test_the_router_owns_the_admin_prefix(self):
        assert router.prefix == "/api/admin/fund-catalogue"

    def test_every_route_requires_the_admin_dependency(self):
        # The check is a dependency rather than a line in each handler, so this
        # asserts none was added without one.
        for route in router.routes:
            names = [d.call.__name__ for d in getattr(route, "dependant", None).dependencies]
            assert "require_admin" in names, route.path

    def test_without_a_token_the_request_is_refused(self):
        app = build_app(admin=False)
        res = TestClient(app).get("/api/admin/fund-catalogue/funds")
        assert res.status_code in (401, 403)
