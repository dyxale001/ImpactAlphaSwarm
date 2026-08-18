"""Sentiment scout: social chatter collection (StockTwits).

Two filters run before a post is allowed to vote. A quality gate drops bare
cashtags, watchlist dumps and promos, which carry no ticker-specific opinion; and
a per-author dedup collapses near-identical reposts, so one person spamming the
same take cannot stack the sentiment score.
"""

from __future__ import annotations

import math
import os
import re
from abc import ABC

from .schemas import parse_stocktwits_message
from .ss_base import MentionSource
from .ss_config import SentimentConfig
from .ss_models import SocialMention, _api_symbol, _normalize_tickers
from .ss_sources import PublisherRegistry

try:
	import cloudscraper
except ImportError:
	cloudscraper = None

try:
	import requests
except ImportError:
	requests = None


class SocialSource(MentionSource, ABC):
	"""A retail-chatter source. Its posts carry engagement and an optional
	author-declared Bullish/Bearish tag, and are never publisher-tiered."""


class StockTwitsSource(SocialSource):
	"""Collects recent StockTwits posts per ticker, paging back through the stream."""

	name = "stocktwits"

	STREAM_URL = "https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json"
	HEADERS = {
		"Accept": "application/json",
		"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	}

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		session=None,
		limit: int = 30,
	):
		super().__init__(config, registry)
		self.limit = limit
		self.session = session or self._build_session()

	@staticmethod
	def _build_session():
		if cloudscraper is not None:
			try:
				return cloudscraper.create_scraper(
					browser={"browser": "chrome", "platform": "linux", "desktop": True}
				)
			except Exception:
				pass
		return requests

	def engagement_weight(self, likes: int, reshares: int, replies: int) -> float:
		"""Log-dampened, capped weight in [1.0, cap] from a post's engagement. A post
		with no engagement weighs 1.0; a heavily engaged one weighs more but with
		sharply diminishing returns, so a single viral post cannot dominate."""
		raw = max(0, likes) + 2 * max(0, reshares) + max(0, replies)
		return min(self.config.stocktwits_engagement_cap, 1.0 + math.log1p(raw))

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		try:
			return self._collect(tickers)
		except NameError:
			return self.empty(tickers)

	def _collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		results = self.empty(tickers)
		if self.session is None:
			return results

		client_id = os.getenv("STOCKTWITS_CLIENT_ID", None)

		for ticker in tickers:
			sym = ticker.upper()
			api_sym = _api_symbol(sym)
			url = self.STREAM_URL.format(symbol=api_sym)

			# Collapse near-duplicate posts from the same author (spammers repost the
			# same take) so one person can't stack the sentiment vote. Kept across
			# pages so a repost on an older page is caught too.
			seen_author_posts: set[tuple[str, str]] = set()
			max_id: int | None = None

			for _ in range(max(1, self.config.stocktwits_max_pages)):
				params = {"limit": self.limit}
				if client_id:
					params["client_id"] = client_id
				if max_id is not None:
					params["max"] = max_id

				try:
					resp = self.session.get(url, params=params, headers=self.HEADERS, timeout=10)
					if resp.status_code != 200:
						break
					payload = resp.json()
				except Exception:
					break

				messages = payload.get("messages", []) if isinstance(payload, dict) else []
				if not messages:
					break

				for msg in messages:
					mention = self._parse_message(msg, sym, api_sym, seen_author_posts)
					if mention is not None:
						results[sym].append(mention)

				max_id = self._next_cursor(payload, messages)
				if max_id is None:
					break

		return results

	def _parse_message(
		self,
		msg: dict,
		sym: str,
		api_sym: str,
		seen_author_posts: set[tuple[str, str]],
	) -> SocialMention | None:
		# Validate at the ingestion boundary: malformed messages are rejected
		# (dropped), anomalous ones are kept but flagged.
		validated = parse_stocktwits_message(msg)
		if validated is None:
			return None

		# Quality gate: drop bare cashtags, watchlist lists and promos, posts with
		# no usable, ticker-specific opinion.
		if not validated.passes_quality:
			return None

		body_upper = validated.body.upper()
		if (
			validated.symbols
			and api_sym not in validated.symbols
			and api_sym not in body_upper
			and f"${api_sym}" not in body_upper
		):
			return None

		author = (validated.username or "").lower()
		dedup_key = (author, re.sub(r"\W+", "", validated.display_body.lower())[:100])
		if author and dedup_key in seen_author_posts:
			return None
		seen_author_posts.add(dedup_key)

		return SocialMention(
			ticker=sym,
			text=validated.display_body,
			source=f"stocktwits:{validated.username or ''}",
			url=validated.url,
			engagement=validated.likes + validated.reshares + validated.replies,
			likes=validated.likes,
			reshares=validated.reshares,
			replies=validated.replies,
			created_at=validated.created_at.isoformat() if validated.created_at else None,
			declared_sentiment=validated.declared_sentiment,
			weight=self.engagement_weight(validated.likes, validated.reshares, validated.replies),
		)

	@staticmethod
	def _next_cursor(payload: dict, messages: list) -> int | None:
		"""Advance to the next (older) page. ``None`` when StockTwits says there is
		no more, or no cursor can be derived."""
		cursor = payload.get("cursor", {}) if isinstance(payload, dict) else {}
		if not cursor.get("more"):
			return None
		next_max = cursor.get("max")
		if next_max is None:
			ids = [m.get("id") for m in messages if isinstance(m.get("id"), int)]
			if not ids:
				return None
			next_max = min(ids) - 1
		return next_max


class SocialCollector:
	"""Gathers every social source into one set of mentions per ticker."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		sources: list[SocialSource] | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.sources = sources if sources is not None else [StockTwitsSource(self.config, self.registry)]

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		normalized_tickers = _normalize_tickers(tickers)
		combined: dict[str, list[SocialMention]] = {ticker: [] for ticker in normalized_tickers}
		for source in self.sources:
			collected = source.collect(normalized_tickers)
			for ticker in normalized_tickers:
				combined[ticker].extend(collected.get(ticker, []))
		return combined


def collect_mentions(tickers: list[str]) -> dict[str, list[SocialMention]]:
	"""Collect social mentions for the tickers."""
	return SocialCollector().collect(tickers)
