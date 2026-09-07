"""Tests for archiving a fact sheet's text beside the document.

`extracted_text_ref` has been declared in the schema since migration 024 and
never written. What makes it worth writing is narrow and worth stating: the
catalogue's claim is that every figure came off a document a manager published,
and the document proves the figure exists while the text is what makes checking
it a search rather than a reading. A manager's link can rot — one
platform-hosted sheet found during design was five years stale — and after that
our copy is the only way to re-verify an evidence quote.

The invariant these tests defend is the quiet one: **where a copy is kept is not
part of what was read.** `transcription_hash` decides whether a snapshot is a new
reading or a duplicate, and if a storage path could reach it, archiving would
silently re-key every existing row. That is not a crash — it inserts a duplicate
per fund, which is precisely the bug that once hid the Satrix 40 risk correction.
"""

from __future__ import annotations

import csv
import importlib.util
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from src.funds.repository import FundRepository  # noqa: E402

MIGRATION = BACKEND_ROOT / "migrations" / "026_mdd_text_archive.sql"
SNAPSHOTS_CSV = BACKEND_ROOT / "data" / "funds" / "snapshots.csv"


def loader():
    spec = importlib.util.spec_from_file_location(
        "_seed_loader_for_archive", BACKEND_ROOT / "scripts" / "load_fund_seed.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeStorageBucket:
    def __init__(self):
        self.uploads: list[tuple[str, bytes, dict]] = []

    def upload(self, path, payload, options):
        self.uploads.append((path, payload, options))
        return {"path": path}


class FakeStorage:
    def __init__(self):
        self.bucket = FakeStorageBucket()

    def from_(self, _name):
        return self.bucket


class FakeClient:
    def __init__(self):
        self.storage = FakeStorage()


def repo() -> FundRepository:
    """A repository whose client is a fake, so nothing reaches Supabase."""
    instance = FundRepository.__new__(FundRepository)
    instance._client = FakeClient()  # noqa: SLF001
    return instance


class TestWhereTheTextGoes:
    def test_it_sits_beside_the_pdf_and_is_named_the_same_way(self):
        assert FundRepository.mdd_object_path("ZAE000240123", "2026-07-31") == (
            "ZAE000240123/2026-07-31.pdf"
        )
        assert FundRepository.mdd_text_object_path("ZAE000240123", "2026-07-31") == (
            "ZAE000240123/2026-07-31.txt"
        )

    def test_one_path_implies_the_other_so_neither_is_stored_twice(self):
        pdf = FundRepository.mdd_object_path("X", "2026-07-31")
        text = FundRepository.mdd_text_object_path("X", "2026-07-31")
        assert pdf.rsplit(".", 1)[0] == text.rsplit(".", 1)[0]

    def test_the_path_is_deterministic_so_a_re_run_overwrites_its_own_copy(self):
        first = FundRepository.mdd_text_object_path("X", "2026-07-31")
        second = FundRepository.mdd_text_object_path("X", "2026-07-31")
        assert first == second


class TestUploading:
    def test_the_text_is_stored_as_utf8_text(self):
        one = repo()
        path = one.upload_mdd_text("ZAE1", "2026-07-31", "Portfolio Value R362 million")
        stored_path, payload, options = one.client.storage.bucket.uploads[0]
        assert path == stored_path == "ZAE1/2026-07-31.txt"
        assert payload == b"Portfolio Value R362 million"
        assert "text/plain" in options["content-type"]
        assert "utf-8" in options["content-type"]

    def test_non_ascii_survives(self):
        """Sheets carry en dashes, non-breaking spaces and the rand sign."""
        one = repo()
        one.upload_mdd_text("ZAE1", "2026-07-31", "South African – R1 234,56")
        _, payload, _ = one.client.storage.bucket.uploads[0]
        assert payload.decode("utf-8") == "South African – R1 234,56"

    def test_it_upserts_so_a_corrected_reading_replaces_the_copy(self):
        one = repo()
        one.upload_mdd_text("ZAE1", "2026-07-31", "first")
        one.upload_mdd_text("ZAE1", "2026-07-31", "second")
        assert all(o["upsert"] == "true" for _, _, o in one.client.storage.bucket.uploads)

    def test_the_pdf_goes_through_the_same_upsert_rule(self):
        one = repo()
        one.upload_mdd("ZAE1", "2026-07-31", b"%PDF-1.4")
        _, payload, options = one.client.storage.bucket.uploads[0]
        assert payload == b"%PDF-1.4"
        assert options["content-type"] == "application/pdf"
        assert options["upsert"] == "true"


class TestTheHashIgnoresWhereCopiesAreKept:
    """INVARIANT: archiving a document does not re-key the snapshot.

    REGRESSION GUARD by construction. The hash decides new-reading versus
    duplicate. Letting a storage path in would give every existing row a new
    identity, so a load after archiving would insert nineteen duplicates and
    report success.
    """

    @pytest.mark.parametrize("column", ["mdd_pdf_ref", "extracted_text_ref"])
    def test_a_storage_path_cannot_change_a_snapshot_identity(self, column):
        row = {"as_of": "2026-07-31", "ter": 0.25, "risk_indicator_raw": "Cautious"}
        without = FundRepository.transcription_hash("ZAE1", dict(row))
        with_ref = FundRepository.transcription_hash("ZAE1", {**row, column: "ZAE1/x"})
        assert without == with_ref

    def test_a_transcribed_figure_still_does(self):
        """The other half: the hash has to notice a corrected reading."""
        row = {"as_of": "2026-07-31", "ter": 0.25}
        assert FundRepository.transcription_hash(
            "ZAE1", row
        ) != FundRepository.transcription_hash("ZAE1", {**row, "ter": 0.26})

    def test_every_seeded_row_keeps_its_hash_whether_or_not_it_is_archived(self):
        """Checked across the real seed, because the cost of being wrong is 19 duplicates."""
        parse = loader().parse_snapshot
        with SNAPSHOTS_CSV.open(newline="", encoding="utf-8") as handle:
            rows = [parse(row) for row in csv.DictReader(handle)]
        assert len(rows) == 19
        for row in rows:
            isin = dict(row).pop("isin")
            base = FundRepository.transcription_hash(isin, {k: v for k, v in row.items() if k != "isin"})
            archived = FundRepository.transcription_hash(
                isin,
                {
                    **{k: v for k, v in row.items() if k != "isin"},
                    "mdd_pdf_ref": f"{isin}/2026-07-31.pdf",
                    "extracted_text_ref": f"{isin}/2026-07-31.txt",
                },
            )
            assert base == archived, isin


class TestTheLoaderArchivesTheText:
    def test_a_sheet_with_a_text_layer_gets_a_ref(self):
        module = loader()
        one = repo()
        pdf = _one_page_pdf("Total Expense Ratio (TER) 0.25")
        ref = module.archive_text(one, "ZAE1", "2026-07-31", pdf)
        assert ref == "ZAE1/2026-07-31.txt"
        _, payload, _ = one.client.storage.bucket.uploads[0]
        assert b"Total Expense Ratio" in payload

    def test_a_scanned_sheet_gets_no_ref_rather_than_an_empty_file(self):
        """A row with an empty text file is worse than a row that says nothing."""
        module = loader()
        one = repo()
        assert module.archive_text(one, "ZAE1", "2026-07-31", _one_page_pdf("")) is None
        assert one.client.storage.bucket.uploads == []

    def test_an_unreadable_document_does_not_block_the_load(self, capsys):
        """The PDF is the record; the text is a convenience for checking it."""
        module = loader()
        one = repo()
        assert module.archive_text(one, "ZAE1", "2026-07-31", b"not a pdf at all") is None
        assert "could not read the text layer" in capsys.readouterr().out

    def test_a_failed_upload_does_not_block_the_load(self, capsys):
        module = loader()
        one = repo()

        def explode(*_args, **_kwargs):
            raise RuntimeError("storage is down")

        one.client.storage.bucket.upload = explode
        assert module.archive_text(one, "ZAE1", "2026-07-31", _one_page_pdf("x y z")) is None
        assert "could not archive the text" in capsys.readouterr().out


class TestTheMigration:
    """The bucket refused text until 026, so a ref could not have been written."""

    def test_it_allows_text_alongside_pdf(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        assert "text/plain" in sql
        assert "application/pdf" in sql

    def test_it_keeps_the_bucket_private(self):
        """Users are linked to the manager's own URL; ours is only the fallback.

        Re-serving a management company's document to users is a per-ManCo terms
        question nobody has asked. Storing a copy for audit is a different act,
        and the difference is entirely this flag.
        """
        sql = MIGRATION.read_text(encoding="utf-8")
        assert "'mdd', 'mdd', false" in sql
        assert "'mdd', 'mdd', true" not in sql

    def test_it_is_guarded_so_a_re_run_is_a_no_op(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        assert "on conflict (id) do nothing" in sql


def _one_page_pdf(text: str) -> bytes:
    pymupdf = pytest.importorskip("pymupdf")
    document = pymupdf.open()
    page = document.new_page()
    if text:
        page.insert_text((72, 72), text, fontsize=11)
    out = document.tobytes()
    document.close()
    return out
