"""Tests for uploading a fact sheet (src/funds/upload_service.py, upload_routes.py).

The claims, in order of what would hurt most if broken:

  * a value the reader flagged cannot be saved unless the person confirmed or
    changed it, whatever the request says;
  * the record of who set each value comes from the signed review, not from the
    request, and a review cannot be forged, reused by someone else, or kept
    forever;
  * the limits refuse a bad file before it costs a model call, and the same
    document is only paid for once;
  * one reader's funds are not reachable by another.

Gemini is a fake and the PDFs are made on the spot; the repository is an
in-memory stand-in, because these are tests of the flow. The repository's own
queries are tested in test_funds_uploads_repository.py.
"""

from __future__ import annotations

import datetime
import functools
import json
import sys
import uuid
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds.reading import FIELDS, PROMPT_VERSION, GeminiFactsheetReader, ReadingError  # noqa: E402
from src.funds.risk_scale import normalize as risk_level_of  # noqa: E402
from src.funds.upload_routes import get_upload_service, mount_fund_uploads, router  # noqa: E402
from src.funds.routes import current_user_id  # noqa: E402
from src.funds.upload_service import FactSheetUploadService, UploadError, sign, verify  # noqa: E402

fitz = pytest.importorskip("fitz")

USER = "user-1"
OTHER = "user-2"
KEY = b"test-key"
NOW = datetime.datetime(2026, 10, 12, 9, 0, tzinfo=datetime.timezone.utc)

SHEET_TEXT = """Example Balanced Fund (A)  Minimum Disclosure Document  31 August 2026
ISIN: ZAE000123456
ASISA category: South African - Multi Asset - High Equity
Total expense ratio (TER) 1.15%
Transaction costs (TC) 0.18%
Total investment charge (TIC) 1.33%
Risk profile: Low  Low-Moderate  Moderate  Moderate-High  High"""


@functools.lru_cache(maxsize=None)
def pdf(text: str = SHEET_TEXT, pages: int = 1) -> bytes:
    # Cached: each build stamps a new document id, and the same sheet uploaded
    # twice must be the same bytes for the cache tests to mean anything.
    doc = fitz.open()
    for _ in range(pages):
        doc.new_page().insert_text((56, 72), text, fontsize=10)
    return doc.tobytes()


def reading(field, value, quote, **extra):
    return {"field": field, "value": value, "quote": quote, "page": 1,
            "source": extra.get("source", "text"), "certainty": extra.get("certainty", "sure")}


def answer(**overrides):
    readings = {
        "fund_name": reading("fund_name", "Example Balanced Fund (A)", "Example Balanced Fund (A)"),
        "as_of": reading("as_of", "2026-08-31", "Minimum Disclosure Document 31 August 2026"),
        "isin": reading("isin", "ZAE000123456", "ISIN: ZAE000123456"),
        "asisa_category": reading("asisa_category", "South African - Multi Asset - High Equity",
                                  "ASISA category: South African - Multi Asset - High Equity"),
        "ter": reading("ter", "1.15", "Total expense ratio (TER) 1.15%"),
        "tc": reading("tc", "0.18", "Transaction costs (TC) 0.18%"),
        "tic": reading("tic", "1.33", "Total investment charge (TIC) 1.33%"),
        # Read off a shaded scale: always a "check".
        "risk_indicator_raw": reading("risk_indicator_raw", "Moderate - High",
                                      "Low Low-Moderate Moderate Moderate-High High", source="graphic"),
    }
    readings.update(overrides)
    return {"is_fact_sheet": True, "readings": [r for r in readings.values() if r is not None],
            "unresolved": [{"field": "fee_period", "reason": "the sheet does not say"}]}


# ── fakes ───────────────────────────────────────────────────────────────────

class FakeGemini:
    def __init__(self, payload):
        self.models = self
        self.payload = payload
        self.calls = 0

    def generate_content(self, model, contents, config):
        self.calls += 1
        payload = self.payload
        return type("R", (), {
            "text": json.dumps(payload),
            "usage_metadata": type("U", (), {"prompt_token_count": 1100, "candidates_token_count": 300,
                                             "thoughts_token_count": 250})(),
        })()


class BrokenReader(GeminiFactsheetReader):
    def ask(self, document):
        raise ReadingError("Gemini refused the request (503): busy")


class MemoryRepository:
    """The UploadedFundRepository interface, in memory, owner-checked like the real one."""

    def __init__(self):
        self.readings: dict[tuple, dict] = {}
        self.reads: list[dict] = []
        self.funds: dict[str, dict] = {}
        self.sheets: list[dict] = []

    def cached_reading(self, sha, model, version):
        return self.readings.get((sha, model, version))

    def store_reading(self, sha, model, version, is_fact_sheet, payload, tokens):
        self.readings[(sha, model, version)] = {
            "is_fact_sheet": is_fact_sheet, "payload": payload if is_fact_sheet else None, "tokens": tokens,
        }

    def reads_since(self, user_id, since):
        return sum(1 for r in self.reads if r["user_id"] == user_id and r["at"] >= since)

    def record_read(self, user_id, sha, cached):
        self.reads.append({"user_id": user_id, "sha": sha, "cached": cached, "at": NOW})

    def list_funds(self, user_id):
        return [dict(f, sheet=self._sheets(user_id, f["id"])[:1] or None) for f in self.funds.values()
                if f["user_id"] == user_id]

    def _sheets(self, user_id, fund_id):
        rows = [s for s in self.sheets if s["uploaded_fund_id"] == fund_id and s["user_id"] == user_id]
        return sorted(rows, key=lambda s: s["as_of"], reverse=True)

    def get_fund(self, user_id, fund_id):
        fund = self.funds.get(fund_id)
        if fund is None or fund["user_id"] != user_id:
            return None
        return dict(fund, sheets=self._sheets(user_id, fund_id))

    def find_by_isin(self, user_id, isin):
        return next((f for f in self.funds.values() if f["user_id"] == user_id and f["isin"] == isin), None)

    def find_by_name(self, user_id, name):
        return next((f for f in self.funds.values()
                     if f["user_id"] == user_id and f["name"] == name and f["isin"] is None), None)

    def create_fund(self, user_id, identity):
        row = {"id": str(uuid.uuid4()), "user_id": user_id, **identity}
        self.funds[row["id"]] = row
        return row

    def update_fund(self, user_id, fund_id, identity):
        if self.funds.get(fund_id, {}).get("user_id") == user_id:
            self.funds[fund_id].update(identity)

    def add_sheet(self, user_id, fund_id, sheet):
        self.sheets = [s for s in self.sheets if not (
            s["uploaded_fund_id"] == fund_id and s["as_of"] == sheet["as_of"] and s["file_sha256"] == sheet["file_sha256"])]
        row = {"uploaded_fund_id": fund_id, "user_id": user_id, **sheet}
        self.sheets.append(row)
        return row

    def delete_fund(self, user_id, fund_id):
        if self.funds.get(fund_id, {}).get("user_id") == user_id:
            del self.funds[fund_id]
            self.sheets = [s for s in self.sheets if s["uploaded_fund_id"] != fund_id]


def service(payload=None, reader=None, repo=None, **kw):
    gemini = FakeGemini(payload if payload is not None else answer())
    svc = FactSheetUploadService(
        repository=repo or MemoryRepository(),
        reader=reader or GeminiFactsheetReader(model="fake-model", client=gemini),
        key=KEY,
        now=lambda: NOW,
        **kw,
    )
    return svc, gemini


def by_field(result):
    return {f["field"]: f for f in result["fields"]}


def accept_all(result, **changes):
    """What a review screen sends when the person accepts everything as read and
    ticks every flagged field, with ``changes`` applied on top."""
    values = {f["field"]: f["value"] for f in result["fields"] if f["status"] != "missing"}
    values.update(changes)
    confirmed = [f["field"] for f in result["fields"] if f["status"] == "check"]
    return values, confirmed


# ── the file ────────────────────────────────────────────────────────────────

class TestTheFileIsCheckedBeforeAnythingIsSpent:
    @pytest.mark.parametrize("document,status", [
        (b"", 400),
        (b"GIF89a not a pdf at all", 415),
        (b"%PDF-1.4 and then nothing a PDF reader can open", 400),
    ])
    def test_a_file_that_is_not_a_usable_pdf(self, document, status):
        svc, gemini = service()
        with pytest.raises(UploadError) as e:
            svc.read(USER, document)
        assert e.value.status == status
        assert gemini.calls == 0
        assert svc.repository.reads == []

    def test_a_file_over_the_size_limit(self):
        svc, gemini = service(max_bytes=1000)
        with pytest.raises(UploadError) as e:
            svc.read(USER, pdf())
        assert e.value.status == 413
        assert gemini.calls == 0

    def test_a_document_with_too_many_pages(self):
        svc, gemini = service(max_pages=3)
        with pytest.raises(UploadError) as e:
            svc.read(USER, pdf(pages=4))
        assert e.value.status == 413 and "4 pages" in e.value.detail["message"]
        assert gemini.calls == 0

    def test_a_password_protected_pdf(self):
        doc = fitz.open()
        doc.new_page().insert_text((56, 72), SHEET_TEXT)
        locked = doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="owner")
        svc, gemini = service()
        with pytest.raises(UploadError) as e:
            svc.read(USER, locked)
        assert e.value.status == 400 and "password" in e.value.detail["message"]
        assert gemini.calls == 0


class TestTheDailyLimit:
    def test_refuses_once_the_limit_is_reached_without_a_model_call(self):
        svc, gemini = service(per_day=2)
        svc.read(USER, pdf())
        svc.read(USER, pdf("A different sheet " + SHEET_TEXT))
        with pytest.raises(UploadError) as e:
            svc.read(USER, pdf("A third sheet " + SHEET_TEXT))
        assert e.value.status == 429
        assert gemini.calls == 2

    def test_one_readers_uploads_do_not_count_against_another(self):
        svc, _ = service(per_day=1)
        svc.read(USER, pdf())
        svc.read(OTHER, pdf())

    def test_a_failed_model_call_is_not_counted(self):
        svc, _ = service(reader=BrokenReader(model="fake-model"))
        with pytest.raises(UploadError) as e:
            svc.read(USER, pdf())
        assert e.value.status == 502
        assert svc.repository.reads == []


# ── reading ─────────────────────────────────────────────────────────────────

class TestReading:
    def test_every_field_comes_back_in_order_with_a_status(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        assert [f["field"] for f in result["fields"]] == list(FIELDS)
        fields = by_field(result)
        assert fields["ter"]["status"] == "confirmed"
        assert fields["ter"]["value"] == 1.15
        assert fields["ter"]["quote"] == "Total expense ratio (TER) 1.15%"
        assert fields["risk_indicator_raw"]["status"] == "check"
        assert fields["fee_period"]["status"] == "missing"
        assert result["counts"]["check"] >= 1
        assert result["cached"] is False
        assert result["model"] == "fake-model" and result["prompt_version"] == PROMPT_VERSION

    def test_the_same_document_is_only_paid_for_once(self):
        repo = MemoryRepository()
        svc, gemini = service(repo=repo)
        first = svc.read(USER, pdf())
        second = svc.read(OTHER, pdf())
        assert gemini.calls == 1
        assert second["cached"] is True
        assert [f["status"] for f in second["fields"]] == [f["status"] for f in first["fields"]]
        assert [r["cached"] for r in repo.reads] == [False, True]

    def test_a_document_that_is_not_a_fact_sheet_is_refused_and_nothing_of_it_kept(self):
        repo = MemoryRepository()
        svc, _ = service({"is_fact_sheet": False, "readings": [], "unresolved": []}, repo=repo)
        with pytest.raises(UploadError) as e:
            svc.read(USER, pdf("TAX INVOICE no. 20391"))
        assert e.value.status == 422
        (cached,) = repo.readings.values()
        assert cached["is_fact_sheet"] is False and cached["payload"] is None
        # And the cached verdict is replayed, not re-asked.
        with pytest.raises(UploadError):
            svc.read(USER, pdf("TAX INVOICE no. 20391"))

    def test_a_plausible_wrong_number_with_a_real_quote_goes_to_a_person(self):
        text = SHEET_TEXT.replace("(TER) 1.15%", "(TER) 146%")
        svc, _ = service(answer(ter=reading("ter", "146", "Total expense ratio (TER) 146%")))
        fields = by_field(svc.read(USER, pdf(text)))
        assert fields["ter"]["status"] == "check"
        assert any("plausible range" in r for r in fields["ter"]["reasons"])

    def test_says_when_the_reader_already_has_this_fund(self):
        repo = MemoryRepository()
        existing = repo.create_fund(USER, {"name": "Example Balanced Fund", "isin": "ZAE000123456"})
        svc, _ = service(repo=repo)
        assert svc.read(USER, pdf())["existing_fund"] == {"id": existing["id"], "name": "Example Balanced Fund"}
        assert svc.read(OTHER, pdf())["existing_fund"] is None

    def test_refuses_when_there_is_no_signing_key(self):
        svc, gemini = service()
        svc.key = None
        with pytest.raises(UploadError) as e:
            svc.read(USER, pdf())
        assert e.value.status == 503 and gemini.calls == 0


# ── the review token ────────────────────────────────────────────────────────

@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
class TestTheReviewToken:
    def test_round_trips(self):
        assert verify(sign({"a": 1}, KEY), KEY) == {"a": 1}

    @pytest.mark.parametrize("token", ["", "v1.abc", "v1.abc.def", "v2.e30.AAAA", "not-a-token"])
    def test_rubbish_is_not_a_token(self, token):
        assert verify(token, KEY) is None

    def test_a_changed_claim_breaks_the_signature(self):
        token = sign({"sub": USER}, KEY)
        _, body, mac = token.split(".")
        forged = sign({"sub": OTHER}, b"someone else's key").split(".")[1]
        assert verify(f"v1.{forged}.{mac}", KEY) is None

    def test_another_readers_review_cannot_be_saved(self):
        svc, _ = service()
        result = svc.read(OTHER, pdf())
        values, confirmed = accept_all(result)
        with pytest.raises(UploadError) as e:
            svc.save(USER, result["review_token"], values, confirmed)
        assert e.value.status == 400

    def test_an_expired_review_cannot_be_saved(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        svc.now = lambda: NOW + datetime.timedelta(hours=25)
        values, confirmed = accept_all(result)
        with pytest.raises(UploadError) as e:
            svc.save(USER, result["review_token"], values, confirmed)
        assert e.value.status == 410


# ── saving ──────────────────────────────────────────────────────────────────

@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
class TestAFlaggedValueNeedsADecision:
    def test_it_cannot_be_saved_unconfirmed(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        values, _ = accept_all(result)
        with pytest.raises(UploadError) as e:
            svc.save(USER, result["review_token"], values, confirmed=[])
        assert e.value.status == 422
        assert "risk_indicator_raw" in e.value.detail["needs_review"]
        assert svc.repository.funds == {}

    def test_leaving_it_out_is_not_a_decision(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        values, _ = accept_all(result)
        del values["risk_indicator_raw"]
        with pytest.raises(UploadError) as e:
            svc.save(USER, result["review_token"], values, confirmed=[])
        assert e.value.detail["needs_review"] == ["risk_indicator_raw"]

    def test_confirming_it_saves_it_as_the_models_reading(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        saved = svc.save(USER, result["review_token"], *accept_all(result))
        sheet = saved["fund"]["sheets"][0]
        assert sheet["figures"]["risk_indicator_raw"] == "Moderate - High"
        assert sheet["provenance"]["risk_indicator_raw"]["read"] == "check"
        assert sheet["provenance"]["risk_indicator_raw"]["by"] == "model"

    def test_changing_it_is_a_decision_recorded_as_the_persons(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        values, confirmed = accept_all(result, risk_indicator_raw="High")
        saved = svc.save(USER, result["review_token"], values, confirmed=[c for c in confirmed if c != "risk_indicator_raw"])
        provenance = saved["fund"]["sheets"][0]["provenance"]["risk_indicator_raw"]
        assert provenance["by"] == "person"
        assert provenance["model_value"] == "Moderate - High"
        assert saved["fund"]["sheets"][0]["figures"]["risk_indicator_1to5"] == risk_level_of("High")

    def test_clearing_it_is_a_decision_too(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        values, confirmed = accept_all(result, risk_indicator_raw=None)
        saved = svc.save(USER, result["review_token"], values, confirmed=[c for c in confirmed if c != "risk_indicator_raw"])
        sheet = saved["fund"]["sheets"][0]
        assert "risk_indicator_raw" not in sheet["figures"]
        assert sheet["provenance"]["risk_indicator_raw"]["by"] is None
        assert sheet["provenance"]["risk_indicator_raw"]["model_value"] == "Moderate - High"


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
class TestWhatIsSaved:
    def test_identity_on_the_fund_and_figures_under_the_catalogues_names(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        saved = svc.save(USER, result["review_token"], *accept_all(result), vehicle="unit_trust", fund_house="Example")
        fund = saved["fund"]
        assert fund["name"] == "Example Balanced Fund (A)"
        assert fund["isin"] == "ZAE000123456"
        assert fund["asisa_category"] == "South African - Multi Asset - High Equity"
        assert fund["vehicle"] == "unit_trust" and fund["fund_house"] == "Example"
        sheet = fund["sheets"][0]
        assert sheet["as_of"] == "2026-08-31"
        assert sheet["figures"]["ter"] == 1.15 and sheet["figures"]["tic"] == 1.33
        assert sheet["figures"]["risk_indicator_1to5"] == risk_level_of("Moderate - High")
        assert "fund_name" not in sheet["figures"] and "isin" not in sheet["figures"]
        assert sheet["file_sha256"] == result["file_sha256"]
        assert sheet["model"] == "fake-model" and sheet["prompt_version"] == PROMPT_VERSION

    def test_provenance_comes_from_the_review_not_the_request(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        saved = svc.save(USER, result["review_token"], *accept_all(result, ter="1.20"))
        ter = saved["fund"]["sheets"][0]["provenance"]["ter"]
        assert ter == {"read": "confirmed", "by": "person", "quote": "Total expense ratio (TER) 1.15%",
                       "page": 1, "source": "text", "model_value": 1.15}
        tc = saved["fund"]["sheets"][0]["provenance"]["tc"]
        assert tc["by"] == "model" and "model_value" not in tc

    def test_a_field_the_sheet_did_not_state_can_be_typed(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        saved = svc.save(USER, result["review_token"], *accept_all(result, fee_period="1y"))
        sheet = saved["fund"]["sheets"][0]
        assert sheet["figures"]["fee_period"] == "1y"
        assert sheet["provenance"]["fee_period"]["read"] == "missing"
        assert sheet["provenance"]["fee_period"]["by"] == "person"

    def test_warnings_are_returned_not_blocking(self):
        svc, _ = service()
        result = svc.read(USER, pdf())
        saved = svc.save(USER, result["review_token"], *accept_all(result))
        assert any(w["field"] == "fee_period" for w in saved["warnings"])


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
class TestWhatIsRefused:
    def save(self, **changes):
        svc, _ = service()
        result = svc.read(USER, pdf())
        with pytest.raises(UploadError) as e:
            svc.save(USER, result["review_token"], *accept_all(result, **changes))
        assert e.value.status == 422
        assert svc.repository.funds == {}
        return e.value.detail

    def test_a_value_that_is_not_a_number(self):
        assert "ter" in self.save(ter="about one percent")["fields"]

    def test_no_as_at_date(self):
        assert self.save(as_of=None)["fields"]["as_of"] == "is required"

    def test_no_name(self):
        assert self.save(fund_name="  ")["fields"]["fund_name"] == "is required"

    def test_a_sheet_dated_in_the_future(self):
        assert "as_of" in self.save(as_of="2027-01-31")["fields"]

    def test_a_malformed_isin(self):
        assert "isin" in self.save(isin="ZA12")["fields"]

    def test_a_field_that_is_not_a_field(self):
        assert self.save(favourite_colour="green")["fields"] == {"favourite_colour": "not a field"}


class TestTheReadersList:
    def test_a_second_sheet_for_the_same_isin_extends_the_fund(self):
        repo = MemoryRepository()
        svc, _ = service(repo=repo)
        first = svc.read(USER, pdf())
        svc.save(USER, first["review_token"], *accept_all(first))
        later_text = SHEET_TEXT.replace("31 August 2026", "30 September 2026")
        svc2, _ = service(answer(
            as_of=reading("as_of", "2026-09-30", "Minimum Disclosure Document 30 September 2026"),
            fund_name=reading("fund_name", "Example Balanced Fund (A)", "Example Balanced Fund (A)"),
        ), repo=repo)
        second = svc2.read(USER, pdf(later_text))
        svc2.save(USER, second["review_token"], *accept_all(second, fund_name="Example Balanced Fund A"))
        assert len(repo.funds) == 1
        (fund,) = repo.funds.values()
        assert fund["name"] == "Example Balanced Fund A"
        assert [s["as_of"] for s in repo._sheets(USER, fund["id"])] == ["2026-09-30", "2026-08-31"]

    def test_an_older_sheet_uploaded_later_does_not_rename_the_fund(self):
        repo = MemoryRepository()
        fund = repo.create_fund(USER, {"name": "Newest Name", "isin": "ZAE000123456"})
        repo.add_sheet(USER, fund["id"], {"as_of": "2026-09-30", "file_sha256": "x", "figures": {}, "provenance": {}})
        svc, _ = service(repo=repo)
        result = svc.read(USER, pdf())
        svc.save(USER, result["review_token"], *accept_all(result))
        assert repo.funds[fund["id"]]["name"] == "Newest Name"
        assert len(repo._sheets(USER, fund["id"])) == 2

    def test_a_fund_without_an_isin_is_matched_by_name(self):
        repo = MemoryRepository()
        svc, _ = service(answer(isin=None), repo=repo)
        for _ in range(2):
            result = svc.read(USER, pdf())
            svc.save(USER, result["review_token"], *accept_all(result))
        assert len(repo.funds) == 1

    def test_another_readers_fund_is_not_found_or_deleted(self):
        repo = MemoryRepository()
        theirs = repo.create_fund(OTHER, {"name": "Theirs", "isin": None})
        svc, _ = service(repo=repo)
        assert svc.get_fund(USER, theirs["id"]) is None
        assert svc.delete_fund(USER, theirs["id"]) is False
        assert theirs["id"] in repo.funds
        assert svc.list_funds(USER) == []

    def test_an_id_that_is_not_a_uuid_is_simply_not_found(self):
        svc, _ = service()
        assert svc.get_fund(USER, "'; drop table uploaded_funds; --") is None


# ── HTTP ────────────────────────────────────────────────────────────────────

@pytest.fixture
def api():
    svc, gemini = service()
    app = FastAPI()
    mount_fund_uploads(app, enabled=True)
    app.dependency_overrides[current_user_id] = lambda: USER
    app.dependency_overrides[get_upload_service] = lambda: svc
    return TestClient(app), svc


class TestHttp:
    def test_off_unless_enabled(self):
        app = FastAPI()
        assert mount_fund_uploads(app) is False
        assert TestClient(app).get("/api/fund-uploads").status_code == 404

    @pytest.mark.smoke  # tier: smoke -- one happy path per file (TESTING.md, 'Tiers')
    def test_a_round_trip(self, api):
        client, _ = api
        read = client.post("/api/fund-uploads/read", files={"file": ("sheet.pdf", pdf(), "application/pdf")})
        assert read.status_code == 200
        body = read.json()
        values, confirmed = accept_all(body)
        saved = client.post("/api/fund-uploads", json={
            "review_token": body["review_token"], "values": values, "confirmed": confirmed, "vehicle": "unit_trust"})
        assert saved.status_code == 201
        fund_id = saved.json()["fund"]["id"]

        listing = client.get("/api/fund-uploads").json()
        assert [f["id"] for f in listing] == [fund_id]
        assert client.get(f"/api/fund-uploads/{fund_id}").status_code == 200
        assert client.delete(f"/api/fund-uploads/{fund_id}").status_code == 204
        assert client.get(f"/api/fund-uploads/{fund_id}").status_code == 404
        assert client.delete(f"/api/fund-uploads/{fund_id}").status_code == 404

    def test_an_upload_error_keeps_its_status_and_message(self, api):
        client, _ = api
        r = client.post("/api/fund-uploads/read", files={"file": ("a.png", b"\x89PNG....", "image/png")})
        assert r.status_code == 415
        assert "not a PDF" in r.json()["detail"]["message"]

    def test_unflagged_fields_are_listed_when_a_save_is_refused(self, api):
        client, _ = api
        body = client.post("/api/fund-uploads/read", files={"file": ("s.pdf", pdf(), "application/pdf")}).json()
        values, _ = accept_all(body)
        r = client.post("/api/fund-uploads", json={"review_token": body["review_token"], "values": values})
        assert r.status_code == 422
        assert "risk_indicator_raw" in r.json()["detail"]["needs_review"]

    def test_a_vehicle_outside_the_vocabulary_is_refused(self, api):
        client, _ = api
        r = client.post("/api/fund-uploads", json={"review_token": "x", "values": {}, "vehicle": "crypto"})
        assert r.status_code == 422

    def test_the_reader_comes_from_the_token(self):
        app = FastAPI()
        mount_fund_uploads(app, enabled=True)
        r = TestClient(app).get("/api/fund-uploads")
        assert r.status_code == 401
