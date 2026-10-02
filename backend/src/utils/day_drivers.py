"""Sentiment scout: "What's driving the sentiment", the one paragraph on a chart day.

It replaced the day summary (day_summary.py), which described a day's readings: the
score, the volume, the week around it, the loudest post. That is no longer shown or
generated, though its code and GET endpoint remain, unused, so the change is easy to
reverse. This explains the NEWS behind the day instead. It reads every
article stored for the day, headline and publisher's summary both, and says in plain
words which stories pushed the mood up, which pulled it down, and which weighed most.
It closes with one sentence placing the news beside the day's chatter: whether the
number of posts rose or fell against the day before and the week, and whether the mood
on social media turned more positive or more negative. Figures only. No post is ever
quoted, named or shown to the model, and the sentence says the two happened on the same
day, never that the news caused the chatter, because nothing here can tell whether the
posts were reacting to the articles.

Every article stored for the day means every article on the day row, which keeps the
most influential ``news_day_top_articles`` (8). Most days carry fewer than that; on the
busier ones the prompt is told how many there were in all, so the model never mistakes
the listed few for the whole day.

It is stored and paid for exactly as the summary is, because it IS the summary's
machinery: the same lazy generation on first click, the same rule that a settled day is
written once and never again, the same cooldown-and-evidence rule for today, the same
top-up job to settle yesterday, in a table of its own (migrations/030) with the same
guarded merge. The subclasses below change only what differs: the prompt, the table,
the Groq account, and the fact that only articles count as evidence: new posts alone
never rewrite the paragraph, so its chatter sentence for today is as of the last new
article, and is brought up to date when the day settles.

It has a Groq account of its own, GROQ_API_KEY6, and nothing else uses that key. It
generates while someone is reading the page, and a lane of its own means it never
waits behind a run's traces or the other page summaries. The 00:30 UTC job
(/api/sentiment/summaries, named for what it used to settle) settles these paragraphs
now, for tickers someone has opened them on.
"""

from __future__ import annotations

import logging
from typing import Any

from .day_summary import (
	DayEvidence,
	DaySummaryGenerator,
	DaySummaryPromptBuilder,
	DaySummaryRepository,
	DaySummaryService,
)
from .ns_daily import NewsHistory
from .ss_config import SentimentConfig
from .ss_sources import PublisherRegistry
from .ss_daily import SocialHistory, window_days

logger = logging.getLogger("sentiment-scout")


class DayDriversPromptBuilder(DaySummaryPromptBuilder):
	"""The news-only prompt. Pure, no I/O.

	Inherits the summary builder's phrasing helpers (the score against neutral, the day
	written out, the tier mix), so the two paragraphs describe the same number the same
	way and cannot disagree about which side of 50 a day sat on.
	"""

	#: Plain words for the reliability tiers. "Tier 2" is internal vocabulary; the model
	#: repeats whatever it is given, and a beginner needs to know whether an outlet is
	#: one to lean on, not which bucket it is filed under.
	OUTLET_WORDS = {
		1: "well established outlet",
		2: "established outlet",
		3: "less established outlet",
	}

	def build(self, evidence: DayEvidence, *, partial: bool) -> str:
		ticker = evidence.ticker
		return f"""You are writing one short paragraph for a retail investing app, explaining what {"is driving" if partial else "drove"} the news sentiment for {ticker} on {self._day_phrase(evidence.day)}. Write it for someone new to investing.

{self._figures_block(evidence)}

{self._all_articles_block(evidence)}

{self._chatter_block(evidence, partial=partial)}

Write four to six sentences, no more than 135 words in total, as one paragraph with no headings, no bullet points and no title.

Cover:
- The main stories behind the day's news sentiment, drawn from all of the articles above rather than from one alone. Group articles that tell the same story together, say in plain words what was reported, and name the publishers behind the most influential ones.
- Which stories pushed the mood up and which pulled it down, and which weighed most. Articles from well established outlets, and articles with a larger share of the day's news score, count for more.
- If the articles pulled in different directions, say so plainly.
- End with one sentence on how the chatter moved alongside this news, using only the chatter figures above: whether the number of posts rose or fell against the day before and the rest of the week, and whether the mood on social media turned more positive or more negative. For example: "Alongside this news, chatter picked up to 67 posts, the busiest day of the week, and turned more positive." If no posts were collected that day, leave this sentence out.

Rules you must follow:
- Use ONLY the articles and figures listed above. You know nothing else about {ticker} beyond what these articles report: not its price, not its sector, not what happened on other days. If something is not listed, it does not go in.
- Explain each story in your own words. Do not repeat headlines word for word.
- Where an article has no summary, work from its headline alone and do not guess at what it said beyond it.
- If an article is not really about {ticker}, for example a general personal finance story or one about a different company, do not present it as a driver of {ticker}'s sentiment. If most of the day's coverage was only loosely related to {ticker}, say so plainly.
- The chatter sentence describes the news and the chatter as happening on the same day. Never say the news caused the chatter, drove it or sparked it: nothing here shows whether the posts were about these articles.
- Never quote, name or describe any individual post or its author, and never name the platform. Speak only of "chatter" or "social media" as a whole.
- Never confuse a score with a count. A social score of 56 is a mood on the 0 to 100 scale, not 56 posts.
- Never predict what the price or the sentiment will do next, and never tell the reader to buy, sell or hold. You may say what an article reported, as that article's account, but never state a price move as your own fact.
- The news score runs 0 to 100 and its neutral point is 50, not 0. The figures above already state which side of neutral it sits on; use exactly what they say. Do not describe the score as a percentage.
- Write British English, in a plain, level voice. No hype, no filler openers like "Overall" or "In summary".
- Never use a dash of any kind as punctuation. Use a comma, a full stop or a rewrite.
- Plain prose only. No markdown, no quotation marks around the whole paragraph.
{self._tense_rule(partial)}
Write only the paragraph itself."""

	def _figures_block(self, evidence: DayEvidence) -> str:
		lines = [
			"The day's news figures:",
			f"- News sentiment: {self._score_phrase(evidence.news_score)}"
			f" from {evidence.news_count} articles"
			f" ({evidence.bullish_articles} bullish, {evidence.bearish_articles} bearish)",
			f"- Article reliability mix: {self._tier_phrase(evidence.tier_counts)}",
		]
		listed = len(evidence.top_articles)
		# Said outright on a busy day. Without it the model reads eight listed articles
		# as the whole day and writes "eight articles covered it" about a day of twenty.
		if evidence.news_count > listed:
			lines.append(
				f"- Only the {listed} most influential of the day's {evidence.news_count}"
				" articles are listed below. The rest carried less of the score."
			)
		return "\n".join(lines)

	def _chatter_block(self, evidence: DayEvidence, *, partial: bool) -> str:
		"""The day's chatter as figures, for the one closing sentence. No post text.

		Volume against the day before and against the week, and the social score against
		the day before, with every comparison already worked out. The model is handed
		conclusions rather than a table to compare, because comparison is exactly where
		the summary's prompt has watched it go wrong.
		"""
		if evidence.post_count <= 0:
			return "The day's chatter: no social media posts were collected that day."
		so_far = " so far" if partial else ""
		lines = [
			"The day's chatter on social media, as figures only (counts and mood, no posts):",
			f"- Mood{so_far}: {self._score_phrase(evidence.social_score)}"
			f" from {evidence.post_count} posts",
			f"- Volume against the rest of the week: {evidence.volume_comparison()}",
		]
		before = evidence.previous
		if before is None or before.post_count <= 0:
			lines.append("- The day before: no posts were collected, so there is no change to describe.")
		else:
			lines.append(
				f"- The day before: {before.post_count} posts,"
				f" {self._direction(evidence.post_count, before.post_count, 'more', 'fewer')}"
			)
			if evidence.social_score is not None and before.social_score is not None:
				lines.append(
					f"- Mood against the day before: social score {before.social_score} then"
					f" {evidence.social_score},"
					f" {self._direction(evidence.social_score, before.social_score, 'more positive', 'more negative')}"
				)
		return "\n".join(lines)

	@staticmethod
	def _direction(now: int, before: int, up: str, down: str) -> str:
		"""The change in words, so the model never does the subtraction itself."""
		if now > before:
			return f"so {up} than the day before"
		if now < before:
			return f"so {down} than the day before"
		return "unchanged from the day before"

	def _all_articles_block(self, evidence: DayEvidence) -> str:
		"""Every stored article for the day, with its summary where it has one.

		All of them rather than the summary's top three: this paragraph's whole job is to
		weigh the day's coverage as a whole, and a story told by four mid-ranked articles
		can matter more than the single article that tops the list.
		"""
		articles = evidence.top_articles
		if not articles:
			return "The day's articles: none were collected."
		lines = [
			"Every article for the day, most influential first. Each shows its headline,"
			" publisher, how established that outlet is, whether it read as positive,"
			" negative or neutral, its share of the day's news score, and the publisher's"
			" own summary where one was given:"
		]
		for article in articles:
			publisher = article.get("source") or "unknown publisher"
			headline = (article.get("headline") or "").strip() or "untitled"
			outlet = self.OUTLET_WORDS.get(article.get("tier"), "outlet of unknown standing")
			lines.append(
				f'- "{headline}" ({publisher}, {outlet}, {self._label(article)},'
				f" {self._influence(article)} of the day's news score)"
			)
			summary = (article.get("summary") or "").strip().replace("\n", " ")
			if summary:
				lines.append(f'  Summary: "{summary}"')
		return "\n".join(lines)

	@staticmethod
	def _tier_phrase(tier_counts: dict[str, int]) -> str:
		"""The reliability mix in the same plain words as the article lines.

		Overrides the summary's "tier 1 (most reliable)" wording: this paragraph is the
		one that explains the news to a beginner, and the model repeats what it is given.
		"""
		tier1 = int(tier_counts.get("1") or 0)
		tier2 = int(tier_counts.get("2") or 0)
		tier3 = int(tier_counts.get("3") or 0)
		if not (tier1 or tier2 or tier3):
			return "no articles"
		return (
			f"{tier1} from well established outlets, {tier2} from established outlets,"
			f" {tier3} from less established outlets"
		)

	@staticmethod
	def _tense_rule(partial: bool) -> str:
		if partial:
			return (
				"- The day is still in progress. Say plainly, once, that this is what is"
				" driving the sentiment so far and that more articles may still arrive."
				" Do not speculate about how the day will close.\n"
			)
		return "- The day is over. Write in the past tense.\n"


class DayDriversRepository(DaySummaryRepository):
	"""The same table shape and guarded merge as the summaries, in a table of its own.

	A separate table rather than a second text column on the summaries' row, so that each
	paragraph settles on its own: a day whose summary has gone final can still have its
	drivers written or settled later, and the RPC's final-row guard protects each one
	independently.
	"""

	TABLE = "sentiment_day_drivers"
	UPSERT_RPC = "upsert_day_drivers"


class DayDriversGenerator(DaySummaryGenerator):
	"""Asks for the drivers paragraph, on its own Groq account.

	GROQ_API_KEY6, which nothing else reads. Falls back to GROQ_API_KEY4, the summaries'
	lane, so a deployment without key 6 still writes the paragraph rather than leaving
	the box empty.
	"""

	KEY_ENV = "GROQ_API_KEY6"
	FALLBACK_KEY_ENV = "GROQ_API_KEY4"
	PURPOSE = "day_drivers"
	BUILDER = DayDriversPromptBuilder

	#: Above the summary's 900. Four to six sentences with the chatter sentence run to
	#: about 950 characters, and a paragraph over the ceiling is discarded and paid for
	#: again on the next click.
	MAX_CHARS = 1200

	@property
	def max_chars(self) -> int:
		return self.MAX_CHARS

	@staticmethod
	def describable(evidence: DayEvidence) -> bool:
		"""Only articles count. A day of posts and no news has no news to explain."""
		return evidence.news_count > 0 and bool(evidence.top_articles)


class DayDriversService(DaySummaryService):
	"""Serves a day's drivers paragraph, generating and storing it the first time."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		history: SocialHistory | None = None,
		news_history: NewsHistory | None = None,
		repository: DayDriversRepository | None = None,
		generator: DayDriversGenerator | None = None,
	):
		config = config or SentimentConfig.from_env()
		super().__init__(
			config=config,
			registry=registry,
			history=history,
			news_history=news_history,
			repository=repository or DayDriversRepository(),
			generator=generator or DayDriversGenerator(config),
		)

	@property
	def enabled(self) -> bool:
		"""The summaries' flag, and stored news history to read. Nothing to explain without it."""
		return self.config.day_summary_enabled and self.config.news_history_enabled

	def _summary_for(
		self,
		sym: str,
		day: str,
		history: tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]] | None = None,
	) -> dict[str, Any] | None:
		"""The paragraph for ``day``, or for the latest earlier day that had news.

		Plenty of tickers go days without an article, and an empty box on every one of
		them says nothing a reader can use. So a day with no articles shows the paragraph
		of the most recent day before it that had some, walking back as far as the
		window goes. The answer carries ``source_day`` so the page can say whose news it
		is showing.

		This never generates for an empty day; there is nothing to write from. It only
		reads the stored paragraph of the day it falls back to, generating that one if it
		has never been written. A new paragraph is paid for only when a day with articles
		arrives, which is the one event that changes what there is to say.
		"""
		window = window_days(self.config.social_display_days)
		if not window or day < window[0].isoformat() or day > window[-1].isoformat():
			return None

		social, news = history if history is not None else self._read_history(sym)
		source_day = self._latest_day_with_news(sym, day, social, news, window)
		if source_day is None:
			return None

		point = super()._summary_for(sym, source_day, (social, news))
		if point is None:
			return None
		return {**point, "day": day, "source_day": source_day}

	def _latest_day_with_news(
		self,
		sym: str,
		day: str,
		social: dict[str, dict[str, Any]],
		news: dict[str, dict[str, Any]],
		window: list,
	) -> str | None:
		"""``day`` itself if it had articles, else the nearest earlier day that did."""
		for date in reversed(window):
			candidate = date.isoformat()
			if candidate > day:
				continue
			evidence = self._build_evidence(sym, candidate, social, news, window)
			if self._describable(evidence):
				return candidate
		return None

	@classmethod
	def _point(cls, row: dict[str, Any]) -> dict[str, Any]:
		"""The summary's shape, plus the day the paragraph was actually written about."""
		point = super()._point(row)
		return {**point, "source_day": point["day"]}

	@staticmethod
	def _describable(evidence: DayEvidence) -> bool:
		return DayDriversGenerator.describable(evidence)

	@staticmethod
	def _evidence_moved(stored: dict[str, Any], evidence: DayEvidence) -> bool:
		"""Only a new article changes what this paragraph would say. New posts do not."""
		return int(stored.get("news_count") or 0) != evidence.news_count
