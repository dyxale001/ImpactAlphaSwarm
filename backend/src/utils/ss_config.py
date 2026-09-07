"""Sentiment scout: one object holding every tunable setting.

Every field name maps to the env var it used to be read from, and every default is
the value the old module constant carried.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
	raw = os.getenv(name)
	if raw is None:
		return default
	return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
	try:
		return int(os.getenv(name, str(default)))
	except (TypeError, ValueError):
		return default


def _env_float(name: str, default: float) -> float:
	try:
		return float(os.getenv(name, str(default)))
	except (TypeError, ValueError):
		return default


@dataclass(frozen=True)
class SentimentConfig:
	"""Immutable settings shared by every collaborator in the scout."""
	# News collection
	news_lookback_days: int = 7
	marketaux_limit_per_ticker: int = 10
	marketaux_max_pages: int = 25
	marketaux_cache_max_age_hours: int = 48
	finnhub_cache_max_age_hours: int = 48
	finnhub_live_topup_max: int = 15
	finnhub_min_interval: float = 1.1

	# Social collection
	stocktwits_engagement_cap: float = 8.0
	stocktwits_min_interval: float = 1.0

	# The fixed page count used when social_history_enabled is off, which is the
	# behaviour this feature must not change until it is switched on. With the flag on
	# the walk is adaptive instead, so this is unused.
	stocktwits_max_pages: int = 2

	# Off means the scout behaves exactly as it did before this feature. No window
	# filter, no adaptive paging, no writes. One flag, one behaviour change.
	social_history_enabled: bool = False

	# ── three windows, deliberately not one ──────────────────────────────────
	# The reverted build used a single lookback for both how far the chart displayed
	# and how deep the collector walked. Fusing them puts the display window's depth on
	# the run's path, which is v1's mistake in miniature: at seven days a busy ticker
	# never reaches the window edge, so every run pays the full page ceiling.

	# How many calendar days the chart shows, and how far back a BACKFILL walks. Never
	# used to size a walk inside an analysis run.
	social_display_days: int = 7

	# How far back a RUN's walk reaches. A run only needs enough to build today's row,
	# and one page is roughly thirty posts, so most tickers stop on page one.
	#
	# Two rather than one on purpose: a quiet ticker with nothing posted today would
	# otherwise lose its social signal entirely. Gaps left by a ticker that went
	# uncollected for longer are filled by the backfill job, not by deepening this.
	social_accumulate_days: int = 2

	# The page ceiling for one ticker's walk inside a run, and the only thing standing
	# between a busy ticker and an unbounded crawl. The walk normally stops earlier,
	# when a page reaches back past the window edge; this is the backstop for when it
	# does not. Six pages is roughly 180 posts.
	stocktwits_day_max_pages: int = 6

	# The page ceiling for a BACKFILL walk, which is far higher because nothing waits on
	# one. A page is about thirty posts, so the run's six pages is under two days for a
	# ticker posting a hundred times a day: 015 shipped exactly that bug at twelve pages
	# and filled two bars of seven on precisely the assets people open. Thirty pages is
	# about thirty seconds for one busy ticker, which is free in a scheduled job and
	# would be unthinkable in a run.
	social_backfill_max_pages: int = 30

	# How many tickers one backfill pass will seed. The wall clock budget is the real
	# bound; this is the rail that keeps a night's worst case a number we chose rather
	# than however many tickers happen to be new.
	social_backfill_quota: int = 30

	# Wall clock budget for the WHOLE social collection, across every ticker. The page
	# ceiling bounds requests, not seconds, so at six seconds a request a degraded
	# StockTwits could still spend half an hour while staying inside it. Once this is
	# spent the walk stops and we score what is already in hand.
	social_collect_max_seconds: float = 180.0

	# The same, for a backfill pass. Longer because it is doing more and nobody is
	# waiting, but still bounded: a scheduled job has an attempt deadline.
	social_backfill_max_seconds: float = 900.0

	# Per request timeout. A page that has not answered in six seconds is not going to,
	# and ten of those in a row used to be a tenth of the nightly budget.
	stocktwits_request_timeout: float = 6.0

	# How many of a day's posts are kept on its row, and how many of a run's posts are
	# kept on ai_recommendation. The second is far smaller because that row also carries
	# every news article and its insert is already at the edge of what Supabase accepts.
	# The asset card only ever rendered five.
	social_day_top_posts: int = 15
	social_recommendation_posts: int = 5

	# ── news history ─────────────────────────────────────────────────────────
	# Off means the scout writes no news day rows and the chart falls back to the news
	# line the frontend derives for itself. Its own flag rather than riding on
	# social_history_enabled: the two write different tables through different merges,
	# and being able to turn one off without the other is the whole point of having a
	# flag at all.
	news_history_enabled: bool = False

	# How many of a day's articles are kept on its row. Smaller than the social
	# equivalent because a day's news is measured in single figures where a day's
	# chatter runs to hundreds, so this is a ceiling that rarely binds.
	news_day_top_articles: int = 8

	# ── intraday ticks ───────────────────────────────────────────────────────
	# Off means nothing collects between the nightly runs, which is the behaviour before
	# this existed: today's bar stays empty from midnight UTC until the 22:00 job writes
	# it. Its own flag rather than riding on social_history_enabled, because a tick is a
	# scheduled job somebody has to point a scheduler at and the history can be perfectly
	# useful without one.
	social_tick_enabled: bool = False

	# The page ceiling for one ticker's tick. Far below the run's six and the backfill's
	# thirty on purpose: a tick is topping up a few hours of posts onto a day it already
	# holds, so it walks until it meets a message id it has already counted and stops.
	# Two pages is roughly sixty posts, which is more than a session's chatter for all but
	# the loudest tickers.
	social_tick_max_pages: int = 2

	# How many tickers one tick pass will walk. Higher than the backfill's quota because
	# the per ticker cost is a fraction of a seed's, and a pass that silently skipped the
	# tail of the list would leave exactly the same empty bars this feature exists to fill.
	social_tick_quota: int = 60

	# Wall clock budget for a whole tick pass. Shorter than the backfill's fifteen minutes:
	# there are two of these a day inside market hours, and a tick that is still running
	# when the next one starts is a tick that is too slow to be useful.
	social_tick_max_seconds: float = 300.0

	# How many of a tick's NEW posts get the metered GCP signal, as opposed to VADER alone.
	# Lower than the run's gcp_top_n because there are two ticks a day on top of the
	# nightly, and the nightly is the pass whose budget must not be crowded out.
	#
	# This changes the RATIO of GCP scored to VADER scored posts within a day, not the
	# method: a day has always been a mix, since gcp_top_n has always been a ceiling on a
	# list rather than a promise about every post. It is not the seam ss_backfill.scorer
	# warns about, which was a whole region of the chart scored by a different method than
	# the rest. Raise it to gcp_top_n to make a tick score exactly as a run does.
	social_tick_gcp_top_n: int = 5

	# ── generated day summaries ──────────────────────────────────────────────
	# Off means the chart's bars are inert and the summary endpoint returns nothing, which
	# is the behaviour before this existed. Run migrations/022 first.
	day_summary_enabled: bool = False

	# The floor between two generations of the SAME still-open day. A day in progress is
	# worth rewriting as it fills up, but not on every page load, and the reader clicking
	# today's bar four times in a minute must cost one call rather than four.
	#
	# Not the only condition: the evidence has to have moved as well, or a dead quiet
	# afternoon would re-bill every ninety minutes to say the same thing again.
	day_summary_today_cooldown_minutes: int = 90

	# The ceiling on a stored summary. A paragraph that runs past this is a model that has
	# ignored the brief, and a panel under a chart has no room for it either. Sized for the
	# five things the prompt asks for (the score's meaning, the volume, the week's shape,
	# the leading article and the loudest post) at four or five sentences, plus slack: this
	# is a guard against an essay, not a word budget the model should feel.
	day_summary_max_chars: int = 900

	# How many of the day's top articles and posts the prompt offers the model. Enough to
	# choose from, few enough that the choice is between things that genuinely led the day.
	day_summary_evidence_items: int = 3

	# Scoring
	gcp_top_n: int = 10

	# In flight ceiling for those calls. Matching gcp_top_n costs one round trip.
	gcp_max_workers: int = 10

	# Aggregation
	news_recency_halflife_days: float = 2.0
	news_weight: float = 0.7

	@property
	def social_weight(self) -> float:
		return 1.0 - self.news_weight

	@classmethod
	def from_env(cls) -> "SentimentConfig":
		"""Build the configuration from the environment, using the same variable
		names and defaults the module constants used."""
		return cls(
			news_lookback_days=_env_int("NEWS_LOOKBACK_DAYS", 7),
			marketaux_limit_per_ticker=_env_int("MARKETAUX_LIMIT_PER_TICKER", 10),
			marketaux_max_pages=_env_int("MARKETAUX_MAX_PAGES", 25),
			marketaux_cache_max_age_hours=_env_int("MARKETAUX_CACHE_MAX_AGE_HOURS", 48),
			finnhub_cache_max_age_hours=_env_int("FINNHUB_CACHE_MAX_AGE_HOURS", 48),
			finnhub_live_topup_max=_env_int("FINNHUB_LIVE_TOPUP_MAX", 15),
			finnhub_min_interval=_env_float("FINNHUB_MIN_INTERVAL_SECONDS", 1.1),
			stocktwits_max_pages=_env_int("STOCKTWITS_MAX_PAGES", 2),
			stocktwits_engagement_cap=_env_float("STOCKTWITS_ENGAGEMENT_CAP", 8.0),
			stocktwits_min_interval=_env_float("STOCKTWITS_MIN_INTERVAL_SECONDS", 1.0),
			social_history_enabled=_env_bool("SOCIAL_HISTORY_ENABLED", False),
			social_display_days=max(1, _env_int("SOCIAL_DISPLAY_DAYS", 7)),
			social_accumulate_days=max(1, _env_int("SOCIAL_ACCUMULATE_DAYS", 2)),
			stocktwits_day_max_pages=max(1, _env_int("STOCKTWITS_DAY_MAX_PAGES", 6)),
			social_backfill_max_pages=max(1, _env_int("SOCIAL_BACKFILL_MAX_PAGES", 30)),
			social_backfill_quota=max(1, _env_int("SOCIAL_BACKFILL_QUOTA", 30)),
			social_collect_max_seconds=_env_float("SOCIAL_COLLECT_MAX_SECONDS", 180.0),
			social_backfill_max_seconds=_env_float("SOCIAL_BACKFILL_MAX_SECONDS", 900.0),
			stocktwits_request_timeout=_env_float("STOCKTWITS_REQUEST_TIMEOUT", 6.0),
			social_day_top_posts=max(1, _env_int("SOCIAL_DAY_TOP_POSTS", 15)),
			social_recommendation_posts=max(1, _env_int("SOCIAL_RECOMMENDATION_POSTS", 5)),
			news_history_enabled=_env_bool("NEWS_HISTORY_ENABLED", False),
			news_day_top_articles=max(1, _env_int("NEWS_DAY_TOP_ARTICLES", 8)),
			social_tick_enabled=_env_bool("SOCIAL_TICK_ENABLED", False),
			social_tick_max_pages=max(1, _env_int("SOCIAL_TICK_MAX_PAGES", 2)),
			social_tick_quota=max(1, _env_int("SOCIAL_TICK_QUOTA", 60)),
			social_tick_max_seconds=_env_float("SOCIAL_TICK_MAX_SECONDS", 300.0),
			social_tick_gcp_top_n=max(0, _env_int("SOCIAL_TICK_GCP_TOP_N", 5)),
			day_summary_enabled=_env_bool("DAY_SUMMARY_ENABLED", False),
			day_summary_today_cooldown_minutes=max(
				0, _env_int("DAY_SUMMARY_TODAY_COOLDOWN_MINUTES", 90)
			),
			day_summary_max_chars=max(120, _env_int("DAY_SUMMARY_MAX_CHARS", 900)),
			day_summary_evidence_items=max(1, _env_int("DAY_SUMMARY_EVIDENCE_ITEMS", 3)),
			gcp_top_n=_env_int("GCP_SENTIMENT_TOP_N", 10),
			gcp_max_workers=max(1, _env_int("GCP_SENTIMENT_MAX_WORKERS", 10)),
			news_recency_halflife_days=_env_float("NEWS_RECENCY_HALFLIFE_DAYS", 2.0),

			news_weight=min(1.0, max(0.0, _env_float("NEWS_SENTIMENT_WEIGHT", 0.7))),
		)