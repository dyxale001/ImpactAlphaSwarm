"""Tests for the generated paragraph behind clicking a day on the trend chart.

The claims that matter here are all about NOT generating. A summary costs an LLM call,
and every one of these tests exists because some path could otherwise pay for a day it
already has: a settled day regenerating on every click, a quiet afternoon regenerating
every ninety minutes to say the same thing, a scheduled job generating a week of prose
for tickers nobody has opened.

So the assertions are mostly on ``generator.calls``. The prose itself is not asserted on,
because it is generated and cannot be; what is asserted is that the model was handed the
whole week and the volume comparison, since a paragraph that cannot place a day in its
week is the thing this was asked for and would not obviously be missing.

Nothing external is touched. Groq is a fake and the store is a fake.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.day_summary import (  # noqa: E402
	DayEvidence,
	DaySummaryGenerator,
	DaySummaryPromptBuilder,
	DaySummaryService,
	WeekDay,
	band_for,
)
from src.utils.ss_config import SentimentConfig  # noqa: E402

UTC = datetime.timezone.utc


def cfg(**overrides) -> SentimentConfig:
	base = dict(
		social_history_enabled=True,
		day_summary_enabled=True,
		day_summary_today_cooldown_minutes=90,
		day_summary_max_chars=900,
		social_display_days=7,
	)
	base.update(overrides)
	return SentimentConfig(**base)


def day_offset(days: int) -> str:
	return (datetime.datetime.now(UTC).date() - datetime.timedelta(days=days)).isoformat()


TODAY = day_offset(0)
YESTERDAY = day_offset(1)


class FakeSocialHistory:
	def __init__(self, config, points=None):
		self.config = config
		self.enabled = True
		self._points = points

	def history(self, ticker, days=None):
		if self._points is not None:
			return self._points
		# A busy day today, a quieter one yesterday, silence before that.
		return [
			{
				"date": day_offset(n),
				"score": {0: 71, 1: 52}.get(n),
				"post_count": {0: 63, 1: 14}.get(n, 0),
				"bullish": {0: 41, 1: 6}.get(n, 0),
				"bearish": {0: 8, 1: 5}.get(n, 0),
				"top_posts": [
					{"author": "trader_x", "text": "big Azure deal", "sentiment": "Positive",
					 "influence": 18.0, "likes": 30, "reshares": 2, "replies": 4}
				] if n in (0, 1) else [],
			}
			for n in range(6, -1, -1)
		]


class FakeNewsHistory:
	def __init__(self, enabled=True, rows=None):
		self.enabled = enabled
		self._rows = rows if rows is not None else {
			TODAY: {
				"news_sentiment_score": 66, "article_count": 5,
				"bullish_articles": 3, "bearish_articles": 1,
				"tier1_count": 2, "tier2_count": 2, "tier3_count": 1,
				"top_articles": [
					{"source": "Reuters", "headline": "Azure capacity deal",
					 "tier": 1, "sentiment": "Positive", "influence": 41.0}
				],
			}
		}

	def history(self, ticker, days=None):
		return dict(self._rows)


class FakeRepo:
	def __init__(self, rows=None, known=None):
		self.rows = rows or {}
		self.known = {t.upper() for t in (known or [])}
		self.writes: list[list[dict]] = []
		self.pruned = False

	def read_day(self, ticker, day):
		return self.rows.get((ticker.upper(), day))

	def read_window(self, ticker, since):
		return {
			day: row
			for (sym, day), row in self.rows.items()
			if sym == ticker.upper() and day >= since.isoformat()
		}

	def upsert(self, rows):
		self.writes.append(rows)
		for row in rows:
			# Mirrors the RPC's guard: a final row is never overwritten.
			key = (row["ticker"], row["as_of_day"])
			if self.rows.get(key, {}).get("is_final"):
				continue
			self.rows[key] = {**row, "generated_at": datetime.datetime.now(UTC).isoformat()}
		return len(rows)

	def tickers_with_summaries(self, tickers):
		return {t.upper() for t in tickers} & self.known

	def prune(self, before):
		self.pruned = True


class FakeGenerator:
	def __init__(self, text="A settled paragraph about the day.", model="fake-model"):
		self.text = text
		self.model = model
		self.calls: list[tuple[str, str, bool]] = []
		self.prompts: list[str] = []

	def generate(self, evidence, *, partial):
		self.calls.append((evidence.ticker, evidence.day, partial))
		self.prompts.append(DaySummaryPromptBuilder().build(evidence, partial=partial))
		return self.text


def service(config=None, rows=None, known=None, generator=None, news=None, points=None):
	config = config or cfg()
	return DaySummaryService(
		config=config,
		history=FakeSocialHistory(config, points),
		news_history=news if news is not None else FakeNewsHistory(),
		repository=FakeRepo(rows, known),
		generator=generator or FakeGenerator(),
	)


def stored(day, *, is_final, post_count=63, news_count=5, age_minutes=0, ticker="AAPL"):
	written = datetime.datetime.now(UTC) - datetime.timedelta(minutes=age_minutes)
	return {
		(ticker, day): {
			"ticker": ticker,
			"as_of_day": day,
			"summary": "Whatever was written last time.",
			"is_final": is_final,
			"post_count": post_count,
			"news_count": news_count,
			"generated_at": written.isoformat(),
		}
	}


# ── the claim the whole feature's cost rests on ──────────────────────────────


def test_a_settled_day_is_never_regenerated():
	"""The load bearing test. Clicking back and forth across a week must cost that week
	once, not once per click."""
	gen = FakeGenerator()
	svc = service(rows=stored(YESTERDAY, is_final=True), generator=gen)

	for _ in range(5):
		result = svc.summary_for("AAPL", YESTERDAY)

	assert gen.calls == []
	assert result["summary"] == "Whatever was written last time."


def test_a_settled_day_is_not_regenerated_even_when_the_evidence_moved():
	"""A later run rewriting a past day's counts must not reopen its prose. History that
	rewrites itself is not history, and it would also be unbounded spend."""
	gen = FakeGenerator()
	svc = service(
		rows=stored(YESTERDAY, is_final=True, post_count=1, news_count=0), generator=gen
	)

	svc.summary_for("AAPL", YESTERDAY)

	assert gen.calls == []


def test_an_open_day_with_unchanged_evidence_is_not_regenerated():
	"""The second half of the "cooldown AND evidence" rule. A dead quiet afternoon must
	not re-bill every ninety minutes to say the same thing in different words."""
	gen = FakeGenerator()
	svc = service(
		rows=stored(TODAY, is_final=False, post_count=63, news_count=5, age_minutes=600),
		generator=gen,
	)

	svc.summary_for("AAPL", TODAY)

	assert gen.calls == []


def test_an_open_day_inside_the_cooldown_is_not_regenerated():
	"""The first half of the rule. Four clicks in a minute cost one call, not four."""
	gen = FakeGenerator()
	svc = service(
		rows=stored(TODAY, is_final=False, post_count=2, news_count=0, age_minutes=5),
		generator=gen,
	)

	svc.summary_for("AAPL", TODAY)

	assert gen.calls == []


def test_an_open_day_regenerates_once_both_conditions_are_met():
	gen = FakeGenerator()
	svc = service(
		rows=stored(TODAY, is_final=False, post_count=2, news_count=0, age_minutes=600),
		generator=gen,
	)

	svc.summary_for("AAPL", TODAY)

	assert len(gen.calls) == 1


def test_a_day_that_has_closed_is_finalised_whatever_the_cooldown_says():
	"""Written provisionally yesterday, minutes before midnight. Waiting out the cooldown
	would leave yesterday's bar reading "so far today" well into the morning."""
	gen = FakeGenerator()
	svc = service(
		rows=stored(YESTERDAY, is_final=False, post_count=1, news_count=0, age_minutes=1),
		generator=gen,
	)

	result = svc.summary_for("AAPL", YESTERDAY)

	assert len(gen.calls) == 1
	assert gen.calls[0][2] is False  # not partial
	assert result["is_final"] is True


def test_a_closed_day_is_finalised_even_when_its_counts_never_moved():
	"""The regression this rule was written for. When the last tick of the day captured
	the final counts, the stored provisional row already has the right numbers, so gating
	finalisation on the evidence having moved leaves it marked "so far today" for ever on
	exactly the days that were collected most completely."""
	gen = FakeGenerator()
	svc = service(
		rows=stored(YESTERDAY, is_final=False, post_count=14, news_count=0, age_minutes=1),
		generator=gen,
	)

	result = svc.summary_for("AAPL", YESTERDAY)

	assert len(gen.calls) == 1
	assert result["is_final"] is True


# ── what gets written ────────────────────────────────────────────────────────


def test_today_is_written_provisional_and_a_past_day_final():
	gen = FakeGenerator()
	svc = service(generator=gen)

	assert svc.summary_for("AAPL", TODAY)["is_final"] is False
	assert svc.summary_for("AAPL", YESTERDAY)["is_final"] is True
	assert [call[2] for call in gen.calls] == [True, False]


def test_a_day_with_nothing_collected_generates_nothing():
	"""The chart already draws a gap. Spending a call to say "there was no activity"
	buys nothing the absence of a bar does not already say."""
	gen = FakeGenerator()
	svc = service(generator=gen)

	assert svc.summary_for("AAPL", day_offset(4)) is None
	assert gen.calls == []


def test_a_failed_generation_falls_back_to_whatever_was_stored():
	class Failing(FakeGenerator):
		def generate(self, evidence, *, partial):
			self.calls.append((evidence.ticker, evidence.day, partial))
			return None

	gen = Failing()
	svc = service(
		rows=stored(TODAY, is_final=False, post_count=2, news_count=0, age_minutes=600),
		generator=gen,
	)

	result = svc.summary_for("AAPL", TODAY)

	assert len(gen.calls) == 1
	assert result["summary"] == "Whatever was written last time."


def test_nothing_generates_with_the_feature_switched_off():
	gen = FakeGenerator()
	svc = service(config=cfg(day_summary_enabled=False), generator=gen)

	assert svc.summary_for("AAPL", TODAY) is None
	assert gen.calls == []


def test_nothing_generates_without_any_stored_history_to_write_from():
	gen = FakeGenerator()
	svc = service(
		config=cfg(social_history_enabled=False, news_history_enabled=False), generator=gen
	)

	assert svc.summary_for("AAPL", TODAY) is None
	assert gen.calls == []


def test_either_history_alone_is_enough_to_generate():
	"""The two flags are independent and both single-sided configurations really occur.
	News fills a whole window from one run and needs no backfill, so it is the cheaper of
	the two to switch on; social is the one a deployment already had."""
	for flags in (
		dict(social_history_enabled=True, news_history_enabled=False),
		dict(social_history_enabled=False, news_history_enabled=True),
	):
		gen = FakeGenerator()
		svc = service(config=cfg(**flags), generator=gen)

		assert svc.summary_for("AAPL", TODAY)["summary"], flags
		assert len(gen.calls) == 1, flags


def test_a_day_outside_the_window_is_refused_rather_than_generated():
	gen = FakeGenerator()
	svc = service(generator=gen)

	assert svc.summary_for("AAPL", day_offset(400)) is None
	assert gen.calls == []


def test_social_only_deployments_still_get_a_summary():
	"""News history is optional. Requiring both would leave the panel blank on a
	configuration where two thirds of the evidence is present."""
	gen = FakeGenerator()
	svc = service(generator=gen, news=FakeNewsHistory(enabled=False))

	assert svc.summary_for("AAPL", TODAY)["summary"]
	assert len(gen.calls) == 1


# ── the scheduled top-up ─────────────────────────────────────────────────────


def test_the_top_up_ignores_tickers_nobody_has_opened():
	"""The cost control for the scheduled job. A name with no stored row is a name
	nobody has looked at."""
	gen = FakeGenerator()
	svc = service(known=["AAPL"], generator=gen)

	summary = svc.top_up(["AAPL", "MSFT", "TSLA"])

	assert summary["considered"] == 3
	assert summary["eligible"] == 1
	assert {call[0] for call in gen.calls} == {"AAPL"}


def test_the_top_up_fills_missing_days_and_leaves_settled_ones_alone():
	gen = FakeGenerator()
	rows = stored(YESTERDAY, is_final=True)
	svc = service(rows=rows, known=["AAPL"], generator=gen)

	svc.top_up(["AAPL"])

	generated_days = [call[1] for call in gen.calls]
	assert YESTERDAY not in generated_days
	assert TODAY in generated_days


# ── the prompt ───────────────────────────────────────────────────────────────


def week() -> tuple[WeekDay, ...]:
	return (
		WeekDay(day_offset(2), 44, 9, 48, 2),
		WeekDay(day_offset(1), 52, 14, 55, 3),
		WeekDay(TODAY, 71, 63, 66, 5),
	)


def evidence(**overrides) -> DayEvidence:
	base = dict(
		ticker="AAPL", day=TODAY,
		social_score=71, post_count=63, bullish_posts=41, bearish_posts=8,
		top_posts=[{"author": "trader_x", "text": "big deal", "sentiment": "Positive",
					"influence": 18.0}],
		news_score=66, news_count=5, bullish_articles=3, bearish_articles=1,
		tier_counts={"1": 2, "2": 2, "3": 1},
		top_articles=[{"source": "Reuters", "headline": "Azure deal", "tier": 1,
					   "sentiment": "Positive", "influence": 41.0}],
		week=week(),
	)
	base.update(overrides)
	return DayEvidence(**base)


def test_the_prompt_carries_every_day_of_the_window():
	"""The model has to be able to place a day in its week, which was the whole point of
	handing it the window rather than the day."""
	prompt = DaySummaryPromptBuilder().build(evidence(), partial=False)

	for entry in week():
		assert entry.day in prompt or DaySummaryPromptBuilder()._short_day(entry.day) in prompt
	assert "<<< THIS DAY" in prompt


def test_the_prompt_never_lets_a_score_be_read_as_a_count():
	"""A terse table reading "social 44, 9 posts" was genuinely ambiguous, and the model
	read across it, writing "higher than the 44 posts" about a score of 44."""
	prompt = DaySummaryPromptBuilder().build(evidence(), partial=False)

	assert "social score 44 from 9 posts" in prompt
	assert "Never confuse a score with a count" in prompt


def test_every_score_carries_its_distance_from_neutral():
	"""The regression this was written for. Given "59 out of 100 (positive)" next to a
	note that it was the window's lowest reading, the model wrote "sits just below the
	neutral point of 50, indicating a mildly bearish mood": it read "lowest of the week"
	as "below neutral" and never compared against 50 at all. Stating the gap removes the
	only arithmetic it was being asked to do."""
	phrase = DaySummaryPromptBuilder()._score_phrase

	assert phrase(59) == "59 out of 100, 9 points ABOVE the neutral 50, which is positive"
	assert phrase(44) == "44 out of 100, 6 points BELOW the neutral 50, which is negative"
	assert phrase(50) == "50 out of 100, exactly at the neutral 50, which is neutral"
	assert phrase(None) == "no reading"


def test_the_prompt_forbids_reading_the_weeks_lowest_as_below_neutral():
	"""Both halves of the failure are named, because the model committed both: it
	contradicted the stated side of neutral, and it did so by way of the week ranking."""
	prompt = DaySummaryPromptBuilder().build(evidence(), partial=False)

	assert "must never be called bearish" in prompt
	assert "lowest reading of the week is NOT the same as being below neutral" in prompt


def test_the_prompt_asks_for_the_volume_and_what_it_means():
	prompt = DaySummaryPromptBuilder().build(evidence(), partial=False)

	assert "How much chatter there was" in prompt
	assert "63 posts, far more chatter than the rest of the window" in prompt


def test_the_busiest_day_is_named_as_such():
	assert ", and the busiest of them" in evidence().volume_comparison()


def test_a_quiet_day_is_described_as_quiet():
	quiet = evidence(day=day_offset(2), social_score=44, post_count=9)
	assert "far quieter than the rest of the window" == quiet.volume_comparison()


def test_a_lone_active_day_says_there_is_nothing_to_compare_against():
	"""A model asked to compare against nothing will invent something to compare
	against."""
	lone = evidence(week=(WeekDay(TODAY, 71, 63, 66, 5),))
	assert "nothing to compare" in lone.volume_comparison()


def test_an_empty_day_in_the_table_is_said_once_rather_than_spelled_out():
	"""Weekends are most of these, and a table where two rows in seven read "no reading,
	0 posts; no reading, 0 articles" invites the model to treat emptiness as a finding."""
	with_gap = evidence(week=week() + (WeekDay(day_offset(3), None, 0, None, 0),))
	prompt = DaySummaryPromptBuilder().build(with_gap, partial=False)

	assert "nothing collected" in prompt


# ── the newly discovered asset ───────────────────────────────────────────────


def thin_week() -> tuple[WeekDay, ...]:
	"""A ticker discovered last night: the run filled its news lookback, the social
	backfill has not walked it yet, everything before yesterday is empty."""
	return tuple(
		WeekDay(day_offset(n), None, 0, None, 0) for n in range(6, 1, -1)
	) + (
		WeekDay(YESTERDAY, None, 0, 61, 2),
		WeekDay(TODAY, 57, 8, 63, 3),
	)


def test_a_mostly_empty_window_is_recognised_as_still_being_built():
	"""The ordinary state of a newly discovered asset, not an edge case."""
	thin = evidence(week=thin_week(), post_count=8, social_score=57)

	assert thin.days_with_data == 2
	assert thin.history_is_thin is True


def test_a_day_with_only_news_still_counts_as_collected():
	"""News fills the whole lookback on the first run while social waits for the
	backfill, so a day with articles and no posts is the normal shape of night one."""
	thin = evidence(week=thin_week())

	assert any(entry.news_count > 0 and entry.post_count == 0 for entry in thin.week)
	assert thin.days_with_data == 2


def test_a_thin_window_tells_the_model_the_history_is_still_being_built():
	"""Nothing in the numbers distinguishes "not collected yet" from "nobody posted", so
	a mostly empty week reads as an asset everyone has stopped talking about unless the
	paragraph says otherwise."""
	prompt = DaySummaryPromptBuilder().build(
		evidence(week=thin_week(), post_count=8, social_score=57), partial=True
	)

	assert "sentiment history is still being built" in prompt
	assert "gone quiet" in prompt
	assert "Do NOT count the empty days" in prompt


def test_a_complete_window_carries_no_still_building_rule():
	"""A standing instruction to mention thin coverage would be obeyed on a full week
	too, and a paragraph apologising for data it has is worse than one that never
	mentions it."""
	prompt = DaySummaryPromptBuilder().build(evidence(), partial=False)

	assert "still being built" not in prompt
	assert evidence().history_is_thin is False


def test_the_coverage_line_is_always_stated():
	"""The fact is given even on a full week. The RULE is conditional, the FACT is not:
	a model that has to guess how much of the window is real will guess."""
	prompt = DaySummaryPromptBuilder().build(evidence(), partial=False)

	assert "Collected history: 3 of the last 3 days carry any data" in prompt


def test_the_partial_rule_appears_only_for_a_day_still_in_progress():
	builder = DaySummaryPromptBuilder()

	assert "day so far" in builder.build(evidence(), partial=True)
	assert "day so far" not in builder.build(evidence(), partial=False)


# ── generation guards ────────────────────────────────────────────────────────


class FakeClient:
	model = "fake-model"

	def __init__(self, reply):
		self.reply = reply
		self.calls = 0

	def complete(self, prompt):
		self.calls += 1
		if isinstance(self.reply, Exception):
			raise self.reply
		return self.reply


def test_an_over_long_reply_is_discarded_rather_than_stored():
	gen = DaySummaryGenerator(cfg(day_summary_max_chars=100), client=FakeClient("x" * 500))

	assert gen.generate(evidence(), partial=False) is None


def test_a_token_reply_is_discarded_rather_than_stored_as_a_paragraph():
	""""---" and "N/A" are neither empty nor inside the ceiling, so without a floor they
	would be stored and rendered as though they were the day's account."""
	for reply in ("", "   ", "---", "N/A", "No data available."):
		gen = DaySummaryGenerator(cfg(), client=FakeClient(reply))
		assert gen.generate(evidence(), partial=False) is None, reply


def test_a_real_paragraph_clears_the_floor():
	"""The floor must not be so high that it rejects a short but genuine summary."""
	real = (
		"Sentiment sat just above neutral at 71, on 63 posts, the busiest day of the "
		"week. Reuters led the coverage."
	)
	gen = DaySummaryGenerator(cfg(), client=FakeClient(real))

	assert gen.generate(evidence(), partial=False) == real


def test_dash_punctuation_is_normalised_out_of_the_reply():
	"""The prompt bans it and a 20b model obeys style rules unevenly, so the reply is
	normalised rather than trusted, exactly as the reasoning trace is."""
	gen = DaySummaryGenerator(
		cfg(),
		client=FakeClient(
			"Sentiment rose — sharply — on the busiest day of the week, with 63 posts."
		),
	)

	out = gen.generate(evidence(), partial=False)

	assert "—" not in out
	assert "busiest day of the week" in out


def test_a_failing_client_is_retried_then_gives_up_quietly():
	client = FakeClient(RuntimeError("429 rate limited"))
	gen = DaySummaryGenerator(cfg(), client=client)
	gen.BACKOFF_SECONDS = (0.0, 0.0)

	assert gen.generate(evidence(), partial=False) is None
	assert client.calls == gen.RETRIES + 1


def test_a_day_with_no_evidence_never_reaches_the_model():
	client = FakeClient("should not be asked for")
	gen = DaySummaryGenerator(cfg(), client=client)

	assert gen.generate(evidence(post_count=0, news_count=0), partial=False) is None
	assert client.calls == 0


# ── the bands the panel is read against ──────────────────────────────────────


def test_the_score_bands_match_the_frontend_thresholds():
	"""sentimentVerdict in sentimentDisplay.ts. A paragraph calling 58 "positive" under a
	chip reading "Neutral" is worse than no paragraph, so these have to agree."""
	assert band_for(70) == "strongly positive"
	assert band_for(69) == "positive"
	assert band_for(55) == "positive"
	assert band_for(54) == "neutral"
	assert band_for(46) == "neutral"
	assert band_for(45) == "negative"
	assert band_for(31) == "negative"
	assert band_for(30) == "strongly negative"
	assert band_for(None) == "no data"
