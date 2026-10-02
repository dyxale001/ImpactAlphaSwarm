"""Tests for "What's driving the sentiment", the news-only paragraph under the day summary.

Two families of claim. The prompt: it is handed every stored article for the day, with
its summary, and the day's chatter as figures only, never a post. The spend: it is stored and settled exactly
as the summaries are, except that only articles count as evidence, so a burst of posts
never re-bills a paragraph that does not read them.

Nothing external is touched. Groq is a fake and the store is a fake.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.day_drivers import (  # noqa: E402
	DayDriversGenerator,
	DayDriversPromptBuilder,
	DayDriversRepository,
	DayDriversService,
)
from src.utils.day_summary import DayEvidence, DaySummaryGenerator, WeekDay  # noqa: E402
from src.utils.ss_config import SentimentConfig  # noqa: E402

UTC = datetime.timezone.utc


def cfg(**overrides) -> SentimentConfig:
	base = dict(
		social_history_enabled=True,
		news_history_enabled=True,
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


def articles(n: int) -> list[dict]:
	return [
		{
			"source": f"Publisher{i}",
			"headline": f"Headline number {i}",
			"summary": f"What article {i} actually reported",
			"tier": 1 if i == 1 else 2,
			"sentiment": "Positive" if i % 2 else "Negative",
			"influence": 40.0 - i,
		}
		for i in range(1, n + 1)
	]


def evidence(**overrides) -> DayEvidence:
	base = dict(
		ticker="AAPL", day=YESTERDAY,
		social_score=71, post_count=63, bullish_posts=41, bearish_posts=8,
		top_posts=[{"author": "trader_x", "text": "to the moon on this", "sentiment": "Positive"}],
		news_score=66, news_count=5, bullish_articles=3, bearish_articles=2,
		tier_counts={"1": 1, "2": 4, "3": 0},
		top_articles=articles(5),
	)
	base.update(overrides)
	return DayEvidence(**base)


# ── the prompt ───────────────────────────────────────────────────────────────


def test_every_stored_article_is_listed_with_its_summary():
	"""All of them, not the summary's top three: a story told by four mid ranked
	articles can matter more than the one at the top."""
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(), partial=False)

	for i in range(1, 6):
		assert f'"Headline number {i}" (Publisher{i}' in prompt
		assert f'  Summary: "What article {i} actually reported"' in prompt


def test_outlets_are_described_in_plain_words_not_tiers():
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(), partial=False)

	assert "(Publisher1, well established outlet, positive" in prompt
	assert "(Publisher2, established outlet, negative" in prompt
	assert "tier 2" not in prompt


def test_an_article_without_a_summary_gets_no_summary_line():
	"""Articles stored before summaries were kept. The model is told to work from the
	headline alone, so an empty line would only invite it to guess."""
	bare = [{**a, "summary": None} for a in articles(2)]
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(top_articles=bare), partial=False)

	assert "  Summary:" not in prompt
	assert "do not guess at what it said beyond it" in prompt


def test_a_busy_day_says_only_the_most_influential_are_listed():
	"""A day row keeps eight. Without this the model reads eight listed articles as the
	whole day and miscounts a day of twenty."""
	busy = evidence(news_count=20, top_articles=articles(8))
	prompt = DayDriversPromptBuilder(cfg()).build(busy, partial=False)

	assert "Only the 8 most influential of the day's 20 articles are listed" in prompt


def test_a_day_whose_articles_are_all_listed_does_not_claim_otherwise():
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(), partial=False)

	assert "most influential of the day's" not in prompt


def test_no_post_or_author_ever_reaches_the_prompt():
	"""Chatter goes in as figures. The posts themselves never do."""
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(), partial=False)

	assert "to the moon on this" not in prompt
	assert "trader_x" not in prompt
	assert "Never quote, name or describe any individual post" in prompt


def week_with_yesterday(posts_before: int, score_before: int | None) -> tuple:
	return (
		WeekDay(day_offset(3), 50, 10, 60, 2),
		WeekDay(day_offset(2), score_before, posts_before, 60, 2),
		WeekDay(YESTERDAY, 71, 63, 66, 5),
	)


def test_the_chatter_is_given_as_worked_out_comparisons():
	"""Conclusions, not a table: comparison is where the model goes wrong."""
	prompt = DayDriversPromptBuilder(cfg()).build(
		evidence(week=week_with_yesterday(30, 52)), partial=False
	)

	assert "- Mood: 71 out of 100, 21 points ABOVE the neutral 50" in prompt
	assert "from 63 posts" in prompt
	assert "- The day before: 30 posts, so more than the day before" in prompt
	assert "social score 52 then 71, so more positive than the day before" in prompt
	assert "Volume against the rest of the week: far more chatter" in prompt


def test_quieter_and_more_negative_chatter_is_described_as_such():
	prompt = DayDriversPromptBuilder(cfg()).build(
		evidence(week=week_with_yesterday(120, 80)), partial=False
	)

	assert "120 posts, so fewer than the day before" in prompt
	assert "so more negative than the day before" in prompt


def test_no_posts_the_day_before_is_said_rather_than_compared():
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(), partial=False)

	assert "The day before: no posts were collected, so there is no change to describe" in prompt


def test_a_day_with_no_posts_drops_the_chatter_sentence():
	prompt = DayDriversPromptBuilder(cfg()).build(
		evidence(post_count=0, social_score=None, top_posts=[]), partial=False
	)

	assert "no social media posts were collected that day" in prompt
	assert "If no posts were collected that day, leave this sentence out" in prompt


def test_the_chatter_is_placed_beside_the_news_never_caused_by_it():
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(), partial=False)

	assert "End with one sentence on how the chatter moved alongside this news" in prompt
	assert "Never say the news caused the chatter" in prompt


def test_todays_chatter_is_so_far():
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(day=TODAY), partial=True)

	assert "- Mood so far:" in prompt


def test_the_drivers_paragraph_has_room_for_its_closing_sentence():
	"""Over the summary's 900, or a full paragraph is discarded and paid for again."""
	gen = DayDriversGenerator(cfg(), client=FakeClient("x" * 1000))

	assert gen.max_chars == 1200
	assert gen.generate(evidence(), partial=False) == "x" * 1000
	assert DaySummaryGenerator(cfg(), client=FakeClient("x")).max_chars == 900


def test_a_past_day_is_written_as_what_drove_it():
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(), partial=False)

	assert "explaining what drove the news sentiment" in prompt
	assert "Write in the past tense" in prompt


def test_today_is_written_as_what_is_driving_it_so_far():
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(day=TODAY), partial=True)

	assert "explaining what is driving the news sentiment" in prompt
	assert "driving the sentiment so far" in prompt


def test_off_topic_articles_are_not_presented_as_drivers():
	prompt = DayDriversPromptBuilder(cfg()).build(evidence(), partial=False)

	assert "If an article is not really about AAPL" in prompt


# ── the account it runs on ───────────────────────────────────────────────────


def test_drivers_run_on_key_six_falling_back_to_the_summaries_lane():
	assert DayDriversGenerator.KEY_ENV == "GROQ_API_KEY6"
	assert DayDriversGenerator.FALLBACK_KEY_ENV == "GROQ_API_KEY4"
	assert DayDriversGenerator.PURPOSE == "day_drivers"


def test_the_day_summary_is_untouched_by_the_split():
	"""The summary keeps its own account, its own name in the logs and its own prompt."""
	assert DaySummaryGenerator.KEY_ENV == "GROQ_API_KEY4"
	assert DaySummaryGenerator.PURPOSE == "day_summary"
	assert DayDriversRepository.TABLE == "sentiment_day_drivers"
	assert DayDriversRepository.UPSERT_RPC == "upsert_day_drivers"


class FakeClient:
	model = "fake-model"

	def __init__(self, reply):
		self.reply = reply
		self.prompts: list[str] = []

	def complete(self, prompt):
		self.prompts.append(prompt)
		return self.reply


PARAGRAPH = (
	"Coverage was led by Reuters reporting a new cloud contract, which lifted the mood,"
	" while two smaller outlets questioned the cost."
)


def test_a_day_with_posts_but_no_articles_never_reaches_the_model():
	client = FakeClient(PARAGRAPH)
	gen = DayDriversGenerator(cfg(), client=client)

	assert gen.generate(evidence(news_count=0, top_articles=[]), partial=False) is None
	assert client.prompts == []


def test_a_real_paragraph_is_returned_house_styled():
	client = FakeClient(PARAGRAPH.replace(", while", " — while"))
	out = DayDriversGenerator(cfg(), client=client).generate(evidence(), partial=False)

	assert "—" not in out
	assert "Reuters" in out


# ── storage and spend ────────────────────────────────────────────────────────


class FakeSocialHistory:
	"""Read for the chatter figures only: counts and a score per day."""

	enabled = True

	def history(self, ticker, days=None):
		return [
			{"date": day_offset(n), "score": 60, "post_count": 20, "bullish": 10,
			 "bearish": 5, "top_posts": []}
			for n in range(6, -1, -1)
		]


class FakeNewsHistory:
	enabled = True

	def __init__(self, rows=None):
		self._rows = rows if rows is not None else {
			day: {
				"news_sentiment_score": 66, "article_count": 5,
				"bullish_articles": 3, "bearish_articles": 2,
				"tier1_count": 1, "tier2_count": 4, "tier3_count": 0,
				"top_articles": articles(5),
			}
			for day in (TODAY, YESTERDAY)
		}

	def history(self, ticker, days=None):
		return dict(self._rows)


class FakeRepo:
	def __init__(self, rows=None, known=None):
		self.rows = rows or {}
		self.known = {t.upper() for t in (known or [])}
		self.writes: list[list[dict]] = []

	def read_day(self, ticker, day):
		return self.rows.get((ticker.upper(), day))

	def read_window(self, ticker, since):
		return {d: r for (s, d), r in self.rows.items() if s == ticker.upper()}

	def upsert(self, rows):
		self.writes.append(rows)
		for row in rows:
			key = (row["ticker"], row["as_of_day"])
			if self.rows.get(key, {}).get("is_final"):
				continue
			self.rows[key] = {**row, "generated_at": datetime.datetime.now(UTC).isoformat()}
		return len(rows)

	def tickers_with_summaries(self, tickers):
		return {t.upper() for t in tickers} & self.known

	def prune(self, before):
		pass


class FakeGenerator:
	model = "fake-model"

	def __init__(self):
		self.calls: list[tuple[str, str, bool]] = []

	def generate(self, evidence, *, partial):
		self.calls.append((evidence.ticker, evidence.day, partial))
		return PARAGRAPH


def service(config=None, rows=None, known=None, news=None):
	gen = FakeGenerator()
	svc = DayDriversService(
		config=config or cfg(),
		history=FakeSocialHistory(),
		news_history=news or FakeNewsHistory(),
		repository=FakeRepo(rows, known),
		generator=gen,
	)
	return svc, gen


def stored(day, *, is_final, news_count=5, post_count=63, age_minutes=0):
	written = datetime.datetime.now(UTC) - datetime.timedelta(minutes=age_minutes)
	return {
		("AAPL", day): {
			"ticker": "AAPL", "as_of_day": day, "summary": "Written last time.",
			"is_final": is_final, "news_count": news_count, "post_count": post_count,
			"generated_at": written.isoformat(),
		}
	}


def test_a_past_day_is_generated_once_stored_final_and_served():
	svc, gen = service()

	first = svc.summary_for("AAPL", YESTERDAY)
	again = svc.summary_for("AAPL", YESTERDAY)

	assert len(gen.calls) == 1
	assert first["summary"] == PARAGRAPH and first["is_final"] is True
	assert again["summary"] == PARAGRAPH
	assert svc.repository.writes[0][0]["news_count"] == 5


def test_a_settled_day_is_never_regenerated():
	svc, gen = service(rows=stored(YESTERDAY, is_final=True))

	for _ in range(3):
		result = svc.summary_for("AAPL", YESTERDAY)

	assert gen.calls == []
	assert result["summary"] == "Written last time."


def test_today_is_written_provisional():
	svc, gen = service()

	assert svc.summary_for("AAPL", TODAY)["is_final"] is False
	assert gen.calls[0][2] is True


def test_new_posts_alone_never_rewrite_today():
	"""The summary rewrites when posts arrive; this paragraph does not read them, so a
	busy afternoon of chatter must not re-bill it."""
	svc, gen = service(rows=stored(TODAY, is_final=False, news_count=5, post_count=1, age_minutes=600))

	svc.summary_for("AAPL", TODAY)

	assert gen.calls == []


def test_a_new_article_rewrites_today_once_the_cooldown_has_passed():
	svc, gen = service(rows=stored(TODAY, is_final=False, news_count=4, age_minutes=600))

	svc.summary_for("AAPL", TODAY)

	assert len(gen.calls) == 1


def test_a_new_article_inside_the_cooldown_waits():
	svc, gen = service(rows=stored(TODAY, is_final=False, news_count=4, age_minutes=5))

	svc.summary_for("AAPL", TODAY)

	assert gen.calls == []


def test_a_day_with_no_articles_generates_nothing():
	svc, gen = service(news=FakeNewsHistory(rows={}))

	assert svc.summary_for("AAPL", YESTERDAY) is None
	assert gen.calls == []


def test_it_is_off_without_stored_news_history():
	svc, gen = service(config=cfg(news_history_enabled=False))

	assert svc.summary_for("AAPL", YESTERDAY) is None
	assert gen.calls == []


def test_it_is_off_with_the_summaries_flag_off():
	svc, gen = service(config=cfg(day_summary_enabled=False))

	assert svc.summary_for("AAPL", YESTERDAY) is None
	assert gen.calls == []


def test_the_top_up_settles_only_tickers_someone_opened():
	svc, gen = service(known=["AAPL"])

	result = svc.top_up(["AAPL", "MSFT"])

	assert result["eligible"] == 1
	assert {call[0] for call in gen.calls} == {"AAPL"}


# ── a day with no news shows the latest day that had some ────────────────────


def news_on(*days: str) -> FakeNewsHistory:
	row = {
		"news_sentiment_score": 66, "article_count": 5,
		"bullish_articles": 3, "bearish_articles": 2,
		"tier1_count": 1, "tier2_count": 4, "tier3_count": 0,
		"top_articles": articles(5),
	}
	return FakeNewsHistory(rows={day: dict(row) for day in days})


def test_a_day_without_news_shows_the_day_before():
	svc, gen = service(news=news_on(day_offset(2)))

	result = svc.summary_for("AAPL", YESTERDAY)

	assert result["summary"] == PARAGRAPH
	assert result["day"] == YESTERDAY
	assert result["source_day"] == day_offset(2)
	assert [call[1] for call in gen.calls] == [day_offset(2)]


def test_it_walks_back_past_several_empty_days():
	svc, gen = service(news=news_on(day_offset(4)))

	assert svc.summary_for("AAPL", TODAY)["source_day"] == day_offset(4)


def test_it_picks_the_nearest_earlier_day_not_the_oldest():
	svc, gen = service(news=news_on(day_offset(5), day_offset(3)))

	assert svc.summary_for("AAPL", day_offset(1))["source_day"] == day_offset(3)


def test_an_empty_day_never_pays_for_a_paragraph_of_its_own():
	"""Reading back costs a stored read, not a call. Clicking across a quiet week pays
	for the one day that had news, once."""
	svc, gen = service(news=news_on(day_offset(4)))

	for n in range(0, 5):
		svc.summary_for("AAPL", day_offset(n))

	assert [call[1] for call in gen.calls] == [day_offset(4)]
	assert {row["as_of_day"] for batch in svc.repository.writes for row in batch} == {day_offset(4)}


def test_a_stored_settled_paragraph_is_served_back_without_a_call():
	svc, gen = service(rows=stored(day_offset(2), is_final=True), news=news_on(day_offset(2)))

	result = svc.summary_for("AAPL", TODAY)

	assert gen.calls == []
	assert result["summary"] == "Written last time."
	assert result["source_day"] == day_offset(2)


def test_a_day_with_news_gets_its_own_paragraph_again():
	"""It only moves on when news arrives: the next day with articles is its own source."""
	svc, gen = service(news=news_on(day_offset(3), day_offset(1)))

	assert svc.summary_for("AAPL", day_offset(2))["source_day"] == day_offset(3)
	assert svc.summary_for("AAPL", day_offset(1))["source_day"] == day_offset(1)
	assert svc.summary_for("AAPL", TODAY)["source_day"] == day_offset(1)


def test_a_day_with_news_names_itself_as_the_source():
	svc, gen = service()

	result = svc.summary_for("AAPL", YESTERDAY)

	assert result["source_day"] == YESTERDAY == result["day"]


def test_no_news_anywhere_up_to_the_day_answers_nothing():
	"""Later news does not count: a day can only fall back, never forward."""
	svc, gen = service(news=news_on(TODAY))

	assert svc.summary_for("AAPL", YESTERDAY) is None
	assert gen.calls == []
