"""Where a ticker is listed, for the universe and exchange line on asset pages and cards.

The exchange is stored on the asset row (migration 032), so the page normally reads
it with everything else. Two things here keep that column filled:

  * ``ListingService`` looks one ticker up: a single light ``fast_info`` read, held for
    a day. It also serves /api/assets/{ticker}/listing, the page's fallback for a row
    whose exchange has not been stored yet.
  * ``ExchangeFiller`` stores the exchange on every active row still without one. Run
    once as the backfill, then nightly at the end of the discovery pass.

Not behind ``QUANT_HISTORY_ENABLED``. That flag exists to keep price downloads off the
page; this is a single profile read with no history behind it.
"""

from __future__ import annotations

import logging
from typing import Any

from src.agents.quant_analyst import MarketDataSource

from .history import TTLCache, exchange_name

logger = logging.getLogger("quant-view")

#: How long a ticker's listing is held. A day: see the module docstring.
LISTING_TTL_SECONDS = 86_400


class ListingService:
	"""Answers which exchange a ticker trades on, fetching it once a day per ticker."""

	def __init__(
		self,
		data_source: MarketDataSource | None = None,
		cache: TTLCache | None = None,
	):
		self.data_source = data_source or MarketDataSource()
		self.cache = cache if cache is not None else TTLCache(LISTING_TTL_SECONDS)

	def listing(self, ticker: str) -> dict[str, Any]:
		"""The exchange code and its reader-facing name, or blanks when unknown.

		Blank rather than guessed, as the Quant chart does it: showing nothing is better
		than naming the wrong exchange. A blank answer is not cached, so a lookup that
		failed because Yahoo was briefly down is retried on the next visit.
		"""
		symbol = ticker.upper()
		cached = self.cache.get(symbol)
		if cached is not None:
			return cached

		try:
			profile = self.data_source.profile(symbol)
		except Exception as exc:
			logger.info("Listing lookup failed for %s: %s", symbol, exc)
			profile = {}

		code = str(profile.get("exchange") or "")
		payload = {"ticker": symbol, "exchange": code, "exchange_name": exchange_name(code)}
		if code:
			self.cache.put(symbol, payload)
		return payload


class ExchangeFiller:
	"""Stores the exchange on every active asset row that does not have one yet.

	Run once by scripts/backfill_exchanges.py and then nightly at the end of the
	discovery pass. Only empty rows are looked up, so on a normal night that is the
	handful of names discovery added, or none at all. A ticker the lookup finds nothing
	for stays empty and is tried again the next night.
	"""

	def __init__(self, assets: Any = None, listings: ListingService | None = None):
		if assets is None:
			from src.utils.supabase_client import AssetRepository

			assets = AssetRepository()
		self.assets = assets
		self.listings = listings or ListingService()

	def lookup(self) -> dict[str, str]:
		"""``{ticker: exchange name}`` for every empty row, "" where nothing was found."""
		return {
			ticker: self.listings.listing(ticker)["exchange_name"]
			# None is a failed read: nothing to fill tonight, retried tomorrow.
			for ticker in self.assets.tickers_missing_exchange() or []
		}

	def fill(self) -> dict[str, Any]:
		"""Look up and store. Returns what was written and what is still unknown."""
		found = self.lookup()
		stored = {
			ticker: name
			for ticker, name in found.items()
			if name and self.assets.set_exchange(ticker, name)
		}
		unknown = sorted(t for t, name in found.items() if not name)
		return {"stored": stored, "unknown": unknown}
