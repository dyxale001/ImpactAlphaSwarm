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
from src.funds.admin_routes import SnapshotIn  # noqa: E402
from src.funds.extract import FetchError  # noqa: E402
from src.funds.extract.base import Extraction, Reading, Unresolved  # noqa: E402
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

    def test_a_complete_allocation_is_accepted(self, client):
        res = client.post(
            "/api/admin/fund-catalogue/funds/f-1/snapshots",
            json={
                "as_of": "2026-07-31",
                "asset_allocation": {"Domestic bonds": 40.0, "Domestic cash": 59.5},
            },
        )
        assert res.status_code == 201

    def test_a_partial_allocation_is_refused(self, client):
        # The failure this guards is subtle: a donut summing to 60% renders
        # perfectly and reads as a fund holding 40% of nothing.
        res = client.post(
            "/api/admin/fund-catalogue/funds/f-1/snapshots",
            json={"as_of": "2026-07-31", "asset_allocation": {"Domestic equity": 60.0}},
        )
        assert res.status_code == 422
        problems = res.json()["detail"]["problems"]
        assert any(p["field"] == "asset_allocation" for p in problems)
        assert any("line item" in p["message"] for p in problems)

    def test_published_returns_are_stored_as_given(self, client):
        # Quoted from the sheet's own table, never recomputed, so they must go
        # in exactly as typed — including a negative period.
        res = client.post(
            "/api/admin/fund-catalogue/funds/f-1/snapshots",
            json={"as_of": "2026-07-31", "performance": {"1y": 14.41, "3y": -2.5}},
        )
        assert res.status_code == 201
        call = [c for c in client.app.state.fake.calls_on("fund_factsheet_snapshots") if c[0] == "upsert"][0]
        payload = call[1][0]
        assert payload["performance"] == {"1y": 14.41, "3y": -2.5}

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


class TestAddingAFundAndItsFirstSheetTogether:
    """INVARIANT: a fund and its first fact sheet arrive in one request.

    Both halves come off the same document — the ISIN and ASISA category from
    its fund-facts block, the fees and risk from its fee and risk blocks. When
    they were two requests on two screens, adding a fund left it listed,
    browsable and matchable to nobody until somebody went back and recorded the
    sheet separately.

    The important claim is the seed loader's: **everything is validated before
    anything is written.** The two tables are separate writes because PostgREST
    has no cross-table transaction, so up-front validation is what actually
    stops a half-loaded fund existing.
    """

    SHEET = {
        "as_of": "2026-07-31",
        "risk_indicator_raw": "Low",
        "risk_indicator_1to5": 1,
        "ter": 0.5,
        "tc": 0.1,
        "tic": 0.6,
    }

    def test_both_are_written_in_one_request(self, client):
        res = client.post(
            "/api/admin/fund-catalogue/funds",
            json={**VALID_FUND_BODY, "snapshot": self.SHEET},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["fund"] is not None
        assert body["snapshot"] is not None

        fake = client.app.state.fake
        assert any(name == "upsert" for name, *_ in fake.calls_on("funds"))
        assert any(name == "upsert" for name, *_ in fake.calls_on("fund_factsheet_snapshots"))

    def test_a_bad_sheet_stops_the_fund_being_created(self, client):
        # The whole point. ter + tc cannot exceed tic, so this sheet is refused
        # — and the fund must not be written either, or the catalogue gains a
        # fund with no figures because of a typo in a different field.
        res = client.post(
            "/api/admin/fund-catalogue/funds",
            json={**VALID_FUND_BODY, "snapshot": {**self.SHEET, "tic": 0.1}},
        )
        assert res.status_code == 422
        assert not any(
            name in ("insert", "upsert") for name, *_ in client.app.state.fake.calls_on("funds")
        )

    def test_a_bad_fund_stops_the_sheet_being_written(self, client):
        res = client.post(
            "/api/admin/fund-catalogue/funds",
            json={**VALID_FUND_BODY, "isin": "nonsense", "snapshot": self.SHEET},
        )
        assert res.status_code == 422
        assert not any(
            name in ("insert", "upsert")
            for name, *_ in client.app.state.fake.calls_on("fund_factsheet_snapshots")
        )

    def test_problems_from_both_halves_come_back_at_once(self, client):
        # One pass to fix everything, rather than one field per attempt.
        res = client.post(
            "/api/admin/fund-catalogue/funds",
            json={**VALID_FUND_BODY, "isin": "nonsense", "snapshot": {**self.SHEET, "tic": 0.1}},
        )
        assert res.status_code == 422
        fields = {p["field"] for p in res.json()["detail"]["problems"]}
        assert "isin" in fields
        assert any(f in fields for f in ("tic", "ter", "tc"))

    def test_the_sheet_stays_optional(self, client):
        # A fund can legitimately be added before its sheet is to hand.
        res = client.post("/api/admin/fund-catalogue/funds", json=VALID_FUND_BODY)
        assert res.status_code == 201
        assert res.json()["snapshot"] is None

    def test_the_sheet_carries_its_provenance(self, client):
        client.post(
            "/api/admin/fund-catalogue/funds",
            json={**VALID_FUND_BODY, "snapshot": self.SHEET},
        )
        call = [
            c for c in client.app.state.fake.calls_on("fund_factsheet_snapshots") if c[0] == "upsert"
        ][0]
        row = call[1][0]
        assert row["source"] == "manual"
        assert row["entered_by"] == "admin-1"
        assert row["review_status"] == "approved"
        # The stand-in hash, without which the row cannot de-duplicate.
        assert row["mdd_sha256"]

    def test_the_hash_is_the_same_rule_both_paths_use(self, client):
        # Recorded with a new fund and recorded against an existing one must
        # produce the same identity, or a correction made through one path would
        # not supersede a reading made through the other.
        from src.funds.admin_routes import _snapshot_row
        from src.funds.repository import FundRepository as Repo

        fund = {"isin": "ZAE000000002", "id": "f-new"}
        row = _snapshot_row(fund, SnapshotIn(**self.SHEET), "admin-1", "f-new")
        expected = Repo.transcription_hash("ZAE000000002", {k: v for k, v in row.items()})
        assert row["mdd_sha256"] == expected


class TestExtractingToPrefill:
    """INVARIANT: reading a sheet pre-fills a form and writes nothing."""

    def test_it_writes_nothing_to_the_catalogue(self, client, monkeypatch):
        from src.funds import admin_routes

        monkeypatch.setattr(
            admin_routes,
            "read_and_crop",
            lambda url: (
                Extraction(template="fake", url=url, readings=(Reading("isin", "X", "ev"),)),
                (),
            ),
        )
        res = client.post("/api/admin/fund-catalogue/extract", json={"url": "https://satrix.co.za/x"})
        assert res.status_code == 200
        for table in ("funds", "fund_factsheet_snapshots"):
            assert not any(
                name in ("insert", "upsert", "update", "delete")
                for name, *_ in client.app.state.fake.calls_on(table)
            )

    def test_it_returns_values_evidence_refusals_and_crops_separately(self, client, monkeypatch):
        # Four things, not one: what to fill, what it was read from, what the
        # reviewer has to supply themselves, and a picture of the block they
        # have to supply it from.
        from src.funds import admin_routes
        from src.funds.extract.crops import Crop

        monkeypatch.setattr(
            admin_routes,
            "read_and_crop",
            lambda url: (
                Extraction(
                    template="satrix",
                    url=url,
                    readings=(Reading("isin", "ZAE000240123", "ISIN Code ZAE000240123"),),
                    unresolved=(
                        Unresolved("risk_indicator_raw", "drawn as a graphic — read the sheet"),
                    ),
                ),
                (
                    Crop(
                        field="risk_indicator_raw",
                        label="Risk profile",
                        note="Read which step is shaded.",
                        page=1,
                        anchor="RISK PROFILE",
                        png=b"\x89PNG pretend",
                    ),
                ),
            ),
        )
        body = client.post(
            "/api/admin/fund-catalogue/extract", json={"url": "https://satrix.co.za/x"}
        ).json()
        assert body["fields"] == {"isin": "ZAE000240123"}
        assert "ISIN Code" in body["evidence"]["isin"]
        assert body["unresolved"][0]["field"] == "risk_indicator_raw"

        # The crop is attached to the field it belongs beside, carries the page
        # it came from, and arrives as base64 so the form needs no second call.
        crop = body["crops"][0]
        assert crop["field"] == "risk_indicator_raw"
        assert crop["page"] == 1
        assert crop["png_base64"]

    def test_a_sheet_that_cannot_be_rendered_still_returns_its_reading(self, client, monkeypatch):
        """The crops are an aid. Losing them degrades the form, not the request."""
        from src.funds import admin_routes

        monkeypatch.setattr(
            admin_routes,
            "read_and_crop",
            lambda url: (
                Extraction(template="fundrock", url=url, readings=(Reading("ter", 1.26, "TER 1.26"),)),
                (),
            ),
        )
        body = client.post(
            "/api/admin/fund-catalogue/extract", json={"url": "https://bcis.co.za/x"}
        ).json()
        assert body["fields"] == {"ter": 1.26}
        assert body["crops"] == []

    def test_a_bad_link_is_the_admins_to_fix_not_a_server_fault(self, client, monkeypatch):
        from src.funds import admin_routes

        def explode(_url):
            raise FetchError("That address did not return a PDF.")

        monkeypatch.setattr(admin_routes, "read_and_crop", explode)
        res = client.post("/api/admin/fund-catalogue/extract", json={"url": "https://satrix.co.za/x"})
        assert res.status_code == 422
        assert "PDF" in res.json()["detail"]["message"]

    def test_a_reader_failure_is_reported_with_its_message_not_as_a_crash(
        self, client, monkeypatch
    ):
        """A misconfigured reader is the server's fault and still not a 500.

        Before the errors shared a base class this came back as a 500 with no
        body, which tells the person at the form nothing at all — and the
        messages are written precisely so they can act.
        """
        from src.funds import admin_routes
        from src.funds.extract.llm import LlmExtractError

        def explode(_url):
            raise LlmExtractError("ANTHROPIC_API_KEY is not set on the server.")

        monkeypatch.setattr(admin_routes, "read_and_crop", explode)
        res = client.post("/api/admin/fund-catalogue/extract", json={"url": "https://satrix.co.za/x"})
        assert res.status_code == 422
        assert "ANTHROPIC_API_KEY" in res.json()["detail"]["message"]

    def test_the_readable_hosts_are_listed_for_the_form(self, client):
        hosts = client.get("/api/admin/fund-catalogue/extract/hosts").json()["hosts"]
        assert "satrix.co.za" in hosts

    def test_extraction_needs_an_admin_like_everything_else(self):
        app = build_app(admin=False)
        res = TestClient(app).post(
            "/api/admin/fund-catalogue/extract", json={"url": "https://satrix.co.za/x"}
        )
        assert res.status_code in (401, 403)


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
