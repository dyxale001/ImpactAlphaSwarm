"""Tests for the daily social sentiment history.

The claims defended here are the ones that cost eighteen minutes last time, plus the
ones that decide whether the numbers on the chart are true.

Cost: the walk stops at the window edge, never exceeds its page ceiling even when
every timestamp is unreadable, and abandons the run when the wall clock budget is
spent. Those three are the reason a seed crawl cannot be reached from here.

Truth: a day is accumulated rather than overwritten, re-recording the same posts
changes nothing, the running sums agree with scoring the day in one go, and the
volume count is the whole day's rather than the number of posts we chose to keep.

Nothing external is touched. StockTwits is a fake stream, and the store is a fake
that records what it was asked to write.
"""

from __future__ import annotations

import datetime
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents import sentiment_scout  # noqa: F401,E402  (import order breaks a cycle)
from src.utils.ss_config import SentimentConfig  # noqa: E402
from src.utils.ss_daily import (  # noqa: E402
	DailyAggregator,
	SocialDayBuilder,
	SocialHistory,
	score_from_sums,
	window_days,
)
from src.utils.ss_scoring import MentionScorer  # noqa: E402
from src.utils.ss_social import StockTwitsSource  # noqa: E402

UTC = datetime.timezone.utc


def cfg(**overrides) -> SentimentConfig:
	base = dict(
		social_history_enabled=True,
		social_display_days=7,
		social_accumulate_days=2,
		stocktwits_day_max_pages=6,
	)
	base.update(overrides)
	return SentimentConfig(**base)


def scored(day: str, message_id: int, raw: float = 0.5, weight: float = 1.0, hour: int = 12):
	"""One entry shaped like MentionScorer.score puts in its ``scored`` list."""
	return {
		"text": f"post {message_id}",
		"headline": None,
		"source": f"stocktwits:user{message_id}",
		"url": f"https://stocktwits.com/{message_id}",
		"engagement": 0,
		"likes": 0,
		"reshares": 0,
		"replies": 0,
		"weight": weight,
		"created_at": f"{day}T{hour:02d}:00:00+00:00",
		"message_id": message_id,
		"tier": None,
		"sentiment_raw": raw,
		"sentiment_contribution": round((raw + 1) * 50, 2),
	}


# ── the message id survives scoring ──────────────────────────────────────────


class NoGcp:
	"""Stands in for the metered API, so nothing here reaches the network."""

	def score(self, text):
		return None

	def score_many(self, texts):
		return {}


def test_the_scorer_carries_the_message_id_onto_the_scored_entry():
	"""The regression that broke this feature in production, at its source.

	``scored()`` above is a fixture, and it has carried message_id since the day it was
	written. ``MentionScorer.score`` did not: it copied ten other fields off the mention
	and quietly dropped this one. So every test in this file passed against a shape the
	real code never produced, while every day row written in production carried a high
	water mark of zero, and the accumulate RPC discarded every write after the first for
	a given day. Nothing raised, anywhere.

	This asserts against the real scorer for exactly that reason. A fixture cannot
	defend a shape it invents.
	"""
	from src.utils.ss_models import SocialMention
	from src.utils.ss_scoring import EngagementPriority

	scorer = MentionScorer(cfg(gcp_top_n=0), gcp=NoGcp())
	mentions = [
		SocialMention(ticker="AAPL", text="calls printing", source="stocktwits:a", message_id=770),
		SocialMention(ticker="AAPL", text="heading to zero", source="stocktwits:b", message_id=771),
	]

	result = scorer.score(mentions, EngagementPriority())
	assert [item["message_id"] for item in result["scored"]] == [770, 771]


def test_a_news_mention_scores_with_a_null_id_rather_than_no_key():
	"""News carries no id and nothing dedupes it. The key still has to be present and
	None: the day builder asks ``is not None``, and an absent key would make that a
	KeyError on the one code path news and social share."""
	from src.utils.ss_models import SocialMention
	from src.utils.ss_scoring import RecencyPriority

	scorer = MentionScorer(cfg(gcp_top_n=0), gcp=NoGcp())
	article = SocialMention(ticker="AAPL", text="Apple beats estimates", source="finnhub:reuters")

	result = scorer.score([article], RecencyPriority())
	assert result["scored"][0]["message_id"] is None


def test_a_day_row_built_from_real_scorer_output_carries_a_real_mark():
	"""The two halves joined up. A zero mark here is what froze every day in production,
	so this walks the actual seam rather than trusting either side alone."""
	from src.utils.ss_models import SocialMention
	from src.utils.ss_scoring import EngagementPriority

	scorer = MentionScorer(cfg(gcp_top_n=0), gcp=NoGcp())
	mentions = [
		SocialMention(
			ticker="AAPL",
			text=f"post {i}",
			source=f"stocktwits:u{i}",
			created_at="2026-08-28T12:00:00+00:00",
			message_id=i,
		)
		for i in (704, 705, 706)
	]

	result = scorer.score(mentions, EngagementPriority())
	row = SocialDayBuilder(cfg()).build("AAPL", result["scored"])[0]
	assert row["last_message_id"] == 706


# ── the window ───────────────────────────────────────────────────────────────


def test_window_is_seven_consecutive_days_including_the_weekend():
	# Ends on a Sunday, so the window covers a whole weekend rather than stepping over
	# it. The build this came from skipped weekends, which lost genuine crypto activity.
	days = window_days(7, today=datetime.date(2026, 8, 30))
	assert [d.isoformat() for d in days] == [
		"2026-08-24",
		"2026-08-25",
		"2026-08-26",
		"2026-08-27",
		"2026-08-28",
		"2026-08-29",
		"2026-08-30",
	]


def test_window_is_exactly_the_length_asked_for():
	"""The reverted build asked for seven days and rendered eight, because it counted
	inclusively from a rolling ``now - N`` timestamp."""
	for length in (1, 3, 5, 10):
		assert len(window_days(length, today=datetime.date(2026, 8, 26))) == length


def test_weekend_posts_get_their_own_rows():
	"""The opposite of what the reverted build asserted. Dropping Saturday and Sunday
	was defensible for equities and wrong for crypto, which trades through both."""
	builder = SocialDayBuilder(cfg())
	# 2026-08-29 is a Saturday, 2026-08-30 a Sunday.
	rows = builder.build("BTC-USD", [scored("2026-08-29", 1), scored("2026-08-30", 2)])
	assert [r["as_of_night"] for r in rows] == ["2026-08-29", "2026-08-30"]


def test_posts_without_a_timestamp_are_skipped():
	builder = SocialDayBuilder(cfg())
	item = scored("2026-08-28", 1)
	item["created_at"] = None
	assert builder.build("AAPL", [item]) == []


# ── bucketing and the numbers on the row ─────────────────────────────────────


def test_posts_are_bucketed_by_utc_day():
	builder = SocialDayBuilder(cfg())
	rows = builder.build(
		"AAPL",
		[scored("2026-08-27", 1), scored("2026-08-28", 2), scored("2026-08-28", 3)],
	)
	assert [(r["as_of_night"], r["post_count"]) for r in rows] == [
		("2026-08-27", 1),
		("2026-08-28", 2),
	]


def test_bullish_and_bearish_split_uses_the_scorer_threshold():
	builder = SocialDayBuilder(cfg())
	above = MentionScorer.BULLISH_THRESHOLD
	rows = builder.build(
		"AAPL",
		[
			scored("2026-08-28", 1, raw=above),
			scored("2026-08-28", 2, raw=-above),
			scored("2026-08-28", 3, raw=0.0),
		],
	)
	assert (rows[0]["bullish_posts"], rows[0]["bearish_posts"], rows[0]["post_count"]) == (1, 1, 3)


def test_running_sums_reproduce_scoring_the_whole_day_at_once():
	"""The row keeps a numerator and a denominator rather than a finished average, so
	two samples can be added. That is only worth anything if the result matches what
	the aggregator would have said given every post together."""
	config = cfg()
	items = [
		scored("2026-08-28", 1, raw=0.8, weight=3.0),
		scored("2026-08-28", 2, raw=-0.2, weight=1.0),
		scored("2026-08-28", 3, raw=0.1, weight=2.0),
	]
	row = SocialDayBuilder(config).build("AAPL", items)[0]

	direct = DailyAggregator(config).aggregate_signed(items)
	expected = int(round(max(0.0, min(1.0, (direct + 1.0) / 2.0)) * 100))
	assert row["social_sentiment_score"] == expected


def test_a_day_split_across_two_samples_scores_the_same_as_one():
	"""The whole point of the running sums. Half the day now, half later, same number."""
	config = cfg()
	first = [scored("2026-08-28", 1, raw=0.8, weight=3.0)]
	second = [scored("2026-08-28", 2, raw=-0.2, weight=1.0)]

	builder = SocialDayBuilder(config)
	repo = InMemoryRepository()
	repo.accumulate(builder.build("AAPL", first))
	repo.accumulate(builder.build("AAPL", second))
	merged = repo.rows[("AAPL", "2026-08-28")]

	together = builder.build("AAPL", first + second)[0]
	assert merged["post_count"] == together["post_count"] == 2
	assert merged["social_sentiment_score"] == together["social_sentiment_score"]


def test_a_row_is_self_consistent_with_its_own_stored_sums():
	"""Recomputing the score from the two stored columns must give back the stored
	score. When it did not, a day assembled from two samples came out a point away
	from the same day collected in one go."""
	builder = SocialDayBuilder(cfg())
	repo = InMemoryRepository()
	repo.accumulate(builder.build("AAPL", [scored("2026-08-28", 1, raw=0.8, weight=3.0)]))
	repo.accumulate(builder.build("AAPL", [scored("2026-08-27", 2, raw=-0.35, weight=1.7)]))
	repo.accumulate(builder.build("AAPL", [scored("2026-08-28", 9, raw=-0.2, weight=1.0)]))

	for row in repo.rows.values():
		assert row["social_sentiment_score"] == score_from_sums(
			row["weighted_score_sum"], row["weight_sum"]
		)


def test_a_post_with_message_id_zero_is_still_counted():
	"""Zero is a legitimate id, and an absent high water mark defaults to zero. The
	comparison in the accumulate RPC is ``<=``, so the first sample of a day carrying
	only id zero must still land."""
	builder = SocialDayBuilder(cfg())
	rows = builder.build("AAPL", [scored("2026-08-28", 0)])
	assert rows and rows[0]["post_count"] == 1

	repo = InMemoryRepository()
	repo.accumulate(rows)
	assert repo.rows[("AAPL", "2026-08-28")]["post_count"] == 1


def test_the_daily_aggregator_ignores_time_of_day():
	"""If a post's weight drifted with age, the stored sums would stop meaning
	anything the moment a second sample arrived."""
	config = cfg()
	morning = SocialDayBuilder(config).build("AAPL", [scored("2026-08-28", 1, hour=1)])[0]
	evening = SocialDayBuilder(config).build("AAPL", [scored("2026-08-28", 2, hour=23)])[0]
	assert morning["weight_sum"] == evening["weight_sum"]


# ── the high water mark ──────────────────────────────────────────────────────


def test_posts_at_or_below_the_stored_mark_are_not_counted_again():
	builder = SocialDayBuilder(cfg())
	items = [scored("2026-08-28", 1), scored("2026-08-28", 2), scored("2026-08-28", 3)]
	rows = builder.build("AAPL", items, marks={"2026-08-28": 2})
	assert rows[0]["post_count"] == 1
	assert rows[0]["last_message_id"] == 3


def test_the_rpc_gate_alone_would_not_be_enough():
	"""The two guards catch different things and neither covers the other.

	A sample carrying posts 1, 2 and 3 against a stored mark of 2 has a newest id above
	that mark, so the RPC's check waves it through and it adds all three. Only the
	per-post filter knows that two of them were already counted. Dropping that filter is
	an easy thing to do while moving the merge into SQL, and this is what it costs.
	"""
	builder = SocialDayBuilder(cfg())
	repo = InMemoryRepository()
	repo.accumulate(builder.build("AAPL", [scored("2026-08-28", 1), scored("2026-08-28", 2)]))

	unfiltered = builder.build(
		"AAPL", [scored("2026-08-28", 1), scored("2026-08-28", 2), scored("2026-08-28", 3)]
	)
	repo.accumulate(unfiltered)
	assert repo.rows[("AAPL", "2026-08-28")]["post_count"] == 5, (
		"the RPC gate cannot tell which posts are new; this is why marks exist"
	)


def test_re_recording_the_same_sample_changes_nothing():
	"""A user refreshing twice in a row must not double a day's volume."""
	builder = SocialDayBuilder(cfg())
	items = [scored("2026-08-28", 1), scored("2026-08-28", 2)]
	repo = InMemoryRepository()

	repo.accumulate(builder.build("AAPL", items))
	repo.accumulate(builder.build("AAPL", items))
	assert repo.rows[("AAPL", "2026-08-28")]["post_count"] == 2


def test_a_later_sample_adds_to_the_day_rather_than_replacing_it():
	builder = SocialDayBuilder(cfg())
	repo = InMemoryRepository()

	repo.accumulate(builder.build("AAPL", [scored("2026-08-28", 1), scored("2026-08-28", 2)]))
	repo.accumulate(builder.build("AAPL", [scored("2026-08-28", 3)]))

	row = repo.rows[("AAPL", "2026-08-28")]
	assert row["post_count"] == 3
	assert row["last_message_id"] == 3


# ── a full walk replaces, a run adds ─────────────────────────────────────────


def test_a_full_walk_replaces_a_day_a_shallow_run_got_wrong():
	"""The failure this fix exists for, restated as a test.

	A nightly run skims six pages of the head and stores the little it saw. The backfill
	then reads the same day thirty pages deep and finds the truth. The walk's older ids
	are far BELOW the mark the run left behind, so it can never satisfy a "newer than"
	guard, and before migrations/020 its write was discarded in silence: production held
	6 posts for an ORCL day a live walk found 110 in.

	A walk does not offer an increment. It states the total.
	"""
	builder = SocialDayBuilder(cfg())
	repo = InMemoryRepository()

	repo.accumulate(builder.build("ORCL", [scored("2026-08-28", i) for i in range(105, 111)]))
	assert repo.rows[("ORCL", "2026-08-28")]["post_count"] == 6

	whole_day = builder.build("ORCL", [scored("2026-08-28", i) for i in range(1, 111)])
	whole_day[0]["seeded"] = True
	repo.accumulate(whole_day)

	row = repo.rows[("ORCL", "2026-08-28")]
	assert row["post_count"] == 110, "the walk read the whole day; its count is the day"
	assert row["last_message_id"] == 110
	assert row["seeded_at"] == "now"


def test_a_walk_cut_short_never_drags_a_good_day_down():
	"""Replace mode has to be incapable of losing data, or it is just a different bug.

	A walk stopped by its page ceiling covers only part of a very busy day, and taking
	its total wholesale would turn 458 posts into 200. The count comparison sends that
	sample down the ordinary path instead, where its ids sit at or below the stored mark
	and it becomes a no-op.
	"""
	builder = SocialDayBuilder(cfg())
	repo = InMemoryRepository()

	full = builder.build("MU", [scored("2026-08-28", i) for i in range(1, 459)])
	full[0]["seeded"] = True
	repo.accumulate(full)

	partial = builder.build("MU", [scored("2026-08-28", i) for i in range(259, 459)])
	partial[0]["seeded"] = True
	repo.accumulate(partial)

	assert repo.rows[("MU", "2026-08-28")]["post_count"] == 458


def test_a_run_after_a_walk_still_adds_rather_than_replacing():
	"""Only a walk replaces. A run that skimmed the head knows a slice of the day, and
	if it overwrote with that slice the chart would fall back to the shallow count every
	night at 22:00."""
	builder = SocialDayBuilder(cfg())
	repo = InMemoryRepository()

	walked = builder.build("ORCL", [scored("2026-08-28", i) for i in range(1, 111)])
	walked[0]["seeded"] = True
	repo.accumulate(walked)

	# The run's own filter has already removed everything at or below the stored mark,
	# so what reaches the store is the two posts written since the walk.
	repo.accumulate(
		builder.build(
			"ORCL",
			[scored("2026-08-28", i) for i in range(109, 113)],
			marks={"2026-08-28": 110},
		)
	)

	row = repo.rows[("ORCL", "2026-08-28")]
	assert row["post_count"] == 112
	assert row["last_message_id"] == 112


# ── top posts ────────────────────────────────────────────────────────────────


def test_top_posts_are_capped_per_day_and_ranked_by_influence():
	config = cfg(social_day_top_posts=3)
	items = [scored("2026-08-28", i, raw=0.1 * i, weight=float(i)) for i in range(1, 9)]
	row = SocialDayBuilder(config).build("AAPL", items)[0]

	assert len(row["top_posts"]) == 3
	ranks = [post["rank"] for post in row["top_posts"]]
	assert ranks == sorted(ranks, reverse=True)
	# The count is the whole day, not the number of posts kept. This is the
	# distinction that decides whether the volume bar tells the truth.
	assert row["post_count"] == 8


def test_top_posts_carry_the_shape_the_frontend_renders():
	row = SocialDayBuilder(cfg()).build("AAPL", [scored("2026-08-28", 1)])[0]
	post = row["top_posts"][0]
	for field in ("platform", "author", "date", "text", "url", "sentiment", "sentiment_score"):
		assert field in post, field


# ── the walk: the three cost guards ──────────────────────────────────────────


class FakeStream:
	"""A StockTwits stand-in that always says there is another page."""

	def __init__(self, created_at, per_page: int = 30, delay: float = 0.0):
		self.created_at = created_at
		self.per_page = per_page
		self.delay = delay
		self.calls = 0

	def get(self, url, params=None, headers=None, timeout=None):
		self.calls += 1
		if self.delay:
			time.sleep(self.delay)
		start = self.calls * 1000
		messages = [
			{
				"id": start + i,
				"body": f"AAPL looks strong today number {i}",
				"created_at": self.created_at,
				"user": {"username": f"u{start + i}"},
				"symbols": [{"symbol": "AAPL"}],
			}
			for i in range(self.per_page)
		]
		return FakeResponse({"messages": messages, "cursor": {"more": True, "max": start}})


class FakeResponse:
	status_code = 200

	def __init__(self, payload):
		self._payload = payload

	def json(self):
		return self._payload


def source_with(stream, config) -> StockTwitsSource:
	src = StockTwitsSource(config, session=stream)
	src.limiter = _NoWait()
	return src


class _NoWait:
	def wait(self) -> None:
		return None


def test_the_walk_stops_once_a_page_reaches_past_the_window():
	"""A quiet ticker costs one request, which is cheaper than the two pages the old
	fixed walk always paid for."""
	old = (datetime.datetime.now(UTC) - datetime.timedelta(days=40)).isoformat()
	stream = FakeStream(old)
	src = source_with(stream, cfg())
	src.collect(["AAPL"])
	assert src.request_count == 1


def test_the_page_ceiling_holds_when_every_timestamp_is_unreadable():
	"""The ceiling is a bounded loop, not a condition, so a stream the window check
	cannot read still cannot run away. This is the guard that makes the eighteen
	minute crawl unreachable."""
	stream = FakeStream("not-a-date")
	src = source_with(stream, cfg(stocktwits_day_max_pages=4))
	src.collect(["AAPL"])
	assert src.request_count == 4


def test_the_wall_clock_budget_cuts_a_run_short_without_raising():
	"""The page ceiling bounds requests, not seconds. At six seconds a request a
	degraded StockTwits could sit inside every page cap and still spend the whole
	nightly deadline."""
	from src.utils.ss_social import SocialCollector

	recent = datetime.datetime.now(UTC).isoformat()
	stream = FakeStream(recent, delay=0.05)
	config = cfg(social_collect_max_seconds=0.12, stocktwits_day_max_pages=50)
	collector = SocialCollector(config, sources=[source_with(stream, config)])

	results = collector.collect(["AAPL", "TSLA", "MSFT", "NVDA"])
	assert set(results) == {"AAPL", "TSLA", "MSFT", "NVDA"}
	assert stream.calls < 50, "the budget did not stop the walk"


def test_the_flag_off_restores_the_old_fixed_two_page_walk():
	"""Off means nothing changes. No window, no adaptive paging, no budget."""
	recent = datetime.datetime.now(UTC).isoformat()
	stream = FakeStream(recent)
	src = source_with(stream, SentimentConfig(social_history_enabled=False))
	src.collect(["AAPL"])
	assert src.request_count == 2
	assert src.window_start() is None


def test_posts_older_than_the_window_never_reach_the_score():
	old = (datetime.datetime.now(UTC) - datetime.timedelta(days=40)).isoformat()
	src = source_with(FakeStream(old), cfg())
	assert src.collect(["AAPL"])["AAPL"] == []


# ── recording ────────────────────────────────────────────────────────────────


class FakeRepository:
	def __init__(self):
		self.calls: list[list[dict]] = []
		self.marked: list[str] = []
		self.marks: dict[tuple[str, str], int] = {}
		self.reads = 0
		self.pruned = 0

	def read_marks(self, tickers, since):
		self.reads += 1
		return self.marks

	def accumulate(self, rows):
		self.calls.append(rows)
		return len(rows)

	def mark_seeded(self, ticker, day):
		self.marked.append(ticker.upper())

	def seeded_tickers(self, tickers):
		return set()

	def read_history(self, ticker, since):
		return []

	def prune(self, before):
		self.pruned += 1


def test_recording_a_whole_run_costs_one_read_and_one_write():
	"""Per ticker round trips are what eat the request budget; save_top_assets is
	already about three seconds a ticker."""
	repo = FakeRepository()
	history = SocialHistory(cfg(), repository=repo)
	history.record({f"T{i}": [scored("2026-08-28", i)] for i in range(12)})

	assert repo.reads == 1
	assert len(repo.calls) == 1
	assert len(repo.calls[0]) == 12


def test_recording_never_raises_when_the_store_is_broken():
	class Broken(FakeRepository):
		def read_marks(self, tickers, since):
			raise RuntimeError("supabase is down")

	history = SocialHistory(cfg(), repository=Broken())
	assert history.record({"AAPL": [scored("2026-08-28", 1)]}) == 0


def test_recording_is_a_no_op_while_the_flag_is_off():
	repo = FakeRepository()
	history = SocialHistory(SentimentConfig(social_history_enabled=False), repository=repo)
	assert history.record({"AAPL": [scored("2026-08-28", 1)]}) == 0
	assert repo.calls == [] and repo.reads == 0


def test_a_seed_is_never_filtered_against_the_stored_mark():
	"""Carrying message_id is not on its own a fix, and this is the trap it walks into.

	A seed reads backwards from the head, so its ids DESCEND into whatever a run stored
	rather than climbing past it. Filter a seed against that mark and the whole sample is
	dropped: the guard stops rejecting the write for being "not new" and starts rejecting
	it for being "too old", which looks identical from the outside.

	The mark read is skipped outright rather than merely ignored, which also spares the
	round trip on the path a page load waits behind.
	"""
	repo = FakeRepository()
	repo.marks = {("AAPL", "2026-08-28"): 500}
	history = SocialHistory(cfg(), repository=repo)

	history.record({"AAPL": [scored("2026-08-28", i) for i in (11, 12, 13)]}, seeded=True)

	assert repo.reads == 0, "a seed must not spend a round trip on a mark it cannot use"
	row = repo.calls[0][0]
	assert row["post_count"] == 3
	assert row["seeded"] is True


def test_a_run_is_still_filtered_against_the_stored_mark():
	"""The other half of the pair. A run walks forwards from what it last saw, so the
	mark is exactly right for it and dropping the filter would double count a refresh."""
	repo = FakeRepository()
	repo.marks = {("AAPL", "2026-08-28"): 12}
	history = SocialHistory(cfg(), repository=repo)

	history.record({"AAPL": [scored("2026-08-28", i) for i in (11, 12, 13)]})

	assert repo.reads == 1
	assert repo.calls[0][0]["post_count"] == 1


def test_a_silent_seed_still_records_that_it_walked():
	"""Otherwise a genuinely quiet ticker is indistinguishable from one nobody has ever
	crawled, and it re-crawls on every page load forever. migrations/015 hit this."""
	repo = FakeRepository()
	history = SocialHistory(cfg(), repository=repo)

	history.record({"QUIET": []}, seeded=True)
	assert repo.marked == ["QUIET"]

	# A run, as opposed to a seed, leaves no mark: it never walked the history.
	repo.marked.clear()
	history.record({"QUIET": []})
	assert repo.marked == []


def test_history_pads_the_window_and_marks_quiet_days_null():
	"""A quiet day is a gap, not a crash to zero. Drawing silence as zero was the most
	misleading thing the first version of this chart did."""
	history = SocialHistory(cfg(), repository=FakeRepository())
	points = history.history("AAPL", days=7)

	assert len(points) == 7
	assert all(point["score"] is None and point["post_count"] == 0 for point in points)


# ── the scout keeps its bookkeeping to itself ────────────────────────────────


def test_the_scored_key_never_escapes_the_scout():
	"""That payload is fed to the reasoning tracer, the LLM prompts and
	ai_recommendation. None of them should ever see the scout's own bookkeeping."""
	from src.agents.sentiment_scout import _SCORED_KEY, SentimentScout

	class NoSocial:
		def collect(self, tickers):
			return {t: [] for t in tickers}

	class NoNews:
		def collect(self, tickers, mode=None):
			return {t: [] for t in tickers}

	scout = SentimentScout(social_collector=NoSocial(), news_collector=NoNews())
	results = scout.analyze_tickers(["AAPL", "TSLA"])
	assert all(_SCORED_KEY not in payload for payload in results.values())
	assert _SCORED_KEY not in scout.analyze_ticker("MSFT")


# ── the persistence cap does not touch the volume ────────────────────────────


def test_the_recommendation_cap_keeps_the_most_influential_posts():
	"""The payload arrives newest first, so a plain slice would keep the most recent
	posts rather than the ones that actually moved the score."""
	from src.utils.rec_writer import RecommendationWriter

	posts = [{"text": f"p{i}", "influence": float(i)} for i in range(20)]
	kept = RecommendationWriter._top_social_posts(posts)
	assert len(kept) == 5
	assert [p["influence"] for p in kept] == [19.0, 18.0, 17.0, 16.0, 15.0]


# ── end to end ───────────────────────────────────────────────────────────────


class InMemoryRepository:
	"""A whole store in a dict, keyed the way the real table is keyed.

	:meth:`accumulate` is a faithful Python restatement of what
	``accumulate_social_day`` does after migrations/020: a seeded sample that saw at
	least as much as is stored replaces the day outright, and anything else adds the
	running sums, takes the greater high water mark, replaces top_posts, and is rejected
	outright if its newest message id is not above what is already counted.

	It exists because the merge lives in Postgres now and there is no local Postgres in
	this repo to run it against. So this is the specification the SQL has to satisfy,
	and the SQL itself is checked by hand-running the migration. Keep the two in step:
	if one changes, the other is wrong.
	"""

	def __init__(self):
		self.rows: dict[tuple[str, str], dict] = {}

	def read_marks(self, tickers, since):
		wanted = {t.upper() for t in tickers}
		return {
			key: int(row.get("last_message_id") or 0)
			for key, row in self.rows.items()
			if key[0] in wanted and key[1] >= since.isoformat()
		}

	def accumulate(self, rows):
		for row in rows:
			key = (row["ticker"], row["as_of_night"])
			stored = self.rows.get(key)
			if stored is None:
				merged = dict(row)
				if row.get("seeded"):
					merged["seeded_at"] = "now"
				self.rows[key] = merged
				continue

			# A complete walk of the day that saw at least as much as is on record states
			# the day's total rather than offering an increment, so it overwrites. The
			# count comparison is what stops a walk cut short by its page ceiling from
			# dragging a good day down; such a sample falls through to the mark guard
			# below, which turns it into a no-op.
			if row.get("seeded") and row["post_count"] >= stored["post_count"]:
				stored.update(
					post_count=row["post_count"],
					bullish_posts=row["bullish_posts"],
					bearish_posts=row["bearish_posts"],
					weight_sum=row["weight_sum"],
					weighted_score_sum=row["weighted_score_sum"],
					social_sentiment_score=score_from_sums(
						row["weighted_score_sum"], row["weight_sum"]
					),
					last_message_id=max(stored["last_message_id"], row["last_message_id"]),
					top_posts=row.get("top_posts", stored.get("top_posts")),
					seeded_at="now",
				)
				continue

			if int(row.get("last_message_id") or 0) <= int(stored.get("last_message_id") or 0):
				if row.get("seeded"):
					stored.setdefault("seeded_at", "now")
				continue

			weight_sum = round(stored["weight_sum"] + row["weight_sum"], 4)
			score_sum = round(stored["weighted_score_sum"] + row["weighted_score_sum"], 4)
			stored.update(
				post_count=stored["post_count"] + row["post_count"],
				bullish_posts=stored["bullish_posts"] + row["bullish_posts"],
				bearish_posts=stored["bearish_posts"] + row["bearish_posts"],
				weight_sum=weight_sum,
				weighted_score_sum=score_sum,
				social_sentiment_score=score_from_sums(score_sum, weight_sum),
				last_message_id=max(stored["last_message_id"], row["last_message_id"]),
				top_posts=row.get("top_posts", stored.get("top_posts")),
			)
			if row.get("seeded"):
				stored.setdefault("seeded_at", "now")
		return len(rows)

	def mark_seeded(self, ticker, day):
		key = (ticker.upper(), day.isoformat())
		self.rows.setdefault(
			key,
			{
				"ticker": ticker.upper(),
				"as_of_night": day.isoformat(),
				"post_count": 0,
				"bullish_posts": 0,
				"bearish_posts": 0,
				"weight_sum": 0.0,
				"weighted_score_sum": 0.0,
				"last_message_id": 0,
				"top_posts": [],
				"social_sentiment_score": None,
			},
		)["seeded_at"] = "now"

	def seeded_tickers(self, tickers):
		wanted = {t.upper() for t in tickers}
		return {k[0] for k, row in self.rows.items() if k[0] in wanted and row.get("seeded_at")}

	def read_history(self, ticker, since):
		return sorted(
			(dict(r) for k, r in self.rows.items() if k[0] == ticker.upper() and k[1] >= since.isoformat()),
			key=lambda r: r["as_of_night"],
		)

	def prune(self, before):
		return None


def test_a_run_recorded_then_served_comes_back_as_the_chart_expects():
	"""Record a couple of days, then read the series the endpoint returns."""
	repo = InMemoryRepository()
	history = SocialHistory(cfg(), repository=repo)
	window = window_days(7)
	first, second = window[-2].isoformat(), window[-1].isoformat()

	history.record(
		{
			"AAPL": [
				scored(first, 1, raw=0.6),
				scored(second, 2, raw=-0.4),
				scored(second, 3, raw=0.2),
			]
		}
	)

	points = history.history("AAPL", days=7)
	assert len(points) == 7
	assert [p["date"] for p in points] == [d.isoformat() for d in window]

	by_date = {p["date"]: p for p in points}
	assert by_date[first]["post_count"] == 1
	assert by_date[second]["post_count"] == 2
	assert by_date[second]["score"] is not None
	assert by_date[second]["top_posts"], "the day's posts should come back with it"
	# Days we never wrote are gaps, not zeroes.
	untouched = [p for p in points if p["date"] not in (first, second)]
	assert all(p["score"] is None and p["post_count"] == 0 for p in untouched)


def test_a_second_run_the_same_day_adds_rather_than_doubling_or_replacing():
	"""The behaviour a user refresh depends on, through the real record path."""
	repo = InMemoryRepository()
	history = SocialHistory(cfg(), repository=repo)
	day = window_days(7)[-1].isoformat()

	history.record({"AAPL": [scored(day, 1), scored(day, 2)]})
	# The same posts again, as an immediate re-refresh would send.
	history.record({"AAPL": [scored(day, 1), scored(day, 2)]})
	assert history.history("AAPL", days=7)[-1]["post_count"] == 2

	# Now a genuinely newer post arrives.
	history.record({"AAPL": [scored(day, 1), scored(day, 2), scored(day, 3)]})
	assert history.history("AAPL", days=7)[-1]["post_count"] == 3


def test_score_from_sums_returns_null_rather_than_fifty_for_an_empty_day():
	assert score_from_sums(0.0, 0.0) is None
	assert score_from_sums(0.0, 4.0) == 50
