"""Tests for the daily news sentiment history.

The claims defended here are the ones that decide whether the news line on the chart is
true, plus the two that separate this from the social history it is modelled on.

Truth: a day is scored with recency decay OFF, so the same articles score the same
whenever they are read; reliability tiers still apply within a day, so a wire story
outweighs a blog on the same date; and a day's score is the aggregator's, on the same
0 to 100 scale as the card, rather than an average this module invents for itself.

Difference: a run states a day rather than adding to it, and articles carry no
message_id to dedupe on, so re-recording the same articles must be idempotent by
construction instead of by a high water mark.

Nothing external is touched. The store is a fake that records what it was asked to
write.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents import sentiment_scout  # noqa: F401,E402  (import order breaks a cycle)
from src.utils.ns_daily import (  # noqa: E402
	NewsDayBuilder,
	NewsHistory,
	score_from_signed,
)
from src.utils.ss_config import SentimentConfig  # noqa: E402
from src.utils.ss_scoring import MentionScorer  # noqa: E402

UTC = datetime.timezone.utc


def cfg(**overrides) -> SentimentConfig:
	base = dict(
		news_history_enabled=True,
		social_display_days=7,
		news_day_top_articles=8,
	)
	base.update(overrides)
	return SentimentConfig(**base)


def article(
	day: str,
	source: str = "finnhub:Reuters",
	tier: int = 1,
	raw: float = 0.5,
	hour: int = 12,
	headline: str | None = None,
):
	"""One entry shaped like MentionScorer.score puts in its ``scored`` list.

	news mentions carry message_id None, which ss_scoring is explicit about and which
	this fixture mirrors: nothing about news is deduped on an id.
	"""
	return {
		"text": headline or f"story from {source}",
		"headline": headline or f"story from {source}",
		"source": source,
		"url": f"https://example.com/{day}/{source}",
		"engagement": 0,
		"likes": 0,
		"reshares": 0,
		"replies": 0,
		"weight": 1.0,
		"created_at": f"{day}T{hour:02d}:00:00+00:00",
		"message_id": None,
		"tier": tier,
		"sentiment_raw": raw,
		"sentiment_contribution": round((raw + 1) * 50, 2),
	}


class FakeRepo:
	"""Records what it was asked to write, and answers reads from that."""

	def __init__(self):
		self.rows: list[dict] = []
		self.pruned_before: datetime.date | None = None

	def upsert(self, rows):
		self.rows.extend(rows)
		return len(rows)

	def read_history(self, ticker, since):
		return [r for r in self.rows if r["ticker"] == ticker.upper()]

	def prune(self, before):
		self.pruned_before = before


# ── bucketing ────────────────────────────────────────────────────────────────


def test_articles_are_bucketed_by_utc_day():
	builder = NewsDayBuilder(cfg())
	rows = builder.build(
		"AAPL",
		[article("2026-08-27"), article("2026-08-28"), article("2026-08-28", hour=23)],
	)
	assert [(r["as_of_day"], r["article_count"]) for r in rows] == [
		("2026-08-27", 1),
		("2026-08-28", 2),
	]


def test_articles_without_a_timestamp_are_skipped():
	builder = NewsDayBuilder(cfg())
	item = article("2026-08-28")
	item["created_at"] = None
	assert builder.build("AAPL", [item]) == []


def test_a_day_with_no_articles_produces_no_row():
	"""Quiet days are absent rather than written as explicit nulls. The serving side
	pads the window, so the window's length lives in one place."""
	assert NewsDayBuilder(cfg()).build("AAPL", []) == []


def test_weekend_articles_get_their_own_rows():
	builder = NewsDayBuilder(cfg())
	# 2026-08-29 is a Saturday, 2026-08-30 a Sunday.
	rows = builder.build("BTC-USD", [article("2026-08-29"), article("2026-08-30")])
	assert [r["as_of_day"] for r in rows] == ["2026-08-29", "2026-08-30"]


# ── the numbers on the row ───────────────────────────────────────────────────


def test_recency_decay_is_off_within_a_day():
	"""The claim the whole table rests on.

	Two articles of the same tier, eleven hours apart on one day, must weigh the same.
	The inherited two day half life exists to compare days, not to grade inside one, and
	if it applied here a day's stored score would depend on the hour it was computed.
	"""
	builder = NewsDayBuilder(cfg())
	morning = builder.build("AAPL", [article("2026-08-28", raw=1.0, hour=1)])
	evening = builder.build("AAPL", [article("2026-08-28", raw=1.0, hour=23)])
	assert morning[0]["news_sentiment_score"] == evening[0]["news_sentiment_score"]


def test_a_day_read_twice_scores_the_same():
	"""No accumulation and no id to dedupe on, so idempotence has to come from the
	arithmetic itself. Building the same articles twice must give the same row."""
	builder = NewsDayBuilder(cfg())
	items = [article("2026-08-28", raw=0.4), article("2026-08-28", tier=3, raw=-0.2)]
	assert builder.build("AAPL", items) == builder.build("AAPL", items)


def test_tiers_still_outweigh_each_other_within_a_day():
	"""Decay is off, but reliability is not. One tier 1 wire against three tier 3 blogs
	saying the opposite must land nearer the wire, because the tier share is fixed and
	does not grow with how many articles a tier happens to have.
	"""
	builder = NewsDayBuilder(cfg())
	rows = builder.build(
		"AAPL",
		[
			article("2026-08-28", source="finnhub:Reuters", tier=1, raw=1.0),
			article("2026-08-28", source="finnhub:Blog1", tier=3, raw=-1.0),
			article("2026-08-28", source="finnhub:Blog2", tier=3, raw=-1.0),
			article("2026-08-28", source="finnhub:Blog3", tier=3, raw=-1.0),
		],
	)
	assert rows[0]["news_sentiment_score"] > 50


def test_the_day_score_is_the_aggregator_on_the_card_scale():
	"""The row must not invent its own average. Whatever the aggregator makes of the
	day's articles, mapped by the same arithmetic the scorer uses, is the stored score.
	"""
	builder = NewsDayBuilder(cfg())
	items = [article("2026-08-28", raw=0.6), article("2026-08-28", tier=2, raw=-0.2)]
	rows = builder.build("AAPL", items)
	expected = score_from_signed(builder.aggregator.aggregate_signed(items))
	assert rows[0]["news_sentiment_score"] == expected


def test_bullish_and_bearish_split_uses_the_scorer_threshold():
	builder = NewsDayBuilder(cfg())
	above = MentionScorer.BULLISH_THRESHOLD
	rows = builder.build(
		"AAPL",
		[
			article("2026-08-28", raw=above),
			article("2026-08-28", raw=-above),
			article("2026-08-28", raw=0.0),
		],
	)
	row = rows[0]
	assert (row["bullish_articles"], row["bearish_articles"], row["article_count"]) == (1, 1, 3)


def test_tier_counts_are_recorded_per_day():
	builder = NewsDayBuilder(cfg())
	rows = builder.build(
		"AAPL",
		[
			article("2026-08-28", tier=1),
			article("2026-08-28", tier=3),
			article("2026-08-28", tier=3),
		],
	)
	row = rows[0]
	assert (row["tier1_count"], row["tier2_count"], row["tier3_count"]) == (1, 0, 2)


def test_article_count_is_the_whole_day_not_the_kept_articles():
	"""The count feeds the chart's tooltip, so it has to be the day's real total rather
	than however many of them the row chose to keep."""
	builder = NewsDayBuilder(cfg(news_day_top_articles=2))
	rows = builder.build("AAPL", [article("2026-08-28", hour=h) for h in range(6)])
	assert rows[0]["article_count"] == 6
	assert len(rows[0]["top_articles"]) == 2


def test_top_articles_carry_the_shape_the_frontend_renders():
	"""Stored through NewsPayloadBuilder, so a stored article is the same object a live
	one is and NewsArticleRow reads either without a branch."""
	builder = NewsDayBuilder(cfg())
	rows = builder.build("AAPL", [article("2026-08-28", headline="Chips rally")])
	stored = rows[0]["top_articles"][0]
	assert stored["headline"] == "Chips rally"
	assert stored["date"] == "2026-08-28"
	assert set(stored) >= {"source", "tier", "date", "headline", "url", "sentiment_score"}


# ── the history object ───────────────────────────────────────────────────────


def test_nothing_is_written_while_the_flag_is_off():
	"""One flag, one behaviour change. Off means the table is never touched."""
	repo = FakeRepo()
	history = NewsHistory(cfg(news_history_enabled=False), repository=repo)
	assert history.record({"AAPL": [article("2026-08-28")]}) == 0
	assert repo.rows == []


def test_record_writes_a_row_per_ticker_day():
	repo = FakeRepo()
	history = NewsHistory(cfg(), repository=repo)
	written = history.record(
		{
			"AAPL": [article("2026-08-27"), article("2026-08-28")],
			"MSFT": [article("2026-08-28")],
		}
	)
	assert written == 3
	assert {(r["ticker"], r["as_of_day"]) for r in repo.rows} == {
		("AAPL", "2026-08-27"),
		("AAPL", "2026-08-28"),
		("MSFT", "2026-08-28"),
	}


def test_a_failing_store_never_costs_the_run_its_scores():
	"""History is a view on work already done. It may lose itself; it may not raise."""

	class Broken(FakeRepo):
		def upsert(self, rows):
			raise RuntimeError("supabase down")

	history = NewsHistory(cfg(), repository=Broken())
	assert history.record({"AAPL": [article("2026-08-28")]}) == 0


def test_a_missing_day_comes_back_null_rather_than_zero():
	"""Null and zero mean opposite things: the chart breaks its line for no coverage and
	would draw a crash for a zero."""
	empty = NewsHistory.point(None)
	assert empty["news_score"] is None
	assert empty["news_count"] == 0


def test_a_stored_day_is_served_on_the_keys_the_chart_reads():
	row = {
		"as_of_day": "2026-08-28",
		"news_sentiment_score": 61,
		"article_count": 4,
		"bullish_articles": 3,
		"bearish_articles": 1,
		"tier1_count": 1,
		"tier2_count": 0,
		"tier3_count": 3,
		"top_articles": [],
	}
	point = NewsHistory.point(row)
	assert point["news_score"] == 61
	assert point["news_count"] == 4
	assert point["news_tier_counts"] == {"1": 1, "2": 0, "3": 3}


def test_history_is_keyed_by_day_for_merging_onto_social():
	"""A mapping, not a padded list. Social owns the window; padding here as well would
	put its length in two places that would eventually disagree."""
	repo = FakeRepo()
	history = NewsHistory(cfg(), repository=repo)
	today = datetime.datetime.now(UTC).date().isoformat()
	history.record({"AAPL": [article(today)]})
	assert set(history.history("AAPL", 7)) == {today}
