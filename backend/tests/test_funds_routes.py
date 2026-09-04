"""Tests for the funds HTTP surface.

Deliberately not mocked at the service boundary. The router is mounted on a bare
FastAPI app and given the real service over fake Supabase clients, so one request
exercises the repository, the matcher, the explanation and the serialisation
together. Those pieces have their own unit tests; what only an integration test
can catch is a route that returns the right data in the wrong shape, or a path
that never reaches its handler.

The first claim is the flag: with it off, nothing is mounted and every path 404s,
which is what makes merging this safe. The second is route order — "/meta" and
"/matches" must not be swallowed by "/{fund_id}", a mistake that produces a
confusing 404 rather than an error.

No network: the bearer helper is the only thing that would dial out, and the one
test that reaches it asserts the rejection that happens first.
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
from src.funds.repository import FundRepository, UserGoalsRepository  # noqa: E402
from src.funds.routes import (  # noqa: E402
    current_user_id,
    get_service,
    mount_fund_catalogue,
    router,
)
from src.funds.service import FundCatalogueService  # noqa: E402

TODAY = date(2026, 9, 4)

MONEY_MARKET = {
    "id": "f-mm",
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
    "curation_rule": "largest money market fund by fund size on the platform",
    "mdd_page_url": "https://alpha.invalid/funds/money-market",
    "is_active": True,
}

TOP40_ETF = {
    **MONEY_MARKET,
    "id": "f-etf",
    "isin": "ZAE000027108",
    "name": "Zulu Top 40 Index ETF",
    "fund_house": "Zulu",
    "manco": "Zulu Managers (RF) (Pty) Ltd",
    "vehicle": "etf",
    "is_index_tracker": True,
    "jse_code": "ZUL40",
    "yahoo_symbol": "ZUL40.JO",
    "asisa_asset_class": "Equity",
    "asisa_category": "South African - Equity - SA General",
    "tfsa_eligible": True,
}

MM_SHEET = {
    "id": "s-mm",
    "fund_id": "f-mm",
    "as_of": "2026-07-31",
    "mdd_url": "https://alpha.invalid/sheets/mm-july.pdf",
    "mdd_sha256": "hash-mm",
    "risk_indicator_raw": "Low",
    "risk_indicator_1to5": 1,
    "recommended_min_term_years": 0.25,
    "objective": "to provide capital stability and a return above money market rates",
    "asset_allocation": {"cash": 100.0},
    "benchmark": "STeFI Composite Index",
    "ter": 0.57,
    "tc": 0.01,
    "tic": 0.58,
    "performance": {"1y": 8.1, "3y": 7.4},
    "distribution_frequency": "Monthly",
    "fund_size_zar": 12000000000,
    "review_status": "approved",
    "mdd_pdf_ref": "ZAE000000001/2026-07-31.pdf",
}

# The ETF has no published risk indicator, which is common on tracker sheets. It
# must appear in the catalogue and never in a match.
ETF_SHEET = {
    **MM_SHEET,
    "id": "s-etf",
    "fund_id": "f-etf",
    "mdd_url": "https://zulu.invalid/sheets/top40-july.pdf",
    "mdd_sha256": "hash-etf",
    "risk_indicator_raw": None,
    "risk_indicator_1to5": None,
    "recommended_min_term_years": 5.0,
    "objective": "to track the FTSE/JSE Top 40 Index",
    "asset_allocation": {},
    "ter": 0.1,
    "tc": 0.03,
    "tic": 0.13,
    "mdd_pdf_ref": None,
}

CONSERVATIVE_USER = {
    "risk_tolerance": "Conservative",
    "survey_answers": {
        "goals": {
            "horizon_target_year": 2028,
            "horizon_band": "2_to_5",
            "purpose": "emergency_fund",
            "account_type": "discretionary",
            "contribution_style": "lump_sum",
            "answered_at": "2026-09-01T08:00:00Z",
        }
    },
}


def build_service(user_rows=None) -> FundCatalogueService:
    fund_client = FakeClient(
        rows={
            "funds": [MONEY_MARKET, TOP40_ETF],
            "fund_factsheet_snapshots": [MM_SHEET, ETF_SHEET],
        }
    )
    user_client = FakeClient(rows={"user_analysis": user_rows if user_rows is not None else [CONSERVATIVE_USER]})
    return FundCatalogueService(
        funds=FundRepository(fund_client),
        profiles=UserGoalsRepository(user_client),
        clock=lambda: TODAY,
    )


def build_app(user_rows=None, authenticated: bool = True) -> FastAPI:
    app = FastAPI()
    assert mount_fund_catalogue(app, enabled=True) is True
    app.dependency_overrides[get_service] = lambda: build_service(user_rows)
    if authenticated:
        # Stands in for a verified token. The real helper is exercised by
        # TestAuthentication, which asserts the rejection it performs first.
        app.dependency_overrides[current_user_id] = lambda: "u-1"
    return app


@pytest.fixture
def client() -> TestClient:
    return TestClient(build_app())


@pytest.fixture
def anonymous_client() -> TestClient:
    """Mounted with the real bearer dependency left in place."""
    return TestClient(build_app(authenticated=False))


class TestTheFlag:
    def test_nothing_is_mounted_when_the_flag_is_off(self):
        app = FastAPI()
        assert mount_fund_catalogue(app, enabled=False) is False
        client = TestClient(app)
        for path in ("/api/fund-catalogue", "/api/fund-catalogue/meta", "/api/fund-catalogue/matches"):
            assert client.get(path).status_code == 404, path

    def test_mounting_reports_that_it_happened(self):
        # Returned rather than logged so this is assertable.
        assert mount_fund_catalogue(FastAPI(), enabled=True) is True

    def test_the_router_owns_its_own_prefix(self):
        assert router.prefix == "/api/fund-catalogue"

    def test_it_does_not_collide_with_the_whale_endpoint(self):
        # /api/funds already exists and means 13F institutional holdings.
        assert all(not route.path.startswith("/api/funds") for route in router.routes)


class TestBrowse:
    def test_the_catalogue_lists_every_active_fund(self, client):
        body = client.get("/api/fund-catalogue").json()
        assert body["count"] == 2
        assert [f["name"] for f in body["funds"]] == ["Alpha Money Market Fund", "Zulu Top 40 Index ETF"]

    def test_the_page_states_how_the_list_was_chosen(self, client):
        body = client.get("/api/fund-catalogue").json()
        assert "largest funds by fund size" in body["inclusion_rule"]
        assert "not a licensed financial services provider" in body["not_licensed"]
        assert "medium- to long-term" in body["disclaimer"]

    def test_a_fund_carries_its_published_facts(self, client):
        body = client.get("/api/fund-catalogue").json()
        fund = next(f for f in body["funds"] if f["isin"] == "ZAE000000001")
        assert fund["risk_label"] == "Low"
        assert fund["risk_level"] == 1
        assert fund["ter"] == 0.57
        assert fund["as_of"] == "2026-07-31"
        assert fund["has_factsheet"] is True
        assert fund["platforms"] == ["EasyEquities"]

    def test_a_fund_without_a_published_risk_label_says_so(self, client):
        # It is in the catalogue, it can never be matched, and the page states
        # the reason rather than leaving a blank cell.
        body = client.get("/api/fund-catalogue").json()
        etf = next(f for f in body["funds"] if f["isin"] == "ZAE000027108")
        assert etf["risk_level"] is None
        assert "does not publish" in etf["risk_note"]

    def test_a_filter_narrows_the_list(self, client):
        body = client.get("/api/fund-catalogue", params={"vehicle": "etf"}).json()
        assert [f["name"] for f in body["funds"]] == ["Zulu Top 40 Index ETF"]

    def test_a_tax_free_filter_narrows_the_list(self, client):
        body = client.get("/api/fund-catalogue", params={"tfsa": "true"}).json()
        assert [f["name"] for f in body["funds"]] == ["Zulu Top 40 Index ETF"]

    def test_an_unknown_vehicle_is_rejected_not_ignored(self, client):
        assert client.get("/api/fund-catalogue", params={"vehicle": "bond"}).status_code == 422


class TestMeta:
    def test_meta_is_not_swallowed_by_the_fund_id_route(self, client):
        body = client.get("/api/fund-catalogue/meta").json()
        assert "tree" in body

    def test_it_returns_the_classification_and_the_scale(self, client):
        body = client.get("/api/fund-catalogue/meta").json()
        assert body["asisa_version"] == "2025-10-01"
        assert body["tree"]["South African"]["Interest Bearing"]
        assert len(body["risk_scale"]) == 5
        assert {v["value"] for v in body["vehicles"]} == {"unit_trust", "etf"}

    def test_each_vehicle_carries_its_explainer(self, client):
        body = client.get("/api/fund-catalogue/meta").json()
        for vehicle in body["vehicles"]:
            assert vehicle["note"]

    def test_the_header_answers_market_and_currency(self, client):
        header = client.get("/api/fund-catalogue/meta").json()["header"]
        assert "rand" in header["strip"].lower()


class TestFundDetail:
    def test_one_fund_comes_back_with_its_sheet_and_history(self, client):
        body = client.get("/api/fund-catalogue/f-mm").json()
        assert body["isin"] == "ZAE000000001"
        assert body["snapshot"]["as_of"] == "2026-07-31"
        assert body["snapshot_history"]
        assert body["mdd_url"].startswith("https://alpha.invalid")

    def test_the_explanation_is_built_from_the_sheet(self, client):
        body = client.get("/api/fund-catalogue/f-mm").json()
        why = body["why_this_appears"]
        assert "What it is:" in why
        assert "0.58" in why  # the published total charge
        assert "31 July 2026" in why

    def test_availability_is_stated_as_a_fact(self, client):
        body = client.get("/api/fund-catalogue/f-mm").json()
        assert body["available_on"] == "Available on EasyEquities."

    def test_an_unknown_fund_is_a_404(self, client):
        assert client.get("/api/fund-catalogue/nope").status_code == 404


class TestMatches:
    def test_an_emergency_fund_matches_only_accessible_money(self, client):
        body = client.get("/api/fund-catalogue/matches").json()
        assert body["profile_found"] is True
        assert [m["name"] for m in body["matches"]] == ["Alpha Money Market Fund"]
        assert body["bracket"]["effective"] == "Conservative"

    def test_the_etf_without_a_risk_label_is_never_matched(self, client):
        body = client.get("/api/fund-catalogue/matches").json()
        assert "Zulu Top 40 Index ETF" not in [m["name"] for m in body["matches"]]

    def test_every_match_carries_a_reason_naming_its_sources(self, client):
        body = client.get("/api/fund-catalogue/matches").json()
        reason = body["matches"][0]["reason"]
        assert "Alpha Collective Investments (RF) (Pty) Ltd" in reason
        assert "South African - Interest Bearing - Money Market" in reason
        assert "31 July 2026" in reason
        assert "This is information, not advice." in reason

    def test_the_bracket_explains_what_the_profile_resolved_to(self, client):
        bracket = client.get("/api/fund-catalogue/matches").json()["bracket"]
        assert bracket["risk_tolerance"] == "Conservative"
        assert bracket["ceiling"] == 2
        assert bracket["purpose"] == "emergency_fund"
        assert bracket["horizon_years"] == 2
        assert any(c["name"].endswith("Money Market") for c in bracket["categories"])

    def test_a_user_with_no_profile_gets_an_explanation_not_an_error(self):
        # An admin who never onboarded. A 500 or a bare empty list would both be
        # worse than saying what to do about it.
        response = TestClient(build_app(user_rows=[])).get("/api/fund-catalogue/matches")
        assert response.status_code == 200
        body = response.json()
        assert body["profile_found"] is False
        assert body["matches"] == []
        assert "Complete the investor profile" in body["notice"]

    def test_a_profile_without_goals_says_it_used_risk_only(self):
        app = build_app(user_rows=[{"risk_tolerance": "Conservative", "survey_answers": {}}])
        body = TestClient(app).get("/api/fund-catalogue/matches").json()
        assert body["fallback_risk_only"] is True
        assert "Add your time horizon" in body["notice"]

    def test_matches_is_not_swallowed_by_the_fund_id_route(self, client):
        # A path parameter declared before a literal one turns this into a 404
        # for a fund called "matches", which is a confusing way to lose a route.
        assert client.get("/api/fund-catalogue/matches").status_code == 200


class TestAuthentication:
    def test_matches_requires_a_bearer_token(self, anonymous_client):
        # The real dependency, not an override: the id must come from the token
        # and never from a parameter, because the backend bypasses row-level
        # security and a user_id argument would expose everyone's matches.
        response = anonymous_client.get("/api/fund-catalogue/matches")
        assert response.status_code == 401
        assert "Authorization" in response.json()["detail"]

    def test_browsing_needs_no_token(self, anonymous_client):
        assert anonymous_client.get("/api/fund-catalogue").status_code == 200
        assert anonymous_client.get("/api/fund-catalogue/meta").status_code == 200

    def test_there_is_no_user_id_parameter_to_abuse(self):
        for route in router.routes:
            if getattr(route, "path", "") == "/api/fund-catalogue/matches":
                assert "user_id" not in {p.get("name") for p in (route.openapi_extra or {}).get("parameters", [])}
                assert "{user_id}" not in route.path
