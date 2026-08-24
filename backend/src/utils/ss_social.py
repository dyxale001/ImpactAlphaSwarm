"""Sentiment scout: social chatter collection (StockTwits).

Two filters run before a post is allowed to vote. A quality gate drops bare
cashtags, watchlist dumps and promos, which carry no ticker-specific opinion; and
a per-author dedup collapses near-identical reposts, so one person spamming the
same take cannot stack the sentiment score.

The stream can be walked in either direction, which is what history collection
rests on. ``max`` pages BACKWARDS into older posts and is used once per ticker to
seed a window; ``since`` pulls only posts newer than an id already held and is
what every run after that uses, so the same post is never downloaded twice.
"""

from __future__ import annotations

import logging
import os
import re
from abc import ABC
from datetime import datetime, timezone

from .schemas import parse_stocktwits_message
from .ss_base import MentionSource, RateLimiter
from .ss_config import SentimentConfig
from .ss_models import SocialMention, _api_symbol, _normalize_tickers, engagement_weight
from .ss_sources import PublisherRegistry

try:
	import cloudscraper
except ImportError:
	cloudscraper = None

try:
	import requests
except ImportError:
	requests = None


logger = logging.getLogger("sentiment-scout")

STOCKTWITS_LIMITER = RateLimiter(SentimentConfig.from_env().stocktwits_min_interval)


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
		limiter: RateLimiter | None = None,
	):
		super().__init__(config, registry)
		self.limit = limit
		self.session = session or self._build_session()
		self.limiter = limiter or STOCKTWITS_LIMITER
		# Counts HTTP requests actually issued. The whole point of storing posts is
		# that this number falls; a test asserts on it directly.
		self.request_count = 0

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
		"""This source's engagement weight, at the configured cap."""
		return engagement_weight(likes, reshares, replies, self.config.stocktwits_engagement_cap)

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		try:
			return self._collect(tickers)
		except NameError:
			return self.empty(tickers)

	def _collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		results = self.empty(tickers)
		if self.session is None:
			return results
		for ticker in tickers:
			sym = ticker.upper()
			results[sym] = self._walk(sym, max_pages=self.config.stocktwits_max_pages)
		return results

	def collect_since(
		self, ticker: str, since_id: int, max_pages: int | None = None
	) -> list[SocialMention]:
		"""Everything posted since ``since_id``, however long ago that was.

		The steady-state path. It walks back from the head of the stream and stops
		the moment it meets ``since_id``, so a normal night costs one page, while a
		ticker that went uncollected for a week keeps paging until it reaches
		familiar ground. Catch-up is automatic and costs only what the gap is worth.
		"""
		if self.session is None:
			return []
		return self._walk(
			ticker.upper(),
			stop_at_id=since_id,
			max_pages=max_pages if max_pages is not None else self.config.stocktwits_history_max_pages,
		)

	def collect_backfill(
		self, ticker: str, until_dt, max_pages: int | None = None
	) -> list[SocialMention]:
		"""Walk backwards through the stream until posts predate ``until_dt``.

		Runs once per ticker, to seed the history window from posts' own timestamps.
		"""
		if self.session is None:
			return []
		return self._walk(
			ticker.upper(),
			until_dt=until_dt,
			max_pages=max_pages if max_pages is not None else self.config.stocktwits_history_max_pages,
		)

	def _walk(
		self,
		sym: str,
		stop_at_id: int | None = None,
		until_dt=None,
		max_pages: int = 2,
	) -> list[SocialMention]:
		"""Page backwards through one symbol's stream and return what it finds.

		There is only one direction, deliberately. StockTwits always answers with
		the NEWEST messages matching a filter, so a forward ``since`` walk cannot
		enumerate a backlog: asking for "newer than X" when a thousand posts have
		arrived returns the newest page, and advancing the cursor past it just
		reaches the end of the stream, silently skipping everything in between.

		Walking back from the head instead, and stopping at the first post already
		held, enumerates exactly the gap however large it is.

		Whichever stop condition is given, the walk ends early: ``stop_at_id`` when
		it meets a post we already have, ``until_dt`` when it passes the window edge.
		"""
		api_sym = _api_symbol(sym)
		url = self.STREAM_URL.format(symbol=api_sym)
		client_id = os.getenv("STOCKTWITS_CLIENT_ID", None)
		mentions: list[SocialMention] = []

		# Collapse near-duplicate posts from the same author (spammers repost the
		# same take) so one person can't stack the sentiment vote. Kept across
		# pages so a repost on an older page is caught too.
		seen_author_posts: set[tuple[str, str]] = set()
		max_id: int | None = None
		pages = max(1, max_pages)

		for page in range(pages):
			params: dict[str, object] = {"limit": self.limit}
			if client_id:
				params["client_id"] = client_id
			if max_id is not None:
				params["max"] = max_id

			self.limiter.wait()
			self.request_count += 1
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

			caught_up = False
			for msg in messages:
				msg_id = msg.get("id")
				if stop_at_id is not None and isinstance(msg_id, int) and msg_id <= stop_at_id:
					# Reached posts we already hold; everything older is known too.
					caught_up = True
					break
				mention = self._parse_message(msg, sym, api_sym, seen_author_posts)
				if mention is not None:
					mentions.append(mention)

			if caught_up:
				break
			if until_dt is not None and self._reached_back_to(messages, until_dt):
				break

			max_id = self._next_cursor(payload, messages)
			if max_id is None:
				break
			if page == pages - 1:
				logger.info(
					"StockTwits walk for %s hit its %d page ceiling with more to fetch",
					sym,
					pages,
				)

		return mentions

	@staticmethod
	def _reached_back_to(messages: list, until_dt: datetime) -> bool:
		"""Whether this page has reached past ``until_dt``.

		Read off the raw payload rather than the parsed mentions: the quality gate
		can drop every post on a page, and that must not be mistaken for the walk
		running out of history. Messages arrive newest-first, so the last one with a
		usable timestamp is the oldest on the page.
		"""
		for msg in reversed(messages):
			raw = msg.get("created_at")
			if not raw:
				continue
			try:
				created = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
			except (TypeError, ValueError):
				continue
			if created.tzinfo is None:
				created = created.replace(tzinfo=timezone.utc)
			return created < until_dt
		return False

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
			message_id=validated.id,
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
	"""Gathers every social source into one set of mentions per ticker.

	When social history is enabled, StockTwits is served through the history
	collector instead of being called directly: posts go to storage first and the
	scoring window is read back out of it. That is a strictly better deal for the
	live signal too, since a run that fetches nothing new still scores a full
	window rather than whatever the last call happened to return.
	"""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		sources: list[SocialSource] | None = None,
		history=None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.sources = sources if sources is not None else [StockTwitsSource(self.config, self.registry)]
		self.history = history
		if self.history is None and self.config.social_history_enabled:
			from .ss_history import SocialHistoryCollector

			self.history = SocialHistoryCollector(self.config, self.registry)

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		normalized_tickers = _normalize_tickers(tickers)
		if self.history is not None:
			try:
				return self.history.collect(normalized_tickers)
			except Exception as e:
				# Never let history cost us the live signal: fall through to the
				# direct path, which is what runs with the flag off anyway.
				logger.warning("Social history collection failed, using direct fetch: %s", e)

		combined: dict[str, list[SocialMention]] = {ticker: [] for ticker in normalized_tickers}
		for source in self.sources:
			collected = source.collect(normalized_tickers)
			for ticker in normalized_tickers:
				combined[ticker].extend(collected.get(ticker, []))
		return combined


def collect_mentions(tickers: list[str]) -> dict[str, list[SocialMention]]:
	"""Collect social mentions for the tickers."""
	return SocialCollector().collect(tickers)
