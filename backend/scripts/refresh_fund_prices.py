"""Fetch and store closing prices for the listed funds in the catalogue.

    venv/bin/python scripts/refresh_fund_prices.py backend
    venv/bin/python scripts/refresh_fund_prices.py backend --period 5d

Only funds with a ``yahoo_symbol`` are touched, which in practice means the
ETFs: a unit trust is not listed and has no market price. Storing is idempotent,
so running this daily, weekly or twice in a row all end in the same rows.

Exit codes: 0 done, 2 an IO or database error. A fund whose feed is down is
reported and skipped rather than failing the run — one unavailable symbol should
not stop the rest from refreshing.
"""

import argparse
import sys
from pathlib import Path

BACKEND = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else Path.cwd()
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from src.funds.prices import DEFAULT_PERIOD, refresh_fund  # noqa: E402
from src.funds.repository import FundRepository  # noqa: E402


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Refresh fund closing prices.")
    parser.add_argument("backend", nargs="?", default=".", help="path to the backend directory")
    parser.add_argument("--period", default=DEFAULT_PERIOD, help="yfinance period, e.g. 1y or 5d")
    args = parser.parse_args(argv)

    repo = FundRepository()
    funds = [f for f in repo.list_active() if (f.get("yahoo_symbol") or "").strip()]
    print(f"{len(funds)} listed funds to refresh ({args.period})")

    written = skipped = 0
    try:
        for fund in funds:
            rows = refresh_fund(repo, fund, args.period)
            if rows:
                written += rows
                print(f"  {fund['yahoo_symbol']:12s} {rows:4d} closes  {fund['name']}")
            else:
                skipped += 1
                print(f"  {fund['yahoo_symbol']:12s}    no data  {fund['name']}")
    except Exception as exc:  # noqa: BLE001
        print(f"\nRefresh failed: {exc}")
        return 2

    print(f"\nStored {written} closes; {skipped} fund(s) returned nothing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
