"""Storage for macro news (migration 031). Backend-only; reads degrade, writes log.

The client is fetched on first use, never at import: ``supabase_client`` raises at
import when its env vars are missing, and a missing database should make the feature
quiet, not make the module unimportable. Tests pass a fake client in.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)


class MacroNewsRepository:
    TABLE = "macro_news_articles"
    CHUNK_SIZE = 100
    COLUMNS = (
        "finnhub_id, headline, blurb, source, url, image_url, published_at, fetched_at, "
        "gate_p, market_wide_p, universe_probs, tags, jev_model, question_version, scored_at"
    )

    def __init__(self, client: Any = None):
        self._client_override = client

    def _client(self):
        if self._client_override is not None:
            return self._client_override
        from ..utils.supabase_client import supabase

        return supabase

    def max_finnhub_id(self) -> Optional[int]:
        """The newest story already stored, or None for an empty table or a failed read.

        None makes the next pull read the whole feed, which costs one extra scoring pass
        at worst, since the upsert ignores ids it already has.
        """
        try:
            res = (
                self._client()
                .table(self.TABLE)
                .select("finnhub_id")
                .order("finnhub_id", desc=True)
                .limit(1)
                .execute()
            )
            rows = res.data or []
            return int(rows[0]["finnhub_id"]) if rows else None
        except Exception as exc:
            logger.warning("Macro news: newest-id read failed: %s", exc)
            return None

    def read_window(self, since: datetime) -> list[dict[str, Any]]:
        """Every stored story published since ``since``, newest first."""
        try:
            res = (
                self._client()
                .table(self.TABLE)
                .select(self.COLUMNS)
                .gte("published_at", since.isoformat())
                .order("published_at", desc=True)
                .execute()
            )
            return list(res.data or [])
        except Exception as exc:
            logger.warning("Macro news: window read failed: %s", exc)
            return []

    def upsert(self, rows: list[dict[str, Any]]) -> int:
        """Insert or replace by ``finnhub_id``. Returns rows written; never raises."""
        written = 0
        for start in range(0, len(rows), self.CHUNK_SIZE):
            chunk = rows[start : start + self.CHUNK_SIZE]
            try:
                self._client().table(self.TABLE).upsert(chunk, on_conflict="finnhub_id").execute()
                written += len(chunk)
            except Exception as exc:
                logger.warning("Macro news: upsert failed (%d rows): %s", len(chunk), exc)
        return written

    def prune(self, before: datetime) -> None:
        try:
            self._client().table(self.TABLE).delete().lt("published_at", before.isoformat()).execute()
        except Exception as exc:
            logger.info("Macro news: prune failed: %s", exc)
