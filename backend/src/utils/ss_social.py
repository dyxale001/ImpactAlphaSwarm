"""Sentiment scout: social chatter collection (StockTwits).
"""

from __future__ import annotations

import datetime
import logging
import os
import re
import time
from abc import ABC

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


def parse_stocktwits_created_at(msg: dict) -> datetime.datetime | None:
	"""The post's own timestamp, straight off the raw message.

	Read before validation on purpose. Deciding whether a page has reached back past
	the window edge has to consider every message on it, including the ones the quality
	gate is about to drop, or a page of nothing but promos would look like a page with
	no dates on it.
	"""
	raw = msg.get("created_at") if isinstance(msg, dict) else None
	if not raw:
		return None
	try:
		parsed = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
	except (TypeError, ValueError):
		return None
	if parsed.tzinfo is None:
		parsed = parsed.replace(tzinfo=datetime.timezone.utc)
	return parsed


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
		# Counts HTTP requests actually issued. This is the number the page ceiling
		# exists to bound, and tests assert on it directly.
		self.request_count = 0
		# When collection must stop, set by whoever owns the budget so it is shared
		# across every ticker rather than handed out per ticker. None means unbounded,
		# which is what a source running standalone gets.
		self.deadline: float | None = None

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

	def window_start(self, days: int | None = None) -> datetime.datetime | None:
		"""The oldest post a walk will keep, or None when the window is switched off.

		Social has never had a time bound. News has always had one, and the Sentiment
		Data card's "last N days" badge claims both are bounded, so a quiet ticker
		scoring off a post from months ago made that badge untrue. With the window on,
		the badge is finally accurate for both halves.

		``days`` is passed in rather than read off the config because the depth of a
		walk is the caller's business, not the source's: a run reaches back
		``social_accumulate_days`` and a backfill reaches back ``social_display_days``.
		Fusing those two into one setting is exactly what put a seven day crawl on the
		run's path in the build that was reverted.
		"""
		if not self.config.social_history_enabled:
			return None
		window = days if days is not None else self.config.social_accumulate_days
		return datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=window)

	def out_of_time(self) -> bool:
		"""Whether the shared collection budget has been spent."""
		return self.deadline is not None and time.monotonic() >= self.deadline

	def _collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		results = self.empty(tickers)
		if self.session is None:
			return results

		window = self.window_start()
		# Adaptive when the window is on, fixed at the old page count when it is off, so
		# switching the flag off restores exactly the behaviour that shipped before.
		pages = (
			self.config.stocktwits_day_max_pages
			if window is not None
			else self.config.stocktwits_max_pages
		)

		for ticker in tickers:
			if self.out_of_time():
				# Whoever is left keeps their empty list rather than the run stalling.
				# The collector logs the cut once, above this loop's caller.
				break
			sym = ticker.upper()
			results[sym] = self._walk(sym, max_pages=pages, until_dt=window)
		return results

	def _walk(
		self,
		sym: str,
		max_pages: int = 2,
		until_dt: datetime.datetime | None = None,
	) -> list[SocialMention]:
		"""Page backwards through one symbol's stream and return what it finds.

		Backwards is the only direction that works. StockTwits always answers with
		the NEWEST messages matching a filter, so a forward ``since`` walk skips
		whatever sits between the cursor and the head.

		``until_dt`` stops the walk once a page has reached back past the window edge,
		which is the normal exit and why a quiet ticker costs one request rather than
		the two it used to. ``max_pages`` is the backstop for a ticker busy enough that
		the window edge never arrives, and it is a plain bounded loop rather than a
		condition, so a stream of posts with unreadable timestamps still cannot run
		away. Those two together are what make the twelve page seed crawl that cost
		eighteen minutes impossible to reach from inside a run.
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
			if page and self.out_of_time():
				logger.warning(
					"Social collection budget spent; %s stops at page %d with %d posts",
					sym,
					page,
					len(mentions),
				)
				break

			params: dict[str, object] = {"limit": self.limit}
			if client_id:
				params["client_id"] = client_id
			if max_id is not None:
				params["max"] = max_id

			self.limiter.wait()
			self.request_count += 1
			try:
				resp = self.session.get(
					url,
					params=params,
					headers=self.HEADERS,
					timeout=self.config.stocktwits_request_timeout,
				)
				if resp.status_code != 200:
					# Refusals (rate limiting above all) end the walk exactly like
					# running out of stream does, but they mean the opposite: there
					# IS more to fetch and we were told no. Silence made the two
					# indistinguishable, so a throttled night looked like a quiet one.
					logger.warning(
						"StockTwits refused %s at page %d with HTTP %s; walk stops early with %d posts",
						sym,
						page + 1,
						resp.status_code,
						len(mentions),
					)
					break
				payload = resp.json()
			except Exception as e:
				logger.warning(
					"StockTwits page %d for %s failed (%s); walk stops early with %d posts",
					page + 1,
					sym,
					e,
					len(mentions),
				)
				break

			messages = payload.get("messages", []) if isinstance(payload, dict) else []
			if not messages:
				break

			for msg in messages:
				mention = self._parse_message(msg, sym, api_sym, seen_author_posts, until_dt)
				if mention is not None:
					mentions.append(mention)

			# Stop once this page has reached back past the window edge. Tested on the
			# RAW page rather than on what survived parsing, because the quality gate
			# can empty a page entirely and an empty page would otherwise read as "keep
			# going" forever.
			if until_dt is not None and self._page_reaches_past(messages, until_dt):
				break

			max_id = self._next_cursor(payload, messages)
			if max_id is None:
				break

		return mentions

	@staticmethod
	def _page_reaches_past(messages: list, until_dt: datetime.datetime) -> bool:
		"""Whether the oldest message on this page predates the window edge.

		Unreadable timestamps count as "not past", so a stream of malformed dates keeps
		walking until the page ceiling stops it rather than ending the walk after one
		page and silently reporting a quiet ticker.
		"""
		oldest: datetime.datetime | None = None
		for msg in messages:
			created = parse_stocktwits_created_at(msg)
			if created is not None and (oldest is None or created < oldest):
				oldest = created
		return oldest is not None and oldest < until_dt

	def _parse_message(
		self,
		msg: dict,
		sym: str,
		api_sym: str,
		seen_author_posts: set[tuple[str, str]],
		until_dt: datetime.datetime | None = None,
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

		# Age gate, alongside the other two. A post past the window edge is dropped
		# outright rather than ranked, so it can never reach the score, the day rows or
		# the list shown under the chart. Without this the two page floor would drag
		# months old posts into a quiet ticker's score, which is what made "top posts"
		# mean today for a busy ticker and last spring for a quiet one.
		if until_dt is not None:
			created = validated.created_at
			if created is None:
				return None
			if created.tzinfo is None:
				created = created.replace(tzinfo=datetime.timezone.utc)
			if created < until_dt:
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
	"""

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
		deadline = self._deadline()

		for source in self.sources:
			# The budget is shared across sources and tickers, not handed out per
			# ticker, because the thing being protected is the run as a whole.
			setattr(source, "deadline", deadline)
			collected = source.collect(normalized_tickers)
			for ticker in normalized_tickers:
				combined[ticker].extend(collected.get(ticker, []))

		if deadline is not None and time.monotonic() >= deadline:
			empty = [ticker for ticker in normalized_tickers if not combined[ticker]]
			# Say so plainly. A budget cut and a genuinely quiet night look identical in
			# the data, and last time that ambiguity cost us a week of wondering why
			# sentiment had gone flat.
			logger.warning(
				"Social collection hit its %.0fs budget; %d of %d tickers came back empty",
				self.config.social_collect_max_seconds,
				len(empty),
				len(normalized_tickers),
			)
		return combined

	def _deadline(self) -> float | None:
		"""When collection must stop, or None when it is unbounded.

		The page ceiling bounds how many requests a ticker can make; it does not bound
		how long they take. At six seconds a request a degraded StockTwits could still
		spend half an hour while staying inside every page cap, which is the whole
		nightly scheduler deadline. This is the ceiling in seconds.
		"""
		budget = self.config.social_collect_max_seconds
		if not self.config.social_history_enabled or budget <= 0:
			return None
		return time.monotonic() + budget


def collect_mentions(tickers: list[str]) -> dict[str, list[SocialMention]]:
	"""Collect social mentions for the tickers."""
	return SocialCollector().collect(tickers)
