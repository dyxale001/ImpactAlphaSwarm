"""The reasoning trace and Compare, for a fund a reader uploaded.

An uploaded fund goes through the same paragraph writers as a catalogue fund,
by the seams ``FundTraceService.explain_candidate`` and
``FundComparisonService.explain_candidates``. What has to hold:

  * it is never "among your matches": only catalogue funds are matched (D-153),
    and the paragraph says so in fixed words, with its risk rating set beside
    the profile's limit by the matcher's own rule;
  * nothing the sheet does not state is claimed: no "not eligible for a
    tax-free account", no "actively managed";
  * a comparison including it is written fresh and never stored;
  * one reader's fund is not reachable by another, here as everywhere.

The catalogue and the model are the trace tests' own fakes.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from test_fund_trace import USER, FakeClient, FakeFundsService, cfg  # noqa: E402
from test_funds_upload_service import MemoryRepository  # noqa: E402

from src.compare.funds_trace import FundComparisonGenerator, FundComparisonService  # noqa: E402
from src.funds.routes import current_user_id  # noqa: E402
from src.funds.trace import FundTraceGenerator, FundTraceService  # noqa: E402
from src.funds.upload_routes import get_upload_service, mount_fund_uploads  # noqa: E402
from src.funds.upload_service import UPLOAD_PREFIX, FactSheetUploadService, UploadError  # noqa: E402

OTHER = "user-2"
TODAY = datetime.date(2026, 10, 12)
NOW = datetime.datetime(2026, 10, 12, 9, tzinfo=datetime.timezone.utc)


class NoStore:
    """A comparison store that fails the test if anything touches it."""

    def __getattr__(self, name):
        raise AssertionError(f"a comparison including an upload touched the store ({name})")


class Down(FakeClient):
    """A model that is unavailable, so the fixed-sentence template is served."""

    def __init__(self):
        super().__init__(RuntimeError("model down"))


def uploads(level=3, owner=USER, **figures):
    repo = MemoryRepository()
    fund = repo.create_fund(owner, {
        "name": "Private Balanced Fund (B)",
        "isin": None,
        "jse_code": None,
        "vehicle": "unit_trust",
        "fund_house": None,
        "asisa_category": "South African - Multi Asset - High Equity",
    })
    repo.add_sheet(owner, fund["id"], {
        "as_of": "2026-08-31",
        "file_sha256": "sha",
        "figures": {
            "risk_indicator_1to5": level,
            "risk_indicator_raw": {3: "Moderate", 4: "Moderate to High"}.get(level),
            "ter": 0.95,
            "tic": 1.1,
            "recommended_min_term_years": 5,
            "benchmark": "CPI + 4%",
            **figures,
        },
        "provenance": {},
    })
    return repo, fund["id"]


def service(repo, client=None, compare_client=None):
    config = cfg()
    traces = FundTraceService(
        config=config,
        funds=FakeFundsService(),
        generator=FundTraceGenerator(config, client=client or Down()),
        today=lambda: TODAY,
        now=lambda: NOW,
    )
    comparisons = FundComparisonService(
        config=config,
        funds=FakeFundsService(),
        repository=NoStore(),
        generator=FundComparisonGenerator(config, client=compare_client or Down()),
        today=lambda: TODAY,
        now=lambda: NOW,
    )
    return FactSheetUploadService(repository=repo, key=b"k", traces=traces, comparisons=comparisons)


class TestTheCandidate:
    def test_is_shaped_like_a_catalogue_fund_and_named_as_an_upload(self):
        repo, fid = uploads()
        candidate = service(repo).candidate(USER, fid)
        assert candidate.fund["id"] == f"{UPLOAD_PREFIX}{fid}"
        assert candidate.snapshot["as_of"] == "2026-08-31"
        assert candidate.snapshot["ter"] == 0.95
        assert candidate.risk_level == 3

    def test_says_nothing_it_does_not_know(self):
        repo, fid = uploads()
        fund = service(repo).candidate(USER, fid).fund
        assert fund["tfsa_eligible"] is None and fund["is_index_tracker"] is None

    def test_is_not_another_readers(self):
        repo, fid = uploads(owner=OTHER)
        assert service(repo).candidate(USER, fid) is None


class TestTheFundsOwnTrace:
    def test_is_never_among_the_matches_and_says_why(self):
        repo, fid = uploads(level=3)
        point = service(repo).trace(USER, fid)
        assert point["available"] is True and point["source"] == "template"
        text = point["trace"]
        assert "Private Balanced Fund is not among your matches" in text
        assert "it is a fund you uploaded, and only catalogue funds are matched to a profile" in text
        # Rated 3, within a Moderate profile's 3: the matcher's own rule, stated.
        assert "within the 3 of 5 your Moderate profile allows" in text

    def test_a_rating_above_the_profile_is_said_to_be_above(self):
        repo, fid = uploads(level=4)
        assert "above the 3 of 5 your Moderate profile allows" in service(repo).trace(USER, fid)["trace"]

    def test_claims_neither_a_style_nor_a_tax_free_status_it_was_not_given(self):
        # The reader in these fixtures chose a tax-free account, so the
        # paragraph does reach the eligibility question.
        repo, fid = uploads()
        text = service(repo).trace(USER, fid)["trace"]
        assert "actively managed" not in text and "tracks" not in text
        assert "not eligible" not in text

    def test_the_model_is_given_the_same_facts(self):
        client = FakeClient("")  # an empty reply fails the guard; the prompt is what is checked
        repo, fid = uploads()
        service(repo, client=client).trace(USER, fid)
        assert "Tax-free account eligible" not in client.prompt
        assert "Actively managed" not in client.prompt and "Index tracker" not in client.prompt
        assert "- Benchmark: CPI + 4%" in client.prompt
        assert "it is a fund you uploaded" in client.prompt
        assert "has no stated eligibility for one on the fact sheet the reader uploaded" in client.prompt

    def test_another_readers_fund_gets_nothing(self):
        repo, fid = uploads(owner=OTHER)
        assert service(repo).trace(USER, fid) is None


class TestComparingWithTheCatalogue:
    def test_an_upload_beside_a_catalogue_fund(self):
        repo, fid = uploads()
        mine = f"{UPLOAD_PREFIX}{fid}"
        point = service(repo).compare(USER, [mine, "f-coro"])
        assert point["fund_ids"] == [mine, "f-coro"]
        assert point["available"] is True and point["source"] == "template"
        text = point["trace"]
        assert "Private Balanced Fund" in text and "Coronation" in text
        assert "it is a fund you uploaded" in text
        # The catalogue fund is still placed by the matcher, as on Compare.
        assert "is among your matches" in text

    @pytest.mark.parametrize("ids,status", [
        (["f-coro", "f-stx40"], 400),            # no upload: Compare's own route
        ([f"{UPLOAD_PREFIX}x"], 400),            # one fund is not a comparison
        (["a", "b", "c", "d"], 400),             # nor are four
        (["f-coro", "not-a-fund", "MINE"], 400),
    ])
    def test_refuses_a_set_that_is_not_one(self, ids, status):
        repo, _ = uploads()
        with pytest.raises(UploadError) as e:
            service(repo).compare(USER, ids)
        assert e.value.status == status

    def test_another_readers_upload_cannot_be_compared(self):
        repo, fid = uploads(owner=OTHER)
        with pytest.raises(UploadError) as e:
            service(repo).compare(USER, [f"{UPLOAD_PREFIX}{fid}", "f-coro"])
        assert e.value.status == 404

    def test_an_unknown_catalogue_fund_is_refused(self):
        repo, fid = uploads()
        with pytest.raises(UploadError) as e:
            service(repo).compare(USER, [f"{UPLOAD_PREFIX}{fid}", "f-gone"])
        assert e.value.status == 404

    def test_two_of_the_readers_own_funds(self):
        repo, first = uploads()
        second = repo.create_fund(USER, {"name": "Second Upload Fund", "isin": None, "jse_code": None,
                                         "vehicle": None, "fund_house": None,
                                         "asisa_category": "South African - Equity - SA General"})["id"]
        repo.add_sheet(USER, second, {"as_of": "2026-08-31", "file_sha256": "s2",
                                      "figures": {"ter": 1.2, "risk_indicator_1to5": 4}, "provenance": {}})
        point = service(repo).compare(USER, [f"{UPLOAD_PREFIX}{first}", f"{UPLOAD_PREFIX}{second}"])
        assert "Second Upload Fund" in point["trace"]


class TestHttp:
    @pytest.fixture
    def api(self):
        repo, fid = uploads()
        _, theirs = uploads(owner=OTHER)
        theirs_repo_fund = theirs  # a valid id that is not this reader's
        svc = service(repo)
        app = FastAPI()
        mount_fund_uploads(app, enabled=True)
        app.dependency_overrides[get_upload_service] = lambda: svc
        app.dependency_overrides[current_user_id] = lambda: USER
        return TestClient(app), fid, theirs_repo_fund

    def test_the_trace(self, api):
        http, fid, theirs = api
        body = http.post(f"/api/fund-uploads/{fid}/trace").json()
        assert body["fund_id"] == f"{UPLOAD_PREFIX}{fid}" and body["trace"]
        assert http.post(f"/api/fund-uploads/{theirs}/trace").status_code == 404

    def test_the_comparison(self, api):
        http, fid, _ = api
        r = http.post("/api/fund-uploads/compare", json={"fund_ids": [f"{UPLOAD_PREFIX}{fid}", "f-coro"]})
        assert r.status_code == 200 and r.json()["trace"]
        r = http.post("/api/fund-uploads/compare", json={"fund_ids": ["f-coro", "f-stx40"]})
        assert r.status_code == 400
