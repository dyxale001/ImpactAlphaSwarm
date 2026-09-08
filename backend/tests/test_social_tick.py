"""Tests for the intraday top-up that keeps today's bar from being empty.

The claim that decides whether this feature is affordable is a NEGATIVE one, and it is
the first thing asserted here: a tick spends metered scoring ONLY on posts it has not
already counted. The history filters by the stored mark anyway, so a tick that scored
everything it walked would store exactly the same numbers while paying GCP to rescore
the same fifty posts every two hours. The bug would be invisible in the data and visible
only on the bill, which is precisely the kind that survives to production.

The rest is about a tick staying in its lane: it must not walk like a backfill, must not
write in replace mode, and must not fire at all with the history switched off.

Nothing external is touched. StockTwits is a fake stream and the store is a fake.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents import sentiment_scout  # noqa: F401,E402  (import order breaks a cycle)
from src.utils.ss_backfill import SeedRegistry  # noqa: E402
from src.utils.ss_config import SentimentConfig  # noqa: E402
from src.utils.ss_social import StockTwitsSource  # noqa: E402
from src.utils.ss_tick import SocialTicker  # noqa: E402

UTC = datetime.timezone.utc


def cfg(**overrides) -> SentimentConfig:
	base = dict(
		social_history_enabled=True,
		social_tick_enabled=True,
		social_tick_max_pages=2,
		social_tick_quota=60,
		social_display_days=7,
	)
	base.update(overrides)
	return SentimentConfig(**base)


class FakeStream:
	"""Today's posts, newest first, with ids descending as you page back."""

	def __init__(self, per_page: int = 10, pages: int = 5):
		self.per_page = per_page
		self.pages = pages
		self.calls = 0

	def get(self, url, params=None, headers=None, timeout=None):
		self.calls += 1
		# Ids descend with depth, the way a real stream pages backwards: page one holds
		# the newest posts and therefore the highest ids.
		start = 1000 - (self.calls - 1) * self.per_page
		now = datetime.datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)
		messages = [
			{
				"id": start - i,
				"body": f"AAPL looks strong today, post {start - i}",
				"created_at": now.isoformat(),
				"user": {"username": f"u{start - i}"},
				"symbols": [{"symbol": "AAPL"}],
			}
			for i in range(self.per_page)
		]
		more = self.calls < self.pages
		return FakeResponse(
			{"messages": messages, "cursor": {"more": more, "max": start - self.per_page}}
		)


class FakeResponse:
	status_code = 200

	def __init__(self, payload):
		self._payload = payload

	def json(self):
		return self._payload


class _NoWait:
	def wait(self) -> None:
		return None


class FakeRepo:
	def __init__(self, marks: dict[tuple[str, str], int] | None = None):
		self.marks = marks or {}
		self.reads = 0

	def read_marks(self, tickers, since):
		self.reads += 1
		return dict(self.marks)


class FakeHistory:
	"""Stands in for SocialHistory: records what it was asked to store."""

	def __init__(self, config, marks=None):
		self.config = config
		self.enabled = config.social_history_enabled
		self.records: list[tuple[dict, bool]] = []
		self.repository = FakeRepo(marks)

	def record(self, scored_by_ticker, seeded=False):
		self.records.append((scored_by_ticker, seeded))
		return sum(1 for posts in scored_by_ticker.values() if posts)


class FakeScorer:
	"""Counts how many mentions it is asked to score, and remembers which."""

	def __init__(self):
		self.batches: list[int] = []
		self.seen_ids: list[int] = []

	def score(self, mentions, priority):
		self.batches.append(len(mentions))
		self.seen_ids.extend(m.message_id for m in mentions)
		return {
			"scored": [
				{"created_at": m.created_at, "message_id": m.message_id} for m in mentions
			]
		}


def ticker_for(config, stream, marks=None, scorer=None) -> SocialTicker:
	source = StockTwitsSource(config, session=stream)
	source.limiter = _NoWait()
	return SocialTicker(
		config=config,
		history=FakeHistory(config, marks),
		source=source,
		scorer=scorer or FakeScorer(),
		seeds=SeedRegistry(),
	)


def today() -> str:
	return datetime.datetime.now(UTC).date().isoformat()


# ── the claim the whole feature's cost rests on ──────────────────────────────


def test_posts_already_counted_never_reach_the_scorer():
	"""The load bearing test. Metered scoring is spent only on genuinely new posts.

	The mark says the ticker has already counted everything up to id 990. Page one holds
	ids 1000 down to 991, so exactly ten posts are new and the scorer must see ten, not
	the twenty the two page walk returned.
	"""
	scorer = FakeScorer()
	tick = ticker_for(
		cfg(), FakeStream(per_page=10), marks={("AAPL", today()): 990}, scorer=scorer
	)

	tick.tick(["AAPL"])

	assert scorer.batches == [10]
	assert all(mid > 990 for mid in scorer.seen_ids)


def test_a_ticker_with_nothing_new_costs_no_scoring_at_all():
	"""A quiet ticker is free. Most tickers most of the time are this one."""
	scorer = FakeScorer()
	tick = ticker_for(
		cfg(), FakeStream(per_page=10), marks={("AAPL", today()): 99_999}, scorer=scorer
	)

	summary = tick.tick(["AAPL"])

	assert scorer.batches == []
	assert summary["new_posts"] == 0
	assert summary["rows"] == 0


def test_a_ticker_with_no_mark_scores_everything_it_walked():
	"""A day nothing is stored for has no mark, and no post is dropped.

	The guard is ``is not None`` rather than a zero default, so a first tick of the day
	contributes its whole sample instead of silently dropping a post whose id is zero.
	"""
	scorer = FakeScorer()
	tick = ticker_for(cfg(), FakeStream(per_page=10), marks={}, scorer=scorer)

	tick.tick(["AAPL"])

	assert scorer.batches == [20]


def test_yesterdays_mark_never_filters_todays_posts():
	"""Marks are per day, not per ticker.

	Yesterday's mark is far higher than this morning's ids, since ids climb over time.
	Comparing today's posts against it would drop the entire session.
	"""
	scorer = FakeScorer()
	yesterday = (datetime.datetime.now(UTC).date() - datetime.timedelta(days=1)).isoformat()
	tick = ticker_for(
		cfg(),
		FakeStream(per_page=10),
		marks={("AAPL", yesterday): 500_000},
		scorer=scorer,
	)

	tick.tick(["AAPL"])

	assert scorer.batches == [20]


# ── staying in its lane ──────────────────────────────────────────────────────


def test_a_tick_writes_in_accumulate_mode_never_replace():
	"""``seeded=True`` replaces a day's running sums (migrations/020). A tick adds to
	them, so passing it would throw away every earlier pass of the same day."""
	tick = ticker_for(cfg(), FakeStream(per_page=10))

	tick.tick(["AAPL"])

	assert tick.history.records
	_, seeded = tick.history.records[0]
	assert seeded is False


def test_a_tick_walks_far_shallower_than_a_backfill():
	"""Two pages, not thirty. A tick meets the mark and stops; the ceiling is the
	backstop for when it does not."""
	stream = FakeStream(per_page=10, pages=50)
	tick = ticker_for(cfg(social_tick_max_pages=2), stream)

	tick.tick(["AAPL"])

	assert stream.calls == 2


def test_the_tick_does_nothing_with_the_history_switched_off():
	"""Without the history a tick would walk, score and drop the lot, which is the most
	expensive way available to do nothing."""
	stream = FakeStream(per_page=10)
	scorer = FakeScorer()
	tick = ticker_for(cfg(social_history_enabled=False), stream, scorer=scorer)

	summary = tick.tick(["AAPL"])

	assert summary["enabled"] is False
	assert stream.calls == 0
	assert scorer.batches == []


def test_the_tick_does_nothing_with_its_own_flag_off():
	stream = FakeStream(per_page=10)
	tick = ticker_for(cfg(social_tick_enabled=False), stream)

	assert tick.tick(["AAPL"])["enabled"] is False
	assert stream.calls == 0


def test_the_quota_bounds_how_many_tickers_one_pass_walks():
	tick = ticker_for(cfg(social_tick_quota=2), FakeStream(per_page=10))

	summary = tick.tick(["AAPL", "MSFT", "TSLA", "NVDA"])

	assert summary["considered"] == 4
	assert summary["walked"] == 2


def test_a_ticker_already_being_walked_is_skipped_not_walked_twice():
	"""The seed registry is shared with the backfill, so a lazy seed fired by somebody
	opening the asset page and a tick landing on the same ticker collapse to one walk
	against the rate limiter rather than two."""
	seeds = SeedRegistry()
	seeds.claim("AAPL")
	stream = FakeStream(per_page=10)
	source = StockTwitsSource(cfg(), session=stream)
	source.limiter = _NoWait()
	tick = SocialTicker(
		config=cfg(), history=FakeHistory(cfg()), source=source, scorer=FakeScorer(), seeds=seeds
	)

	summary = tick.tick(["AAPL"])

	assert summary["skipped_active"] == 1
	assert summary["walked"] == 0
	assert stream.calls == 0


def test_one_dead_ticker_does_not_cost_the_batch_its_top_up():
	class Exploding:
		calls = 0

		def get(self, *a, **kw):
			raise RuntimeError("stream is down")

	source = StockTwitsSource(cfg(), session=Exploding())
	source.limiter = _NoWait()
	tick = SocialTicker(
		config=cfg(),
		history=FakeHistory(cfg()),
		source=source,
		scorer=FakeScorer(),
		seeds=SeedRegistry(),
	)

	# The source swallows a dead session itself, so this asserts the pass completes and
	# reports rather than raising out of the endpoint.
	summary = tick.tick(["AAPL", "MSFT"])

	assert summary["walked"] == 2
	assert summary["rows"] == 0


def test_the_tick_scorer_uses_its_own_gcp_ceiling():
	"""A tick buys a smaller metered share than a run, so two ticks a day cannot crowd
	the nightly out of the monthly NLP budget."""
	tick = SocialTicker(config=cfg(social_tick_gcp_top_n=3, gcp_top_n=10))

	assert tick.scorer.config.gcp_top_n == 3


def test_marks_are_read_once_for_the_whole_batch():
	"""One read for every ticker, not one each. The same batching a run does."""
	tick = ticker_for(cfg(), FakeStream(per_page=10))

	tick.tick(["AAPL", "MSFT", "TSLA"])

	assert tick.history.repository.reads == 1
