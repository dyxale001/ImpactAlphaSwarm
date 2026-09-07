"""Sentiment scout: the generated paragraph behind clicking a day on the trend chart.

The chart says Tuesday was 58 and Wednesday was 71. This says why, in a sentence or five:
what that number means for this ticker, how loud the day was, where it sits in the week,
which article led the coverage and which post was loudest.

Everything it writes from is already stored. ``social_sentiment_daily`` holds each day's
score, counts and top posts; ``news_sentiment_daily`` holds the same for articles. So
generating a summary is a read of one ticker's window, one LLM call and a write, with no
API on the path and nothing refetched. That is the reason this can afford to be lazy: the
expensive part of knowing what happened on a day was paid for the night it happened.

The model is handed the WHOLE window rather than the one day, which costs nothing extra
because the endpoint reads the window anyway to find the day. It matters because most of
what a reader wants to know about a day is comparative. 58 out of 100 means little on its
own; 58 on the quietest day of the week, down from 71 the day before, means something. The
same goes for volume: a post count is a raw number until it is set against the days either
side of it, and then it is the difference between a stock nobody mentioned and one that was
argued over all afternoon.

Two rules keep the bill flat, and they are both enforced below the caller:

  * A settled day is generated ONCE. ``is_final`` goes true the moment the day is over,
    and migrations/022 refuses to overwrite a final row at all, so a reader clicking back
    and forth across a week pays for that week once between them.
  * A day still in progress is rewritten only when waiting has actually bought something.
    Both the cooldown AND the evidence have to have moved; a quiet afternoon re-bills
    every ninety minutes otherwise, to say the same thing again in different words.

Prose is generated, so it is also constrained. The model is handed the window's own numbers
and the day's top few items and told to work from those alone. It never sees a ticker's
fundamentals, a price, or anything it could reach past the evidence to assert. That is not
caution for its own sake: migrations/011's LLM fund descriptions had to be withdrawn
wholesale for describing an asset manager as an insurance company, and the lesson taken
from it was to stop asking models for facts they were not given.
"""

from __future__ import annotations

import datetime
import logging
import time
from dataclasses import dataclass
from typing import Any

from .gr_reasoningtracestyle import HOUSE_STYLE
from .llm_client import GroqClient
from .ns_daily import NewsHistory
from .ss_config import SentimentConfig
from .ss_daily import RETENTION_DAYS, SocialHistory, utc_now, window_days
from .ss_sources import PublisherRegistry

logger = logging.getLogger("sentiment-scout")


#: The plain language reading of a 0 to 100 score, thresholds first.
#:
#: These are ``sentimentVerdict`` in frontend/src/components/research/sentimentDisplay.ts,
#: repeated rather than derived because the two sides cannot import from each other. They
#: have to agree: the panel renders this prose directly under a verdict label computed by
#: that function, and a paragraph calling 58 "positive" beneath a chip reading "Neutral"
#: is worse than no paragraph. Change one, change the other.
SCORE_BANDS: tuple[tuple[int, str], ...] = (
	(70, "strongly positive"),
	(55, "positive"),
	(46, "neutral"),
	(31, "negative"),
	(0, "strongly negative"),
)


def band_for(score: int | None) -> str:
	"""The plain language band a score falls in, or "no data" for a day with none."""
	if score is None:
		return "no data"
	for floor, label in SCORE_BANDS:
		if score >= floor:
			return label
	return "strongly negative"


@dataclass(frozen=True)
class WeekDay:
	"""One day of the window, as the comparison needs to see it."""

	day: str
	social_score: int | None
	post_count: int
	news_score: int | None
	news_count: int


@dataclass(frozen=True)
class DayEvidence:
	"""One day of one ticker, in the context of its week.

	Assembled once so that the prompt builder, the staleness check and the write all read
	the same object. When these came off the raw rows separately, the fingerprint written
	to the database and the numbers the model was shown could differ by a refresh landing
	between them.
	"""

	ticker: str
	day: str
	social_score: int | None
	post_count: int
	bullish_posts: int
	bearish_posts: int
	top_posts: list[dict[str, Any]]
	news_score: int | None
	news_count: int
	bullish_articles: int
	bearish_articles: int
	tier_counts: dict[str, int]
	top_articles: list[dict[str, Any]]
	#: Every day of the window, oldest first, this one included.
	week: tuple[WeekDay, ...] = ()

	@property
	def has_evidence(self) -> bool:
		"""Whether there is anything to write about at all.

		A day with no posts and no articles is a gap, and the chart already draws it as
		one. Generating "there was no activity" for it would spend a call to say what the
		absence of a bar says on its own.
		"""
		return self.post_count > 0 or self.news_count > 0

	@property
	def other_days(self) -> tuple[WeekDay, ...]:
		return tuple(entry for entry in self.week if entry.day != self.day)

	@property
	def days_with_data(self) -> int:
		"""How many days of the window carry anything at all."""
		return sum(
			1 for entry in self.week if entry.post_count > 0 or entry.news_count > 0
		)

	@property
	def history_is_thin(self) -> bool:
		"""Whether this ticker's window is mostly empty.

		Which is the ordinary state of a newly discovered asset rather than an edge case.
		Discovery adds a ticker at the top of the nightly, the run fills its whole news
		lookback at once, and its social history is not walked until the backfill an hour
		later, so for a while the chart is a couple of bars and five gaps.

		The reader has to be told that, because the alternative reading is available and
		wrong: a mostly empty week looks exactly like an asset everyone has stopped
		talking about. Nothing in the numbers distinguishes "not collected yet" from
		"nobody posted", so the paragraph has to say which, and it can only say it if it
		is told.

		Half the window rather than the chart's own three day floor. That floor decides
		whether a line can be drawn at all; this decides whether the week is complete
		enough to be described as a week, which is a lower bar and a different question.
		"""
		return bool(self.week) and self.days_with_data * 2 < len(self.week)

	@property
	def previous(self) -> WeekDay | None:
		"""The day before, if it is in the window."""
		wanted = (
			datetime.date.fromisoformat(self.day) - datetime.timedelta(days=1)
		).isoformat()
		return next((entry for entry in self.week if entry.day == wanted), None)

	@property
	def busiest_day(self) -> WeekDay | None:
		"""The window's loudest day by post count, or None when nothing was collected."""
		active = [entry for entry in self.week if entry.post_count > 0]
		return max(active, key=lambda entry: entry.post_count) if active else None

	def volume_comparison(self) -> str:
		"""How this day's chatter compares with the rest of the window, in words.

		Against the mean of the OTHER active days rather than the whole window, so a day
		is never partly compared against itself. On a window where only this day has posts
		there is nothing to compare with and the phrasing says so, which is honest and also
		stops the model inventing a trend out of a single bar.
		"""
		if self.post_count <= 0:
			return "no posts were collected that day"

		others = [entry.post_count for entry in self.other_days if entry.post_count > 0]
		if not others:
			return "it is the only day in the window with any posts, so there is nothing to compare it against"

		average = sum(others) / len(others)
		if average <= 0:
			return "there is nothing to compare it against"

		ratio = self.post_count / average
		busiest = self.busiest_day
		superlative = ""
		if busiest is not None and busiest.day == self.day:
			superlative = ", and the busiest of them"

		if ratio >= 1.75:
			return f"far more chatter than the rest of the window{superlative}"
		if ratio >= 1.25:
			return f"busier than the rest of the window{superlative}"
		if ratio <= 0.4:
			return "far quieter than the rest of the window"
		if ratio <= 0.75:
			return "quieter than the rest of the window"
		return "about as busy as the rest of the window"

	def score_comparison(self) -> str:
		"""Where this day's social score sits among the window's, in words."""
		if self.social_score is None:
			return ""
		scores = [
			entry.social_score
			for entry in self.other_days
			if entry.social_score is not None
		]
		if not scores:
			return ""
		if self.social_score > max(scores):
			return "the highest social reading in the window"
		if self.social_score < min(scores):
			return "the lowest social reading in the window"
		return ""


class DaySummaryPromptBuilder:
	"""Turns one day's evidence into the prompt. Pure, no I/O."""

	def __init__(self, config: SentimentConfig | None = None):
		self.config = config or SentimentConfig.from_env()

	def build(self, evidence: DayEvidence, *, partial: bool) -> str:
		items = self.config.day_summary_evidence_items

		return f"""You are writing one short paragraph for a retail investing app, explaining what {evidence.ticker}'s sentiment looked like on {self._day_phrase(evidence.day)}.

{self._numbers_block(evidence, partial=partial)}

{self._week_block(evidence)}

{self._articles_block(evidence.top_articles[:items])}

{self._posts_block(evidence.top_posts[:items])}

Write four or five sentences, no more than 110 words in total, as one paragraph with no headings, no bullet points and no title.

Cover, in whatever order reads best:
- What the sentiment score means for {evidence.ticker} on this day. The scale runs 0 to 100 and the neutral point is 50, not 0, so say which side of neutral the day sat on and how firmly. Do not describe the number as a percentage.
- How much chatter there was. Say the number of posts and what that volume means, using the comparison with the rest of the week given above. A high count means the ticker was widely talked about that day and the reading rests on a lot of voices; a low count means it was quiet and the reading rests on very few, so it should be read with more caution.
- Where the day sits in the week. Use the day by day table above to place it, for example against the day before or against the week's high and low. Only make a comparison the table actually supports.
- The article that led the day's coverage. Name its publisher and refer to what it was about.
- The loudest social post, and whether it agreed with the news or cut against it.

Rules you must follow:
- Use ONLY the figures and items listed above. You know nothing else about {evidence.ticker}: not its price, not its earnings, not its sector, not what happened outside this window. If something is not listed, it does not go in.
- Never predict what the price or the sentiment will do next, and never tell the reader to buy, sell or hold.
- Refer to the sentiment reading, not to what the company or its stock "did". A quiet day with bullish chatter is not a day the stock rose.
- A day marked "nothing collected" in the table is a day no data was gathered, not a day sentiment fell to zero. Never read a gap as a crash.
- Never confuse a score with a count. Scores run 0 to 100 and say how positive the mood was; counts are how many posts or articles there were. A day with a score of 44 did not have 44 posts.
- The figures above already state which side of neutral each score sits on and by how much. Use exactly what they say. A score given as ABOVE the neutral 50 is a positive mood and must never be called bearish, negative or below neutral, and one given as BELOW is the reverse. Being the lowest reading of the week is NOT the same as being below neutral: the week's lowest score can still sit well above 50.
- Write British English, in a plain, level voice. No hype, no filler openers like "Overall" or "In summary".
- Never use a dash of any kind as punctuation. Use a comma, a full stop or a rewrite.
- Plain prose only. No markdown, no quotation marks around the whole paragraph.
{self._thin_history_rule(evidence)}{self._partial_rule(partial)}
Write only the paragraph itself."""

	def _numbers_block(self, evidence: DayEvidence, *, partial: bool) -> str:
		lines = [
			"The day's figures:",
			f"- Social sentiment: {self._score_phrase(evidence.social_score)}"
			f" from {evidence.post_count} posts"
			f" ({evidence.bullish_posts} bullish, {evidence.bearish_posts} bearish)",
			f"- News sentiment: {self._score_phrase(evidence.news_score)}"
			f" from {evidence.news_count} articles"
			f" ({evidence.bullish_articles} bullish, {evidence.bearish_articles} bearish)",
			f"- Article reliability mix: {self._tier_phrase(evidence.tier_counts)}",
			f"- Post volume: {evidence.post_count} posts, {evidence.volume_comparison()}",
		]

		standing = evidence.score_comparison()
		if standing:
			lines.append(f"- This day's social score is {standing}.")
		if evidence.week:
			lines.append(
				f"- Collected history: {evidence.days_with_data} of the last"
				f" {len(evidence.week)} days carry any data at all."
			)
		if partial:
			lines.append(
				"- These figures cover the day so far. The day is not over and more posts"
				" and articles are still arriving."
			)
		return "\n".join(lines)

	def _week_block(self, evidence: DayEvidence) -> str:
		"""The whole window, day by day, with the day in question marked.

		Given as a table rather than folded into sentences so the model compares against
		numbers it can see rather than a summary of them it has to trust. The marker is
		what stops it writing about the wrong row, which it will otherwise do perhaps one
		time in ten.
		"""
		if not evidence.week:
			return "The rest of the window: no other days were collected."

		lines = [
			"Every day in the window, oldest first."
			' The day you are writing about is marked "<<< THIS DAY".',
		]
		for entry in evidence.week:
			marker = "   <<< THIS DAY" if entry.day == evidence.day else ""
			lines.append(f"- {self._short_day(entry.day)}: {self._table_row(entry)}{marker}")
		return "\n".join(lines)

	def _table_row(self, entry: WeekDay) -> str:
		"""One day of the week table.

		A day nothing was collected on is said once, plainly, rather than spelled out as
		four fields of nothing. Weekends are most of these, and a table where two rows in
		seven read "social no reading, 0 posts; news no reading, 0 articles" invites the
		model to treat the emptiness as a finding.
		"""
		if entry.post_count == 0 and entry.news_count == 0:
			return "nothing collected"
		# "social score 44 from 9 posts", not "social 44, 9 posts". The terse form was
		# genuinely ambiguous and the model read across it: given a row reading
		# "social 44, 9 posts" it wrote "higher than the 44 posts on 28 August", turning a
		# score into a volume. Naming both quantities in every cell costs a few tokens and
		# removes the only reading error the table produced.
		return (
			f"social score {self._table_score(entry.social_score)}"
			f" from {entry.post_count} posts;"
			f" news score {self._table_score(entry.news_score)}"
			f" from {entry.news_count} articles"
		)

	def _articles_block(self, articles: list[dict[str, Any]]) -> str:
		if not articles:
			return "The day's articles: none were collected."
		lines = ["The day's most influential articles, most influential first:"]
		for article in articles:
			publisher = article.get("source") or "unknown publisher"
			headline = (article.get("headline") or "").strip() or "untitled"
			tier = article.get("tier")
			tier_text = f"tier {tier}" if tier in (1, 2, 3) else "untiered"
			lines.append(
				f'- "{headline}" ({publisher}, {tier_text},'
				f" {self._label(article)}, {self._influence(article)} of the day's news score)"
			)
		return "\n".join(lines)

	def _posts_block(self, posts: list[dict[str, Any]]) -> str:
		if not posts:
			return "The day's social posts: none were collected."
		lines = ["The day's most influential social posts, most influential first:"]
		for post in posts:
			author = post.get("author") or "an anonymous user"
			text = (post.get("text") or "").strip().replace("\n", " ") or "(no text)"
			engagement = (
				int(post.get("likes") or 0)
				+ int(post.get("reshares") or 0)
				+ int(post.get("replies") or 0)
			)
			lines.append(
				f'- {author} on {post.get("platform") or "stocktwits"}: "{text}"'
				f" ({self._label(post)}, {engagement} interactions,"
				f" {self._influence(post)} of the day's social score)"
			)
		return "\n".join(lines)

	@staticmethod
	def _thin_history_rule(evidence: DayEvidence) -> str:
		"""Told to say the history is still filling in, when it is.

		Only added when it applies. A standing instruction to mention thin coverage would
		be obeyed on a complete week too, and a paragraph that opens by apologising for
		data it actually has is worse than one that never mentions it.
		"""
		if not evidence.history_is_thin:
			return ""
		return (
			f"- IMPORTANT: only {evidence.days_with_data} of the last"
			f" {len(evidence.week)} days have been collected for this asset, so its"
			" sentiment history is still being built. Replace the week comparison bullet"
			" above with one sentence saying its history is still being collected and"
			" there is not yet enough to compare this day against. Do NOT count the empty"
			" days, describe how many are missing, or compare this day with any of them."
			" Do NOT say the asset has gone quiet, lost interest or fallen out of the"
			" news: the empty days are days nothing was gathered, which is a fact about"
			" the collection and not about the asset.\n"
		)

	@staticmethod
	def _partial_rule(partial: bool) -> str:
		if not partial:
			return ""
		return (
			"- Say plainly, once, that this is the day so far rather than a settled"
			" reading, and that the post count is still climbing. Do not speculate about"
			" how it will close.\n"
		)

	@staticmethod
	def _score_phrase(score: int | None) -> str:
		"""A score, its band, and its distance from neutral spelled out.

		The distance is stated rather than left to be worked out. Given "59 out of 100
		(positive)" alongside a note that it was the window's lowest reading, the model
		wrote "sits just below the neutral point of 50, indicating a mildly bearish mood":
		it took "lowest of the week" to mean "below neutral" and never did the comparison
		against 50 at all. Doing that subtraction here removes the only arithmetic the
		model was being asked to perform, and the one it got wrong.
		"""
		if score is None:
			return "no reading"
		gap = score - 50
		if gap > 0:
			position = f"{gap} points ABOVE the neutral 50"
		elif gap < 0:
			position = f"{abs(gap)} points BELOW the neutral 50"
		else:
			position = "exactly at the neutral 50"
		return f"{score} out of 100, {position}, which is {band_for(score)}"

	@staticmethod
	def _table_score(score: int | None) -> str:
		"""A score in the week table. "no posts" rather than a dash or a zero.

		A dash would be dash punctuation the style rules ban, and a zero is the one thing
		a missing day must never look like: the chart draws a gap for silence and would
		draw a crash for a zero, and the prose has to make the same distinction.
		"""
		return "no reading" if score is None else str(score)

	@staticmethod
	def _tier_phrase(tier_counts: dict[str, int]) -> str:
		tier1 = int(tier_counts.get("1") or 0)
		tier2 = int(tier_counts.get("2") or 0)
		tier3 = int(tier_counts.get("3") or 0)
		if not (tier1 or tier2 or tier3):
			return "no articles"
		return (
			f"{tier1} tier 1 (most reliable), {tier2} tier 2, {tier3} tier 3"
			" (least reliable)"
		)

	@staticmethod
	def _label(item: dict[str, Any]) -> str:
		return str(item.get("sentiment") or "neutral").lower()

	@staticmethod
	def _influence(item: dict[str, Any]) -> str:
		try:
			return f"{float(item.get('influence') or 0.0):.0f}%"
		except (TypeError, ValueError):
			return "0%"

	@staticmethod
	def _day_phrase(day: str) -> str:
		"""The day written out, so the model never has to parse a date itself."""
		try:
			parsed = datetime.date.fromisoformat(day)
		except ValueError:
			return day
		return parsed.strftime("%A %d %B %Y").replace(" 0", " ")

	@staticmethod
	def _short_day(day: str) -> str:
		try:
			parsed = datetime.date.fromisoformat(day)
		except ValueError:
			return day
		return parsed.strftime("%a %d %b").replace(" 0", " ")


class DaySummaryRepository:
	"""Where the generated paragraphs live. One write for a batch."""

	TABLE = "sentiment_day_summary"
	#: The guarded merge from migrations/022. Refuses to overwrite a final row.
	UPSERT_RPC = "upsert_day_summaries"
	READ_COLUMNS = (
		"ticker, as_of_day, summary, is_final, news_count, post_count, "
		"news_score, social_score, model, generated_at"
	)
	CHUNK_SIZE = 100

	@staticmethod
	def _client():
		# Imported on call, never at module load. supabase_client raises at import when its
		# env vars are missing, and a missing database must degrade the summaries rather
		# than make the module unimportable.
		from .supabase_client import supabase

		return supabase

	def read_day(self, ticker: str, day: str) -> dict[str, Any] | None:
		"""One stored summary, or None."""
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select(self.READ_COLUMNS)
				.eq("ticker", ticker.upper())
				.eq("as_of_day", day)
				.limit(1)
				.execute()
			)
			rows = res.data or []
			return rows[0] if rows else None
		except Exception as e:
			logger.info("Day summary read failed for %s %s: %s", ticker, day, e)
			return None

	def read_window(self, ticker: str, since: datetime.date) -> dict[str, dict[str, Any]]:
		"""One ticker's stored summaries, keyed by YYYY-MM-DD."""
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select(self.READ_COLUMNS)
				.eq("ticker", ticker.upper())
				.gte("as_of_day", since.isoformat())
				.execute()
			)
			return {str(row["as_of_day"])[:10]: row for row in (res.data or [])}
		except Exception as e:
			logger.info("Day summary window read failed for %s: %s", ticker, e)
			return {}

	def upsert(self, rows: list[dict[str, Any]]) -> int:
		"""Merge summaries into whatever is stored. Never raises.

		A return of zero is ordinary rather than a failure: the RPC drops any write onto a
		row that has already gone final, which is exactly what it is there for.
		"""
		if not rows:
			return 0
		written = 0
		for start in range(0, len(rows), self.CHUNK_SIZE):
			chunk = rows[start : start + self.CHUNK_SIZE]
			try:
				self._client().rpc(self.UPSERT_RPC, {"p_rows": chunk}).execute()
				written += len(chunk)
			except Exception as e:
				logger.warning("Day summary upsert failed (%d rows): %s", len(chunk), e)
		return written

	def tickers_with_summaries(self, tickers: list[str]) -> set[str]:
		"""Which of these anyone has ever generated a summary for.

		The top-up job's one question, and the whole reason it is cheap: a ticker nobody
		has opened has no row here, so the scheduled pass skips it and never spends a token
		finding out whether anyone would have wanted one.
		"""
		if not tickers:
			return set()
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select("ticker")
				.in_("ticker", [t.upper() for t in tickers])
				.execute()
			)
			return {row["ticker"] for row in (res.data or [])}
		except Exception as e:
			# Fail closed, the opposite way round to seeded_tickers: an unreadable table
			# read as "nobody has a summary" costs a night's top-up, where reading it as
			# "everybody does" would generate a week of prose for the whole universe.
			logger.warning("Day summary ticker lookup failed: %s", e)
			return set()

	def prune(self, before: datetime.date) -> None:
		"""Drop summaries past retention, matching the day rows they describe."""
		try:
			self._client().table(self.TABLE).delete().lt(
				"as_of_day", before.isoformat()
			).execute()
		except Exception as e:
			logger.info("Day summary prune failed: %s", e)


class DaySummaryGenerator:
	"""Asks the model for one paragraph, and refuses anything unusable."""

	#: Its own Groq account. GROQ_API_KEY4 is configured but read by nothing else: the
	#: trace pool takes keys 1 to 3 and discovery shares key 3. Summaries generate while
	#: somebody is reading a page, which is exactly when a user triggered run might be
	#: spending traces, so giving them a lane of their own costs nothing and removes the
	#: only contention there would have been.
	KEY_ENV = "GROQ_API_KEY4"
	FALLBACK_KEY_ENV = "GROQ_API_KEY"

	MAX_TOKENS = 1200
	TEMPERATURE = 0.4

	#: Two retries, then give up. There is no retry anywhere else in the backend's Groq
	#: usage because the trace pool degrades to a prefilled trace instead, but this path
	#: has a user waiting on a click and a scheduled batch that will meet a 429 sooner or
	#: later. Short waits: a rate limit clears in seconds or it is not clearing on this
	#: request.
	RETRIES = 2
	BACKOFF_SECONDS = (1.0, 2.0)

	#: The floor on a stored paragraph. Style cleanup can strip a reply down to very
	#: little, and a reply that survives it as "---" or "N/A" is not empty, is inside the
	#: character ceiling, and would be stored and rendered as though it were the day's
	#: account. Four or five sentences cannot fit in forty characters, so anything shorter
	#: is a failed generation wearing a valid one's clothes.
	MIN_CHARS = 40

	def __init__(self, config: SentimentConfig | None = None, client: Any | None = None):
		self.config = config or SentimentConfig.from_env()
		self.builder = DaySummaryPromptBuilder(self.config)
		self._client = client
		self._client_built = client is not None

	@property
	def client(self):
		"""The Groq client, built once. None when Groq is unconfigured."""
		if not self._client_built:
			self._client_built = True
			self._client = GroqClient.create(
				purpose="day_summary",
				max_tokens=self.MAX_TOKENS,
				temperature=self.TEMPERATURE,
				key_env=self.KEY_ENV,
				fallback_key_env=self.FALLBACK_KEY_ENV,
			)
		return self._client

	@property
	def model(self) -> str | None:
		client = self.client
		return client.model if client else None

	def generate(self, evidence: DayEvidence, *, partial: bool) -> str | None:
		"""One paragraph, or None when nothing usable came back. Never raises."""
		client = self.client
		if client is None:
			logger.info(
				"Day summary skipped for %s %s: Groq unconfigured", evidence.ticker, evidence.day
			)
			return None
		if not evidence.has_evidence:
			return None

		prompt = self.builder.build(evidence, partial=partial)
		text = self._complete(client, prompt, evidence)
		if text is None:
			return None

		# Normalised rather than trusted, exactly as the reasoning trace is at
		# langgraph_orchestrator: the prompt bans dash punctuation and a 20b model obeys
		# style rules unevenly.
		summary = HOUSE_STYLE.apply(text)
		return self._validate(summary, evidence)

	def _complete(self, client, prompt: str, evidence: DayEvidence) -> str | None:
		for attempt in range(self.RETRIES + 1):
			try:
				return client.complete(prompt)
			except Exception as e:
				if attempt >= self.RETRIES:
					logger.warning(
						"Day summary generation failed for %s %s after %d attempts: %s",
						evidence.ticker,
						evidence.day,
						attempt + 1,
						e,
					)
					return None
				wait = self.BACKOFF_SECONDS[min(attempt, len(self.BACKOFF_SECONDS) - 1)]
				logger.info(
					"Day summary attempt %d failed for %s %s, retrying in %.0fs: %s",
					attempt + 1,
					evidence.ticker,
					evidence.day,
					wait,
					e,
				)
				time.sleep(wait)
		return None

	def _validate(self, summary: str, evidence: DayEvidence) -> str | None:
		"""Reject a reply that is not a paragraph, rather than storing it.

		A stored summary is hard to notice going wrong: it renders once, under a chart,
		and nothing looks at it again. Each bound has a failure it corresponds to, an
		empty string left by style cleanup, a token reply like "N/A" that is neither empty
		nor a paragraph, and a model that ignored the brief and returned an essay.
		"""
		if len(summary) < self.MIN_CHARS:
			logger.info(
				"Day summary for %s %s came back as %d chars, too short to be a paragraph",
				evidence.ticker,
				evidence.day,
				len(summary),
			)
			return None
		if len(summary) > self.config.day_summary_max_chars:
			logger.info(
				"Day summary for %s %s ran to %d chars, over the %d limit; discarded",
				evidence.ticker,
				evidence.day,
				len(summary),
				self.config.day_summary_max_chars,
			)
			return None
		return summary


class DaySummaryService:
	"""Serves a day's summary, generating and storing it the first time it is asked for."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		history: SocialHistory | None = None,
		news_history: NewsHistory | None = None,
		repository: DaySummaryRepository | None = None,
		generator: DaySummaryGenerator | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.history = history or SocialHistory(self.config, self.registry)
		self.news_history = news_history or NewsHistory(self.config, self.registry)
		self.repository = repository or DaySummaryRepository()
		self.generator = generator or DaySummaryGenerator(self.config)
		self._pruned = False

	@property
	def enabled(self) -> bool:
		"""The summary flag, and at least one stored history to write from.

		Either history will do, and naming one specifically would be arbitrary. The two
		flags are independent by design and both single-sided configurations really
		occur: news history fills a whole window from one run and needs no backfill, so
		it is the cheaper of the two to switch on and tends to go on first, while social
		is the one a deployment already had.

		A day is describable from either side alone. With social off the prompt says
		plainly that no posts were collected and the paragraph covers the articles; with
		news off it does the reverse. Requiring both would blank the panel on a
		configuration where most of the evidence is present.
		"""
		return self.config.day_summary_enabled and (
			self.config.social_history_enabled or self.config.news_history_enabled
		)

	def summary_for(self, ticker: str, day: str) -> dict[str, Any] | None:
		"""The stored summary for one day, generating it if needed. Never raises.

		Returns the row as the endpoint serves it, or None when there is nothing to show:
		summaries switched off, a day outside the window, a day with no activity, or a
		generation that failed. All four are the same thing to a reader, an empty panel,
		and none of them is an error.
		"""
		if not self.enabled:
			return None
		try:
			return self._summary_for(ticker.upper(), day)
		except Exception as e:
			logger.warning("Day summary lookup failed for %s %s: %s", ticker, day, e)
			return None

	def _summary_for(self, sym: str, day: str) -> dict[str, Any] | None:
		window = window_days(self.config.social_display_days)
		if not window or day < window[0].isoformat() or day > window[-1].isoformat():
			return None

		stored = self.repository.read_day(sym, day)
		# The cheap half of the decision, before the two history reads. A settled day is
		# answered from the row alone.
		if stored and stored.get("is_final"):
			return self._point(stored)

		social, news = self._read_history(sym)
		evidence = self._build_evidence(sym, day, social, news, window)
		if not evidence.has_evidence:
			return self._point(stored) if stored else None
		if not self._needs_generation(stored, evidence, day):
			return self._point(stored)

		generated = self._generate_and_store(evidence, day)
		if generated:
			return generated
		return self._point(stored) if stored else None

	def _generate_and_store(self, evidence: DayEvidence, day: str) -> dict[str, Any] | None:
		partial = day >= utc_now().date().isoformat()
		summary = self.generator.generate(evidence, partial=partial)
		if not summary:
			return None

		row = self._row(evidence, summary, is_final=not partial)
		self.repository.upsert([row])
		# Stamped here as well as by the RPC's own now(). The row handed back to the
		# caller is the one just built, not a re-read, so without this the response to
		# the request that GENERATED a summary is the only one that carries a null
		# timestamp, which reads as "never generated" for the one case where it certainly
		# was. A few milliseconds off the database's own value, and nothing compares them.
		row["generated_at"] = utc_now().isoformat()
		self._prune_once()
		logger.info(
			"Generated %s day summary for %s %s",
			"provisional" if partial else "final",
			evidence.ticker,
			day,
		)
		return self._point(row)

	def top_up(self, tickers: list[str], quota: int | None = None) -> dict[str, Any]:
		"""Fill in and finalise summaries for tickers people have actually opened.

		Never raises. Returns a summary the scheduler endpoint hands straight back.

		The ticker filter is the cost control: a name with no stored row is a name nobody
		has looked at, and generating a week of prose for it on the chance that somebody
		might is how a lazy feature turns into a nightly bill.
		"""
		summary: dict[str, Any] = {
			"enabled": self.enabled,
			"considered": len(tickers),
			"eligible": 0,
			"generated": 0,
			"seconds": 0.0,
		}
		if not self.enabled:
			return summary

		started = time.monotonic()
		try:
			wanted = sorted({t.upper() for t in tickers if t})
			eligible = sorted(self.repository.tickers_with_summaries(wanted))
		except Exception as e:
			logger.warning("Top-up could not work out which tickers are eligible: %s", e)
			return summary

		summary["eligible"] = len(eligible)
		limit = quota if quota is not None else len(eligible)

		for ticker in eligible[:limit]:
			try:
				summary["generated"] += self._top_up_one(ticker)
			except Exception as e:
				logger.warning("Top-up failed for %s: %s", ticker, e)

		summary["seconds"] = round(time.monotonic() - started, 1)
		logger.info(
			"Day summary top-up generated %d summaries across %d eligible tickers in %.1fs",
			summary["generated"],
			summary["eligible"],
			summary["seconds"],
		)
		return summary

	def _top_up_one(self, ticker: str) -> int:
		"""Every day of one ticker's window that still needs writing."""
		window = window_days(self.config.social_display_days)
		if not window:
			return 0

		stored = self.repository.read_window(ticker, window[0])
		social, news = self._read_history(ticker)
		generated = 0

		for date in window:
			day = date.isoformat()
			existing = stored.get(day)
			if existing and existing.get("is_final"):
				continue
			evidence = self._build_evidence(ticker, day, social, news, window)
			if not evidence.has_evidence:
				continue
			if not self._needs_generation(existing, evidence, day):
				continue
			if self._generate_and_store(evidence, day):
				generated += 1
		return generated

	def _needs_generation(
		self, stored: dict[str, Any] | None, evidence: DayEvidence, day: str
	) -> bool:
		"""The whole spend rule, in one place. Four cases, in order of cost.

		1. Nothing stored: generate. The day has evidence or the caller would not be here.
		2. Stored and final: never. Duplicated in migrations/022's WHERE clause on
		   purpose, since this one saves the LLM call and that one saves the row when this
		   one is wrong or when a caller has not thought to ask.
		3. Stored, provisional, and the day has since CLOSED: generate, to settle it.
		   Unconditionally, and in particular whatever the counts say. The status is what
		   changed, not the numbers: a provisional paragraph written by the last tick of
		   the day is describing a finished day but is still marked "so far today", and
		   gating this on the counts having moved would leave it that way permanently on
		   exactly the days the last tick captured in full.
		4. Stored, provisional, day still open: only when BOTH the cooldown has expired
		   and the evidence has actually moved. Either alone re-bills for nothing. The
		   cooldown alone would rewrite a dead quiet afternoon every ninety minutes to say
		   the same thing in different words; the evidence alone would rewrite on every
		   page load of a busy ticker, since a single new post moves the count.
		"""
		if stored is None:
			return True
		if stored.get("is_final"):
			return False
		if day < utc_now().date().isoformat():
			return True
		return self._cooldown_expired(stored) and self._evidence_moved(stored, evidence)

	def _cooldown_expired(self, stored: dict[str, Any]) -> bool:
		generated_at = stored.get("generated_at")
		if not generated_at:
			return True
		try:
			written = datetime.datetime.fromisoformat(str(generated_at).replace("Z", "+00:00"))
		except ValueError:
			return True
		if written.tzinfo is None:
			written = written.replace(tzinfo=datetime.timezone.utc)
		age = utc_now() - written
		return age >= datetime.timedelta(minutes=self.config.day_summary_today_cooldown_minutes)

	@staticmethod
	def _evidence_moved(stored: dict[str, Any], evidence: DayEvidence) -> bool:
		"""Whether anything has arrived since the stored summary was written."""
		return (
			int(stored.get("post_count") or 0) != evidence.post_count
			or int(stored.get("news_count") or 0) != evidence.news_count
		)

	def _read_history(
		self, sym: str
	) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
		"""Both stored series for one ticker, keyed by day.

		Read through the same facades the chart endpoint uses rather than querying the day
		tables again here, so a summary is written from exactly the numbers the bar above
		it was drawn from. Two reads serve the whole window, which is what makes handing
		the model the week cost nothing over handing it the day.
		"""
		days = self.config.social_display_days
		social = {point["date"]: point for point in self.history.history(sym, days)}
		news = self.news_history.history(sym, days) if self.news_history.enabled else {}
		return social, news

	def _build_evidence(
		self,
		sym: str,
		day: str,
		social: dict[str, dict[str, Any]],
		news: dict[str, dict[str, Any]],
		window: list[datetime.date],
	) -> DayEvidence:
		point = social.get(day) or {}
		news_point = NewsHistory.point(news.get(day))

		return DayEvidence(
			ticker=sym,
			day=day,
			social_score=point.get("score"),
			post_count=int(point.get("post_count") or 0),
			bullish_posts=int(point.get("bullish") or 0),
			bearish_posts=int(point.get("bearish") or 0),
			top_posts=list(point.get("top_posts") or []),
			news_score=news_point.get("news_score"),
			news_count=int(news_point.get("news_count") or 0),
			bullish_articles=int(news_point.get("news_bullish") or 0),
			bearish_articles=int(news_point.get("news_bearish") or 0),
			tier_counts=dict(news_point.get("news_tier_counts") or {}),
			top_articles=list(news_point.get("top_articles") or []),
			week=self._week(social, news, window),
		)

	@staticmethod
	def _week(
		social: dict[str, dict[str, Any]],
		news: dict[str, dict[str, Any]],
		window: list[datetime.date],
	) -> tuple[WeekDay, ...]:
		"""The whole window as comparison rows, oldest first.

		Every day is present, quiet ones included, because a gap in the middle of the week
		is itself a thing the paragraph may need to account for. A day with no row carries
		a null score and a zero count, which is the same null-is-not-zero contract the
		chart draws with.
		"""
		entries = []
		for date in window:
			day = date.isoformat()
			point = social.get(day) or {}
			news_row = news.get(day) or {}
			entries.append(
				WeekDay(
					day=day,
					social_score=point.get("score"),
					post_count=int(point.get("post_count") or 0),
					news_score=news_row.get("news_sentiment_score"),
					news_count=int(news_row.get("article_count") or 0),
				)
			)
		return tuple(entries)

	def _row(self, evidence: DayEvidence, summary: str, *, is_final: bool) -> dict[str, Any]:
		return {
			"ticker": evidence.ticker,
			"as_of_day": evidence.day,
			"summary": summary,
			"is_final": is_final,
			"news_count": evidence.news_count,
			"post_count": evidence.post_count,
			"news_score": evidence.news_score,
			"social_score": evidence.social_score,
			"model": self.generator.model,
		}

	@staticmethod
	def _point(row: dict[str, Any]) -> dict[str, Any]:
		"""One summary in the shape the endpoint returns."""
		return {
			"day": str(row.get("as_of_day"))[:10],
			"summary": row.get("summary"),
			"is_final": bool(row.get("is_final")),
			"generated_at": row.get("generated_at"),
		}

	def _prune_once(self) -> None:
		"""One delete per process, matching the day tables' own retention."""
		if self._pruned:
			return
		self._pruned = True
		self.repository.prune(utc_now().date() - datetime.timedelta(days=RETENTION_DAYS))
