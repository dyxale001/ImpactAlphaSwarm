"""Tests for StockTwits history collection.

The claim these exist to defend is the one the whole feature rests on: after a
post has been stored once, it is never downloaded again. That is what pays for the
deeper crawl, so if it regresses the feature quietly becomes a bandwidth problem
rather than a broken-looking one.

Everything external is faked. There is no Supabase and no network here.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents import sentiment_scout  # noqa: F401,E402  (import order breaks a cycle)
from src.utils.ss_config import SentimentConfig  # noqa: E402
from src.utils.ss_history import BucketAggregator, SocialHistoryCollector  # noqa: E402
from src.utils.ss_social import StockTwitsSource  # noqa: E402


UTC = datetime.timezone.utc


def _msg(msg_id: int, body: str, days_ago: float = 0.0, likes: int = 0, declared=None):
	created = datetime.datetime.now(UTC) - datetime.timedelta(days=days_ago)
	return {
		"id": msg_id,
		"body": body,
		"created_at": created.isoformat(),
		"user": {"username": f"user{msg_id}"},
		"likes": {"total": likes},
		"symbols": [{"symbol": "NPN"}],
		"entities": {"sentiment": {"basic": declared}} if declared else {},
	}


def _stream(start_id: int, count: int, spacing_days: float, body: str, **kw) -> list[dict]:
	"""A run of posts where the NEWEST carries the HIGHEST id.

	StockTwits guarantees that ordering and both stop conditions depend on it, so a
	fixture that gets it backwards tests nothing real.
	"""
	return [
		_msg(start_id + i, f"{body} number {i}", days_ago=(count - 1 - i) * spacing_days, **kw)
		for i in range(count)
	]


class FakeResponse:
	def __init__(self, payload):
		self.status_code = 200
		self._payload = payload

	def json(self):
		return self._payload


class FakeSession:
	"""Serves a fixed stream, honouring the since/max cursors like the real API."""

	def __init__(self, messages: list[dict]):
		# Newest first, as StockTwits returns them.
		self.messages = sorted(messages, key=lambda m: m["id"], reverse=True)
		self.requests: list[dict] = []

	def get(self, url, params=None, headers=None, timeout=None):
		params = params or {}
		self.requests.append(dict(params))
		limit = int(params.get("limit", 30))
		pool = self.messages
		if "since" in params:
			pool = [m for m in pool if m["id"] > int(params["since"])]
		elif "max" in params:
			pool = [m for m in pool if m["id"] <= int(params["max"])]
		page = pool[:limit]
		more = len(pool) > len(page)
		cursor = {"more": more, "max": (page[-1]["id"] - 1) if page and more else None}
		return FakeResponse({"messages": page, "cursor": cursor})


class FakeMessageRepo:
	"""In-memory stand-in for the Supabase-backed MessageRepository."""

	def __init__(self, config):
		self.config = config
		self.rows: dict[int, dict] = {}

	def high_water_mark(self, ticker):
		ids = [r["message_id"] for r in self.rows.values() if r["ticker"] == ticker.upper()]
		return max(ids) if ids else None

	def oldest_created_at(self, ticker):
		from src.utils.ss_social_store import parse_ts

		stamps = [
			parse_ts(r["created_at"]) for r in self.rows.values() if r["ticker"] == ticker.upper()
		]
		stamps = [s for s in stamps if s]
		return min(stamps) if stamps else None

	def read_rows(self, ticker, since_dt):
		from src.utils.ss_social_store import parse_ts

		return [
			r
			for r in self.rows.values()
			if r["ticker"] == ticker.upper() and (parse_ts(r["created_at"]) or since_dt) >= since_dt
		]

	def read_window(self, ticker, since_dt):
		from src.utils.ss_models import SocialMention

		return [
			SocialMention.from_row(r, self.config.stocktwits_engagement_cap)
			for r in self.read_rows(ticker, since_dt)
		]

	def insert_new(self, rows):
		fresh = [r for r in rows if r["message_id"] not in self.rows]
		for row in fresh:
			self.rows[row["message_id"]] = row
		return len(fresh)

	def prune(self, before_dt):
		from src.utils.ss_social_store import parse_ts

		for key in [
			k for k, r in self.rows.items() if (parse_ts(r["created_at"]) or before_dt) < before_dt
		]:
			del self.rows[key]


class FakeDailyRepo:
	def __init__(self):
		self.written: dict[str, list[dict]] = {}

	def write_days(self, ticker, rows):
		self.written[ticker.upper()] = rows

	def read_history(self, ticker, days):
		return self.written.get(ticker.upper(), [])


@pytest.fixture
def config():
	return SentimentConfig.from_env().__class__(
		social_history_enabled=True,
		social_history_days=14,
		social_retention_days=21,
		stocktwits_history_max_pages=12,
		# No sleeping in tests.
		stocktwits_min_interval=0.0,
	)


def _collector(config, messages, limit=30):
	from src.utils.ss_base import RateLimiter

	session = FakeSession(messages)
	source = StockTwitsSource(
		config, session=session, limit=limit, limiter=RateLimiter(0.0)
	)
	collector = SocialHistoryCollector(
		config,
		source=source,
		messages=FakeMessageRepo(config),
		daily=FakeDailyRepo(),
	)
	return collector, session, source


# ── the central claim ────────────────────────────────────────────────────────


def test_second_run_downloads_nothing_new(config):
	"""Run twice back to back: the second must store 0 rows and fetch no posts.

	This is the property the whole design turns on.
	"""
	messages = _stream(100, 20, 0.4, "NPN looks strong to me right now")
	collector, session, source = _collector(config, messages)

	collector.collect(["NPN"])
	stored_after_first = len(collector.messages.rows)
	requests_after_first = source.request_count
	assert stored_after_first > 0, "first run should store posts"

	session.requests.clear()
	collector.collect(["NPN"])

	assert len(collector.messages.rows) == stored_after_first, "second run stored duplicate posts"
	# It still asks once, to see whether anything new arrived, and stops on the
	# first post it already holds.
	assert source.request_count == requests_after_first + 1, "second run should cost exactly one page"


def test_first_run_seeds_backwards_and_later_runs_do_not(config):
	messages = _stream(200, 40, 0.5, "NPN has my full attention today")
	collector, session, _ = _collector(config, messages, limit=10)

	collector.collect(["NPN"])
	assert any("max" in req for req in session.requests), "first run should crawl backwards"

	session.requests.clear()
	collector.collect(["NPN"])
	assert len(session.requests) == 1, "seed crawl repeated on a later run"


def test_ticker_that_went_uncollected_catches_up_without_a_hole(config):
	"""A ticker nobody held for several days must come back with no gap.

	This is the case a forward ``since`` cursor gets wrong: StockTwits answers with
	the NEWEST posts matching a filter, so asking for "newer than the last id I
	hold" after a long absence returns the newest page and skips the backlog
	entirely. Walking back until we meet a stored post enumerates the whole gap.
	"""
	original = _stream(700, 10, 0.3, "NPN early chatter before the gap")
	collector, session, source = _collector(config, original, limit=10)
	collector.collect(["NPN"])
	held_before = set(collector.messages.rows)
	assert held_before

	# Days pass with no collection while 45 new posts pile up: far more than one
	# page, so a single request cannot possibly cover them.
	backlog = _stream(800, 45, 0.05, "NPN chatter piled up while we were away")
	session.messages = sorted(original + backlog, key=lambda m: m["id"], reverse=True)

	collector.collect(["NPN"])

	stored = set(collector.messages.rows)
	missed = {m["id"] for m in backlog} - stored
	assert not missed, f"catch-up left a hole: {len(missed)} posts never collected"
	assert held_before <= stored, "catch-up lost posts it already had"
	# It paged back through the backlog rather than grabbing one page and stopping.
	assert len(session.requests) >= 5


def test_catch_up_stops_at_known_posts_and_does_not_recrawl_history(config):
	"""The catch-up must stop where storage begins, not run to the page ceiling."""
	original = _stream(900, 30, 0.4, "NPN older chatter we already stored")
	collector, session, source = _collector(config, original, limit=10)
	collector.collect(["NPN"])
	requests_after_seed = source.request_count

	session.messages = sorted(
		original + _stream(1000, 3, 0.05, "NPN just a few new posts today"),
		key=lambda m: m["id"],
		reverse=True,
	)
	collector.collect(["NPN"])

	# Three new posts sit on the first page, and the walk stops as soon as it meets
	# a stored one.
	assert source.request_count == requests_after_seed + 1


def test_backfill_stops_at_the_window_edge(config):
	"""The crawl must stop once it passes the window, not burn its whole budget."""
	# 60 posts spread over 30 days: half are outside the 14 day window.
	messages = _stream(300, 60, 0.5, "NPN keeps grinding higher again")
	collector, session, _ = _collector(config, messages, limit=10)

	collector.collect(["NPN"])

	# 14 days at 0.5 days per post is ~28 posts, so ~3 pages of 10, well short of
	# the 12 page budget.
	assert len(session.requests) < config.stocktwits_history_max_pages


# ── bucketing ────────────────────────────────────────────────────────────────


def test_buckets_cover_every_day_including_quiet_ones(config):
	messages = [
		_msg(402, "NPN is a great business", days_ago=0.1),
		_msg(401, "NPN really strong results here", days_ago=0.2),
		_msg(400, "NPN had a terrible quarter, awful", days_ago=5.0),
	]
	collector, _, _ = _collector(config, messages)
	collector.collect(["NPN"])
	collector.rebuild_rollups(["NPN"])

	rows = collector.daily.written["NPN"]
	# Exactly the window, ending today. Counting inclusively from a rolling
	# now-minus-N timestamp used to yield N+1 buckets, which surfaced as a 7 day
	# window drawing 8 columns and labelling itself "last 8 days".
	assert len(rows) == config.social_history_days, "every day in the window needs a row"

	by_day = {r["as_of_night"]: r for r in rows}
	today = datetime.datetime.now(UTC).date()
	oldest = today - datetime.timedelta(days=config.social_history_days - 1)
	assert min(by_day) == oldest.isoformat()
	assert max(by_day) == today.isoformat()
	assert by_day[today.isoformat()]["post_count"] == 2

	quiet = [r for r in rows if r["post_count"] == 0]
	assert quiet, "expected quiet days in the window"
	assert all(r["social_sentiment_score"] is None for r in quiet), (
		"a day with no posts must be null, not 0, or the chart implies sentiment crashed"
	)


def test_declared_sentiment_drives_the_bucket_score(config):
	bullish = _stream(500, 5, 0.01, "NPN is the one to own", declared="Bullish")
	collector, _, _ = _collector(config, bullish)
	collector.collect(["NPN"])
	collector.rebuild_rollups(["NPN"])

	today = datetime.datetime.now(UTC).date().isoformat()
	row = next(r for r in collector.daily.written["NPN"] if r["as_of_night"] == today)
	assert row["social_sentiment_score"] > 50
	assert row["bullish_posts"] == 5
	assert row["bearish_posts"] == 0


def test_bucket_score_does_not_drift_as_it_ages(config):
	"""A past day's score must be the same number tomorrow as it is today.

	This is why BucketAggregator switches time decay off: the live aggregator
	decays against now, so rebuilding a rollup would keep nudging old days.
	"""
	aggregator = BucketAggregator(config)
	assert aggregator.recency_weight("2020-01-01T00:00:00+00:00") == 1.0
	assert aggregator.recency_weight(None) == 1.0

	scored = [
		{"sentiment_raw": 0.8, "created_at": "2020-01-01T00:00:00+00:00", "weight": 1.0, "tier": None},
		{"sentiment_raw": 0.8, "created_at": "2026-01-01T00:00:00+00:00", "weight": 1.0, "tier": None},
	]
	assert aggregator.aggregate_signed(scored) == pytest.approx(0.8)


# ── storage round trip ───────────────────────────────────────────────────────


def test_stored_post_rebuilds_with_the_same_weight(config):
	from src.utils.ss_models import SocialMention

	original = SocialMention(
		ticker="NPN",
		text="NPN is doing well",
		source="stocktwits:someone",
		url="https://stocktwits.com/x/1",
		engagement=12,
		likes=8,
		reshares=2,
		replies=2,
		created_at="2026-08-20T10:00:00+00:00",
		declared_sentiment="Bullish",
		weight=3.0,
		message_id=999,
	)
	rebuilt = SocialMention.from_row(original.to_row(0.6), config.stocktwits_engagement_cap)

	assert rebuilt.message_id == 999
	assert rebuilt.likes == 8 and rebuilt.reshares == 2 and rebuilt.replies == 2
	assert rebuilt.declared_sentiment == "Bullish"
	assert rebuilt.username == "someone"
	# Weight is recomputed from the counts, so it matches a freshly collected post.
	assert rebuilt.weight == pytest.approx(
		SocialMention.from_row(original.to_row(), config.stocktwits_engagement_cap).weight
	)


def test_prune_drops_only_posts_past_retention(config):
	messages = [
		_msg(600, "NPN ancient thought from long ago", days_ago=40.0),
		_msg(601, "NPN recent thought from today", days_ago=1.0),
	]
	collector, _, _ = _collector(config, messages)
	# Seed the store directly: the collector's own window would exclude the old one.
	scorer = collector._bucket_scorer()
	from src.utils.ss_social import StockTwitsSource as STS

	parser = STS(config, session=FakeSession(messages))
	for raw in messages:
		mention = parser._parse_message(raw, "NPN", "NPN", set())
		collector.messages.insert_new([mention.to_row(scorer.signed_score(mention))])

	assert len(collector.messages.rows) == 2
	collector.prune()
	assert len(collector.messages.rows) == 1
	assert 601 in collector.messages.rows
