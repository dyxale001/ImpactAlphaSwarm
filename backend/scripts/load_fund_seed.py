"""Load the transcribed fund catalogue into the database.

    venv/bin/python scripts/load_fund_seed.py backend --dry-run
    venv/bin/python scripts/load_fund_seed.py backend

Reads ``data/funds/funds.csv`` and ``data/funds/snapshots.csv``, validates every
row, and writes them. Nothing is written unless every row passes: a catalogue is
read as a set of published facts, so a half-loaded one is worse than an empty
one.

Why a transcription and not a scraper. Fact-sheet content is published as PDFs,
one template per management company, and two of the fields that matter most —
the risk profile indicator and the asset allocation — are frequently GRAPHICS
rather than text. A human reads which box is highlighted. That is the honest
starting point, and it doubles as the golden set an extractor is later measured
against.

Exit codes: 0 loaded (or dry run clean), 1 a row failed validation, 2 an IO or
database error. Non-zero matters — this is how a partial load is noticed.
"""

import argparse
import csv
import hashlib
import json
import os
import sys
from pathlib import Path

BACKEND = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else Path.cwd()
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from src.funds.repository import FundRepository  # noqa: E402
from src.funds.validators import (  # noqa: E402
    as_number,
    fund_validators,
    is_blank,
    snapshot_validators,
)

DATA_DIR = BACKEND / "data" / "funds"
FUNDS_CSV = DATA_DIR / "funds.csv"
SNAPSHOTS_CSV = DATA_DIR / "snapshots.csv"
PDF_DIR = DATA_DIR / "mdd"

# Columns that are JSON objects in the CSV.
JSON_COLUMNS = ("asset_allocation", "performance", "top_holdings", "income_distribution")
# Columns that are numbers, blank meaning "the sheet does not publish it".
NUMERIC_COLUMNS = (
    "risk_indicator_1to5",
    "recommended_min_term_years",
    "ter",
    "tc",
    "tic",
    "fund_size_zar",
    "min_lump_sum",
    "min_debit_order",
    "nav_cpu",
    "annual_management_fee",
    "return_high_12m",
    "return_low_12m",
)
BOOLEAN_COLUMNS = ("is_index_tracker", "tfsa_eligible")
# Date columns on a snapshot. `as_of` is not here: it is required, so a blank is
# an error the validators must report rather than a None to write.
SNAPSHOT_DATE_COLUMNS = ("nav_date", "inception_date")
# Free text a sheet may simply not print. Blank means absent, not empty string —
# an empty string reads as "the manager published nothing here", which is a
# different claim from "we have not recorded it".
SNAPSHOT_TEXT_COLUMNS = (
    "risk_indicator_raw",
    "objective",
    "benchmark",
    "distribution_frequency",
    "entered_by",
    "fee_period",
    "return_extremes_basis",
    "risk_narrative",
    "horizon_words",
    "portfolio_manager",
)
# Booleans on a snapshot, where blank is a third state: unit trust sheets print
# Regulation 28 compliance and ETF sheets do not, so absent means "the document
# does not say", not False.
SNAPSHOT_TRISTATE_COLUMNS = ("regulation_28",)


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing")
    with path.open(newline="", encoding="utf-8") as handle:
        return [row for row in csv.DictReader(handle)]


def parse_fund(row: dict[str, str]) -> dict:
    parsed = {key: (value.strip() if isinstance(value, str) else value) for key, value in row.items()}
    for column in BOOLEAN_COLUMNS:
        parsed[column] = str(parsed.get(column, "")).strip().lower() == "true"
    platforms = parsed.get("platforms") or ""
    # Semicolon-separated, because a platform name can contain a comma.
    parsed["platforms"] = [p.strip() for p in platforms.split(";") if p.strip()]
    for column in ("jse_code", "yahoo_symbol", "mdd_page_url", "curation_rule"):
        if is_blank(parsed.get(column)):
            parsed[column] = None
    return parsed


def parse_snapshot(row: dict[str, str]) -> dict:
    parsed = {key: (value.strip() if isinstance(value, str) else value) for key, value in row.items()}
    for column in NUMERIC_COLUMNS:
        value = parsed.get(column)
        parsed[column] = None if is_blank(value) else as_number(value)
    if parsed.get("risk_indicator_1to5") is not None:
        parsed["risk_indicator_1to5"] = int(parsed["risk_indicator_1to5"])
    for column in JSON_COLUMNS:
        value = parsed.get(column)
        parsed[column] = None if is_blank(value) else json.loads(value)
    for column in SNAPSHOT_DATE_COLUMNS:
        if is_blank(parsed.get(column)):
            parsed[column] = None
    for column in SNAPSHOT_TEXT_COLUMNS:
        if is_blank(parsed.get(column)):
            parsed[column] = None
    for column in SNAPSHOT_TRISTATE_COLUMNS:
        value = parsed.get(column)
        parsed[column] = None if is_blank(value) else str(value).strip().lower() == "true"
    return parsed


def report(label: str, findings) -> bool:
    """Print findings and say whether any of them blocks a write."""
    blocking = False
    for index, problem in findings:
        marker = "ERROR" if problem.blocking else "warn "
        print(f"  {marker} {label} row {index}: {problem.field}: {problem.message}")
        blocking = blocking or problem.blocking
    return blocking


def pdf_bytes_for(isin: str, as_of: str) -> bytes | None:
    """The archived fact sheet, if one was placed alongside the CSVs."""
    candidate = PDF_DIR / isin / f"{as_of}.pdf"
    if candidate.exists():
        return candidate.read_bytes()
    return None


def archive_text(repo, isin: str, as_of: str, pdf: bytes) -> str | None:
    """Store a sheet's text layer beside its PDF, or return None saying nothing.

    Best effort on purpose. The PDF is the record and the text is a convenience
    for checking it, so a sheet whose text cannot be extracted — a scanned one,
    or one whose fonts pypdf cannot decode — should still be archived and
    recorded rather than blocking the load.
    """
    try:
        from src.funds.extract import extract_text

        text = extract_text(pdf)
    except Exception as exc:  # noqa: BLE001
        print(f"  warn  {isin}: could not read the text layer ({exc})")
        return None
    if not text.strip():
        print(f"  warn  {isin}: the document has no text layer (scanned?)")
        return None
    try:
        return repo.upload_mdd_text(isin, as_of, text)
    except Exception as exc:  # noqa: BLE001
        print(f"  warn  {isin}: could not archive the text ({exc})")
        return None


def transcription_identity(isin: str, snapshot: dict) -> str:
    """What makes one transcribed fact sheet different from another.

    Kept as a thin alias so this script reads in its own terms; the rule itself
    lives on ``FundRepository`` because the admin form records snapshots too and
    the two must not drift. See that method for why it hashes every value.
    """
    return FundRepository.transcription_hash(isin, snapshot)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Load the fund catalogue seed.")
    parser.add_argument("backend", nargs="?", default=".", help="path to the backend directory")
    parser.add_argument("--dry-run", action="store_true", help="validate and report, write nothing")
    args = parser.parse_args(argv)

    try:
        funds = [parse_fund(row) for row in read_csv(FUNDS_CSV)]
        snapshots = [parse_snapshot(row) for row in read_csv(SNAPSHOTS_CSV)]
    except (FileNotFoundError, json.JSONDecodeError, ValueError) as exc:
        print(f"Could not read the seed: {exc}")
        return 2

    print(f"Read {len(funds)} funds and {len(snapshots)} fact sheets from {DATA_DIR}")

    # ── validate everything before writing anything ─────────────────────────
    blocking = report("fund", fund_validators().check_all(funds))
    blocking = report("snapshot", snapshot_validators().check_all(snapshots)) or blocking

    known = {fund["isin"] for fund in funds}
    for index, snapshot in enumerate(snapshots, start=1):
        if snapshot.get("isin") not in known:
            print(f"  ERROR snapshot row {index}: isin: {snapshot.get('isin')!r} is not in funds.csv")
            blocking = True

    if blocking:
        print("\nNothing was written. Fix the errors above and run again.")
        return 1

    print("Every row passed validation.")

    if args.dry_run:
        for fund in funds:
            print(f"  would upsert {fund['isin']}  {fund['name']}")
        for snapshot in snapshots:
            level = snapshot.get("risk_indicator_1to5")
            label = "no published risk indicator" if level is None else f"risk {level}"
            print(f"  would record {snapshot['isin']} as at {snapshot['as_of']}  ({label})")
        return 0

    # ── write ───────────────────────────────────────────────────────────────
    repo = FundRepository()
    try:
        ids: dict[str, str] = {}
        for fund in funds:
            written = repo.upsert_fund({k: v for k, v in fund.items() if k != "isin"} | {"isin": fund["isin"]})
            if written:
                ids[fund["isin"]] = written[0]["id"]
            else:
                existing = repo.get_by_isin(fund["isin"])
                if existing:
                    ids[fund["isin"]] = existing["id"]
            print(f"  upserted {fund['isin']}  {fund['name']}")

        for snapshot in snapshots:
            isin = snapshot.pop("isin")
            fund_id = ids.get(isin)
            if not fund_id:
                print(f"  ERROR could not resolve a fund id for {isin}")
                return 2

            pdf = pdf_bytes_for(isin, str(snapshot["as_of"]))
            if pdf:
                snapshot["mdd_sha256"] = hashlib.sha256(pdf).hexdigest()
                snapshot["mdd_pdf_ref"] = repo.upload_mdd(isin, str(snapshot["as_of"]), pdf)
                # The text layer goes with the document. It is what makes a
                # figure's evidence quote checkable later without re-opening a
                # PDF, or after the manager's own link has rotted — which
                # happens: one platform-hosted sheet found during design was
                # five years stale. Failing to archive it must not lose the row,
                # so the text is best effort and the PDF is the record.
                snapshot["extracted_text_ref"] = archive_text(
                    repo, isin, str(snapshot["as_of"]), pdf
                )
            else:
                # No archived copy, so stand in for the document's hash with a
                # hash of the transcription itself. Re-running an unchanged seed
                # stays a no-op, and a CORRECTED row lands as a new snapshot
                # that `latest_snapshots` then prefers, because it orders by
                # as_of then created_at.
                #
                # Hashing only isin/as_of/url — which is what this did first —
                # silently drops corrections: the identity of a fact sheet is
                # the same, but what we transcribed off it is not. That bug hid
                # the fix for the Satrix 40 risk rating, which stayed "no
                # published indicator" in the database after the CSV said
                # Aggressive.
                snapshot["mdd_sha256"] = transcription_identity(isin, snapshot)
                snapshot["mdd_pdf_ref"] = None
                snapshot["extracted_text_ref"] = None

            snapshot["fund_id"] = fund_id
            snapshot.setdefault("source", "manual")
            snapshot.setdefault("review_status", "approved")
            repo.insert_snapshot(snapshot)
            print(f"  recorded  {isin} as at {snapshot['as_of']}")
    except Exception as exc:
        print(f"\nWrite failed: {exc}")
        print("Re-running is safe: funds upsert on ISIN and sheets on the document.")
        return 2

    print(f"\nLoaded {len(funds)} funds and {len(snapshots)} fact sheets.")
    print("Set FUNDS_ENABLED=true (backend) and VITE_FUNDS_ENABLED=true (frontend) to serve them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
