"""How much of the regulated common core each seeded fund actually has.

The point of migration 025 is coverage, not accuracy: the columns were added
because roughly a third of what every Minimum Disclosure Document publishes was
being discarded. This says how much of it the catalogue actually holds.

There used to be an accuracy harness beside this one, scoring an extractor
against the same seed. The extractor was removed — funds are entered by hand —
so coverage is now a question about transcription effort rather than about how
well a reader did.

Reads the CSVs rather than the database, deliberately. The seed is the
transcription of record — the loader refuses to write a row that fails
validation, so the database is a subset of this by construction, and a report
that needed Supabase credentials would not run in CI.

    python scripts/fund_field_coverage.py
    python scripts/fund_field_coverage.py --per-fund
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from src.funds.validators import is_blank  # noqa: E402

DATA_DIR = BACKEND / "data" / "funds"

# What migration 024 already captured, and what 025 added. Split because the
# interesting number is the second one: the first was populated by the original
# transcription pass and the second is what the phase set out to fill.
CORE_024 = (
    "risk_indicator_raw",
    "risk_indicator_1to5",
    "benchmark",
    "ter",
    "tc",
    "tic",
    "fund_size_zar",
    "objective",
    "distribution_frequency",
    "performance",
    "top_holdings",
    "asset_allocation",
    "recommended_min_term_years",
    "min_lump_sum",
    "min_debit_order",
)

CORE_025 = (
    "nav_cpu",
    "nav_date",
    "fee_period",
    "inception_date",
    "annual_management_fee",
    "return_high_12m",
    "return_low_12m",
    "return_extremes_basis",
    "risk_narrative",
    "horizon_words",
    "portfolio_manager",
    "regulation_28",
    "income_distribution",
)


def read(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def filled(row: dict[str, str], columns) -> list[str]:
    return [c for c in columns if not is_blank(row.get(c))]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--per-fund", action="store_true", help="a line per fund")
    args = parser.parse_args()

    funds = {row["isin"]: row for row in read(DATA_DIR / "funds.csv")}
    snapshots = read(DATA_DIR / "snapshots.csv")

    print(f"{len(snapshots)} fact sheets, {len(CORE_024)} columns from 024 and "
          f"{len(CORE_025)} from 025\n")

    if args.per_fund:
        print(f"{'fund':38s} {'024':>8s} {'025':>8s}")
        print("-" * 56)
        for row in sorted(snapshots, key=lambda r: funds[r["isin"]]["name"]):
            name = funds[row["isin"]]["name"][:36]
            old = len(filled(row, CORE_024))
            new = len(filled(row, CORE_025))
            print(f"{name:38s} {old:3d}/{len(CORE_024):<4d} {new:3d}/{len(CORE_025):<4d}")
        print()

    # Per column, which is what says where the gaps are rather than how big.
    print(f"{'column':26s} {'funds with it':>14s}")
    print("-" * 42)
    for group, columns in (("024", CORE_024), ("025", CORE_025)):
        for column in columns:
            have = sum(1 for row in snapshots if not is_blank(row.get(column)))
            bar = "#" * round(have / len(snapshots) * 20)
            print(f"{group} {column:23s} {have:3d}/{len(snapshots)}  {bar}")
        print()

    old_total = sum(len(filled(row, CORE_024)) for row in snapshots)
    new_total = sum(len(filled(row, CORE_025)) for row in snapshots)
    old_cells = len(snapshots) * len(CORE_024)
    new_cells = len(snapshots) * len(CORE_025)
    print(f"024 columns: {old_total}/{old_cells} cells ({old_total / old_cells:.0%})")
    print(f"025 columns: {new_total}/{new_cells} cells ({new_total / new_cells:.0%})")

    populated = sum(1 for row in snapshots if filled(row, CORE_025))
    print(
        f"\n{populated} of {len(snapshots)} funds carry any of the common core. "
        f"The rest are waiting on a reader that can open their sheet — only four "
        f"of the nineteen documents are readable locally today."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
