"""Sentiment scout: persistence for social posts and their daily rollups.
"""

from __future__ import annotations

import datetime
import logging
from typing import Any

from .ss_config import SentimentConfig
from .ss_models import SocialMention
from .supabase_client import supabase

logger = logging.getLogger("sentiment-scout")


class MessageRepository:
	"""Raw StockTwits posts, one row per message."""

	TABLE = "stocktwits_message_cache"
	COLUMNS = (
		"message_id, ticker, created_at, body, username, url, "
		"likes, reshares, replies, declared_sentiment, sentiment_score"
	)
	#: Supabase rejects large payloads, so inserts go up in batches
	CHUNK_SIZE = 200

	def __init__(self, config: SentimentConfig | None = None):
		self.config = config or SentimentConfig.from_env()

	def high_water_mark(self, ticker: str) -> int | None:
		"""The highest message id held for a ticker, or None if we hold none.
		"""
		try:
			res = (
				supabase.table(self.TABLE)
				.select("message_id")
				.eq("ticker", ticker.upper())
				.order("message_id", desc=True)
				.limit(1)
				.execute()
			)
			rows = res.data or []
			return int(rows[0]["message_id"]) if rows else None
		except Exception as e:
			logger.info("StockTwits high-water read failed for %s: %s", ticker, e)
			return None

	def oldest_created_at(self, ticker: str) -> datetime.datetime | None:
		"""Timestamp of the oldest post held, used to decide whether to seed."""
		try:
			res = (
				supabase.table(self.TABLE)
				.select("created_at")
				.eq("ticker", ticker.upper())
				.order("created_at", desc=False)
				.limit(1)
				.execute()
			)
			rows = res.data or []
			return parse_ts(rows[0]["created_at"]) if rows else None
		except Exception as e:
			logger.info("StockTwits oldest-post read failed for %s: %s", ticker, e)
			return None

	def read_window(self, ticker: str, since_dt: datetime.datetime) -> list[SocialMention]:
		"""Every post held for a ticker since ``since_dt``, newest first.
		"""
		try:
			res = (
				supabase.table(self.TABLE)
				.select(self.COLUMNS)
				.eq("ticker", ticker.upper())
				.gte("created_at", since_dt.isoformat())
				.order("created_at", desc=True)
				.execute()
			)
			cap = self.config.stocktwits_engagement_cap
			return [SocialMention.from_row(row, cap) for row in (res.data or [])]
		except Exception as e:
			logger.info("StockTwits window read failed for %s: %s", ticker, e)
			return []

	def read_rows(self, ticker: str, since_dt: datetime.datetime) -> list[dict[str, Any]]:
		"""Raw rows for the rollup builder, which needs the stored sentiment_score
		alongside the fields a SocialMention carries."""
		try:
			res = (
				supabase.table(self.TABLE)
				.select(self.COLUMNS)
				.eq("ticker", ticker.upper())
				.gte("created_at", since_dt.isoformat())
				.order("created_at", desc=True)
				.execute()
			)
			return res.data or []
		except Exception as e:
			logger.info("StockTwits row read failed for %s: %s", ticker, e)
			return []

	def insert_new(self, rows: list[dict[str, Any]]) -> int:
		"""Insert posts, ignoring any already held.
		"""
		usable = [row for row in rows if row.get("message_id") is not None]
		if not usable:
			return 0
		sent = 0
		for start in range(0, len(usable), self.CHUNK_SIZE):
			chunk = usable[start : start + self.CHUNK_SIZE]
			try:
				supabase.table(self.TABLE).upsert(chunk, on_conflict="message_id").execute()
				sent += len(chunk)
			except Exception as e:
				logger.warning("StockTwits post insert failed (%d rows): %s", len(chunk), e)
		return sent

	def prune(self, before_dt: datetime.datetime) -> None:
		"""Drop posts older than the retention window."""
		try:
			supabase.table(self.TABLE).delete().lt("created_at", before_dt.isoformat()).execute()
		except Exception as e:
			logger.warning("StockTwits prune failed: %s", e)


class DailySentimentRepository:
	"""Per-ticker, per-day social sentiment: what the trend chart reads."""

	TABLE = "social_sentiment_daily"
	COLUMNS = "ticker, as_of_night, social_sentiment_score, post_count, bullish_posts, bearish_posts"

	def write_days(self, ticker: str, rows: list[dict[str, Any]]) -> None:
		"""Replace a ticker's rollup slice.

		Delete-then-insert, matching ``save_ranking_shadow``: a day whose posts have
		since been pruned must disappear rather than linger with a stale score.
		"""
		if not rows:
			return
		nights = sorted(row["as_of_night"] for row in rows)
		try:
			(
				supabase.table(self.TABLE)
				.delete()
				.eq("ticker", ticker.upper())
				.gte("as_of_night", nights[0])
				.lte("as_of_night", nights[-1])
				.execute()
			)
			supabase.table(self.TABLE).insert(rows).execute()
		except Exception as e:
			logger.warning("Social daily rollup write failed for %s: %s", ticker, e)

	def read_history(self, ticker: str, days: int) -> list[dict[str, Any]]:
		"""The trailing ``days`` of rollups for a ticker, oldest first."""
		cutoff = (_utc_now() - datetime.timedelta(days=days)).date()
		try:
			res = (
				supabase.table(self.TABLE)
				.select(self.COLUMNS)
				.eq("ticker", ticker.upper())
				.gte("as_of_night", cutoff.isoformat())
				.order("as_of_night", desc=False)
				.execute()
			)
			return res.data or []
		except Exception as e:
			logger.info("Social daily rollup read failed for %s: %s", ticker, e)
			return []


def _utc_now() -> datetime.datetime:
	return datetime.datetime.now(datetime.timezone.utc)


def parse_ts(value: Any) -> datetime.datetime | None:
	"""Parse a stored timestamp, normalising to UTC-aware."""
	if not value:
		return None
	try:
		parsed = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
	except (TypeError, ValueError):
		return None
	if parsed.tzinfo is None:
		parsed = parsed.replace(tzinfo=datetime.timezone.utc)
	return parsed
