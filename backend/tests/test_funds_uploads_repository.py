"""Tests for the uploaded-fund repository (src/funds/uploads.py).

The fake client records rather than simulates, so these assert the things that
break silently against a real database: which table, which filters, and above
all that every query on a reader's rows is filtered by that reader.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fund_fakes import FakeClient  # noqa: E402

from src.funds.uploads import UploadedFundRepository  # noqa: E402

USER = "user-1"
OTHER = "user-2"


def repo(rows=None, raises=False):
    client = FakeClient(rows=rows, raises=raises)
    return UploadedFundRepository(client=client), client


def owner_filtered(client, table):
    return ("user_id", USER) in client.filters_on(table)


class TestEveryQueryIsTheReadersOwn:
    """The backend holds the service-role key, so the owner filter is the only
    thing between one reader's request and another reader's fund."""

    def test_listing(self):
        r, client = repo({"uploaded_funds": [{"id": "f1", "user_id": USER}]})
        r.list_funds(USER)
        assert owner_filtered(client, "uploaded_funds")
        assert owner_filtered(client, "uploaded_fund_sheets")

    def test_fetching_one(self):
        r, client = repo({"uploaded_funds": [{"id": "f1", "user_id": USER}]})
        r.get_fund(USER, "f1")
        assert ("id", "f1") in client.filters_on("uploaded_funds")
        assert owner_filtered(client, "uploaded_funds")
        assert owner_filtered(client, "uploaded_fund_sheets")

    def test_another_readers_fund_is_not_found(self):
        r, _ = repo({"uploaded_funds": [{"id": "f1", "user_id": OTHER}]})
        assert r.get_fund(USER, "f1") is None

    def test_finding_by_isin(self):
        r, client = repo()
        r.find_by_isin(USER, "ZAE000165205")
        assert owner_filtered(client, "uploaded_funds")

    def test_updating(self):
        r, client = repo()
        r.update_fund(USER, "f1", {"name": "A fund"})
        assert owner_filtered(client, "uploaded_funds")

    def test_deleting(self):
        r, client = repo()
        r.delete_fund(USER, "f1")
        assert client.ops_on("uploaded_funds")[0] == "delete"
        assert ("id", "f1") in client.filters_on("uploaded_funds")
        assert owner_filtered(client, "uploaded_funds")

    def test_counting_todays_uploads(self):
        r, client = repo()
        r.reads_since(USER, datetime.datetime(2026, 10, 12, tzinfo=datetime.timezone.utc))
        assert owner_filtered(client, "fact_sheet_reads")


class TestFunds:
    def test_each_fund_carries_its_newest_sheet(self):
        r, _ = repo({
            "uploaded_funds": [{"id": "f1", "user_id": USER}, {"id": "f2", "user_id": USER}],
            "uploaded_fund_sheets": [
                {"id": "s-new", "uploaded_fund_id": "f1", "user_id": USER, "as_of": "2026-09-30"},
                {"id": "s-old", "uploaded_fund_id": "f1", "user_id": USER, "as_of": "2026-08-31"},
            ],
        })
        funds = {f["id"]: f for f in r.list_funds(USER)}
        assert funds["f1"]["sheet"]["id"] == "s-new"
        assert funds["f2"]["sheet"] is None

    def test_a_fund_row_takes_identity_fields_only(self):
        r, client = repo()
        r.create_fund(USER, {"name": "A fund", "isin": "ZAE1", "user_id": OTHER, "id": "forged"})
        payload = client.payloads_on("uploaded_funds")[0]
        assert payload["user_id"] == USER
        assert "id" not in payload
        assert payload["name"] == "A fund"

    def test_an_update_cannot_move_a_fund_to_another_reader(self):
        r, client = repo()
        r.update_fund(USER, "f1", {"name": "Renamed", "user_id": OTHER})
        payload = client.payloads_on("uploaded_funds")[0]
        assert "user_id" not in payload and payload["name"] == "Renamed"

    def test_confirming_the_same_sheet_twice_replaces_it(self):
        r, client = repo()
        r.add_sheet(USER, "f1", {"as_of": "2026-08-31", "file_sha256": "abc", "figures": {}, "provenance": {}})
        name, _args, kw = client.calls_on("uploaded_fund_sheets")[0]
        assert name == "upsert"
        assert kw["on_conflict"] == "uploaded_fund_id,as_of,file_sha256"
        assert client.payloads_on("uploaded_fund_sheets")[0]["user_id"] == USER


class TestReadingCache:
    def test_a_cached_answer_is_found_by_document_model_and_prompt(self):
        r, client = repo({"fact_sheet_readings": [
            {"file_sha256": "abc", "model": "m", "prompt_version": "2", "is_fact_sheet": True, "payload": {"x": 1}},
        ]})
        assert r.cached_reading("abc", "m", "2")["payload"] == {"x": 1}
        assert ("prompt_version", "2") in client.filters_on("fact_sheet_readings")

    def test_nothing_is_kept_from_a_document_that_is_not_a_fact_sheet(self):
        r, client = repo()
        r.store_reading("abc", "m", "2", is_fact_sheet=False, payload={"readings": ["private"]}, tokens={})
        assert client.payloads_on("fact_sheet_readings")[0]["payload"] is None


class TestFailures:
    def test_a_failed_read_degrades(self):
        r, _ = repo(raises=True)
        assert r.list_funds(USER) == []
        assert r.get_fund(USER, "f1") is None

    def test_a_failed_count_refuses_rather_than_allows(self):
        r, _ = repo(raises=True)
        assert r.reads_since(USER, datetime.datetime.now(datetime.timezone.utc)) >= 10**6

    def test_a_failed_write_raises(self):
        r, _ = repo(raises=True)
        with pytest.raises(Exception):
            r.add_sheet(USER, "f1", {"as_of": "2026-08-31", "file_sha256": "abc", "figures": {}, "provenance": {}})
