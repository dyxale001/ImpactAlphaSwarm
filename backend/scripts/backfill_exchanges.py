"""Store the exchange on every active asset row that does not have one yet.

    python scripts/backfill_exchanges.py            # dry run, looks up and writes nothing
    python scripts/backfill_exchanges.py --apply    # look up and store

Run once after migration 032, which adds assets.exchange. After that the nightly
discovery pass does the same for any row still empty, so this is only needed again
if many rows are added outside discovery and the exchange is wanted before the night.

One light Yahoo read per empty row. A ticker Yahoo cannot place is left empty and
listed, and the page falls back to a live lookup for it.

Exit codes: 0 done (or dry run), 2 nothing could be read or a write failed.
"""

import argparse
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from src.quant.listing import ExchangeFiller  # noqa: E402


class ExchangeBackfill:
	"""The command line around ExchangeFiller: a dry run by default, a report either way."""

	def __init__(self, filler: ExchangeFiller | None = None):
		self.filler = filler or ExchangeFiller()

	def run(self, apply: bool) -> int:
		missing = self.filler.assets.tickers_missing_exchange()
		if missing is None:
			print("\nCould not read the assets table. Has migration 032 been run?")
			return 2

		if not apply:
			found = self.filler.lookup()
			self.report({t: n for t, n in found.items() if n}, sorted(t for t, n in found.items() if not n), "would store")
			print("\nDry run. Nothing written. Re-run with --apply to store these.")
			return 0

		result = self.filler.fill()
		self.report(result["stored"], result["unknown"], "stored")
		failed = len(missing) - len(result["stored"]) - len(result["unknown"])
		if failed:
			print(f"\n{failed} write(s) failed; see the errors above. Re-run to retry them.")
			return 2
		return 0

	@staticmethod
	def report(stored: dict[str, str], unknown: list[str], verb: str) -> None:
		if not stored and not unknown:
			print("Every active asset already has an exchange.")
			return
		by_exchange: dict[str, list[str]] = {}
		for ticker, name in sorted(stored.items()):
			by_exchange.setdefault(name, []).append(ticker)
		print(f"{len(stored)} row(s) {verb}:")
		for name, tickers in sorted(by_exchange.items()):
			print(f"  {name} ({len(tickers)}): {', '.join(tickers)}")
		if unknown:
			print(f"\n{len(unknown)} not found on Yahoo, left empty: {', '.join(unknown)}")


def main() -> int:
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--apply", action="store_true", help="store the exchanges (default is a dry run)")
	return ExchangeBackfill().run(apply=parser.parse_args().apply)


if __name__ == "__main__":
	sys.exit(main())
