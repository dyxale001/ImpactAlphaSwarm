"""Download each seeded fund's fact sheet and archive it, with its text.

    venv/bin/python scripts/archive_fund_documents.py --dry-run
    venv/bin/python scripts/archive_fund_documents.py --local-only
    venv/bin/python scripts/archive_fund_documents.py

`fund_factsheet_snapshots.mdd_pdf_ref` and `extracted_text_ref` are both null on
every row today, because the seed loader archives a document only when a copy has
been placed at `data/funds/mdd/<isin>/<as_of>.pdf` and none has. This fetches the
documents from the managers' own URLs instead, using the same allowlisted fetch
the admin form uses, and writes both refs onto the rows.

## ⚠ Read this before running it without --dry-run

**Archiving changes a snapshot's identity, so it adds a row rather than editing
one.** A snapshot is keyed `(fund_id, as_of, mdd_sha256)`. With no archived PDF
the loader stands in a hash of the transcribed values; with one it uses the
document's own sha256. Those differ, so archiving lands a SECOND snapshot for the
same month.

That is not a bug and it is not free either. The append-only design intends it —
`latest_snapshots` orders by `as_of desc, created_at desc` and `snapshots()`
returns the newest reading per date, so the archived row supersedes and the
earlier one stays as the audit trail. But it doubles the row count, and migration
024 deliberately grants no DELETE on these tables, so it cannot be undone. That
makes it a decision rather than a chore.

The alternative, if the extra rows are unwanted: archive the documents and update
the existing rows' two ref columns in place, leaving `mdd_sha256` as the
transcription hash. `--refs-only` does that. It keeps one row per sheet at the
cost of the row's hash no longer being the document's — which is the thing the
column is named for.

Nothing here is destructive: storage uploads upsert to a deterministic path, and
both modes only ever add or set columns.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from src.funds.extract import extract_text  # noqa: E402
from src.funds.extract.fetch import FetchError, fetch  # noqa: E402
from src.funds.repository import FundRepository  # noqa: E402

DATA_DIR = BACKEND / "data" / "funds"
PDF_DIR = DATA_DIR / "mdd"


def local_copy(isin: str, as_of: str) -> bytes | None:
    candidate = PDF_DIR / isin / f"{as_of}.pdf"
    if candidate.exists() and candidate.read_bytes()[:4] == b"%PDF":
        return candidate.read_bytes()
    return None


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="say what would happen, write nothing")
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="use only copies under data/funds/mdd, do not fetch from the managers",
    )
    parser.add_argument(
        "--refs-only",
        action="store_true",
        help=(
            "set the two ref columns on the EXISTING rows instead of recording new "
            "snapshots. Keeps one row per sheet; leaves mdd_sha256 as the "
            "transcription hash. See the note at the top of this file."
        ),
    )
    args = parser.parse_args(argv)

    with (DATA_DIR / "snapshots.csv").open(newline="", encoding="utf-8") as handle:
        snapshots = list(csv.DictReader(handle))

    repo = None if args.dry_run else FundRepository()
    archived = skipped = 0

    for row in snapshots:
        isin, as_of, url = row["isin"], row["as_of"], row.get("mdd_url") or ""

        pdf = local_copy(isin, as_of)
        source = "local copy"
        if pdf is None:
            if args.local_only:
                print(f"  skip  {isin}  no local copy, and --local-only")
                skipped += 1
                continue
            if not url:
                print(f"  skip  {isin}  no mdd_url on the seed row")
                skipped += 1
                continue
            try:
                pdf = fetch(url).content
                source = url
            except FetchError as exc:
                print(f"  skip  {isin}  {exc}")
                skipped += 1
                continue

        digest = hashlib.sha256(pdf).hexdigest()
        text = ""
        try:
            text = extract_text(pdf)
        except Exception as exc:  # noqa: BLE001
            print(f"  warn  {isin}  could not read the text layer ({exc})")

        note = f"{len(pdf) // 1024}KB pdf"
        note += f", {len(text.split())} words of text" if text.strip() else ", NO text layer"
        print(f"  {'would archive' if args.dry_run else 'archiving'}  {isin} {as_of}  "
              f"({note}, sha {digest[:12]}, from {source})")

        if args.dry_run:
            archived += 1
            continue

        pdf_ref = repo.upload_mdd(isin, as_of, pdf)
        text_ref = repo.upload_mdd_text(isin, as_of, text) if text.strip() else None

        fund = repo.get_by_isin(isin)
        if not fund:
            print(f"  skip  {isin}  not in the catalogue — load the seed first")
            skipped += 1
            continue

        if args.refs_only:
            repo.update_snapshot_refs(fund["id"], as_of, pdf_ref, text_ref)
        else:
            record = {
                k: v for k, v in row.items() if k not in ("isin",)
            }
            record.update(
                fund_id=fund["id"],
                mdd_sha256=digest,
                mdd_pdf_ref=pdf_ref,
                extracted_text_ref=text_ref,
                source="manual",
                review_status="approved",
            )
            repo.insert_snapshot(record)
        archived += 1

    verb = "would archive" if args.dry_run else "archived"
    print(f"\n{verb} {archived}, skipped {skipped}")
    if args.dry_run:
        print("Nothing was written. Re-read the note at the top of this file before "
              "running it for real.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
