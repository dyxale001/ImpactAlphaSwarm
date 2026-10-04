"""A pull, a re-score and the page's feed.

A pull fetches stories newer than the newest stored, scores them, and in the same
batch retries anything in the lookback window that is unscored or was scored by older
questions. That retry is what makes a Jev outage or a wording change self-healing on
the next scheduled pull, without anyone calling ``/rescore``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from ..agents.asset_discovery import UNIVERSES
from .collector import Article, MacroNewsCollector
from .config import MACRO_LOOKBACK_DAYS, MACRO_RETENTION_DAYS, MACRO_TAG_THRESHOLD
from .jev_client import JevClient
from .repository import MacroNewsRepository
from .tagger import Scores, tags_for
from .universes import MARKET_WIDE, question_version

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def article_from_row(row: dict[str, Any]) -> Article:
    return Article(
        finnhub_id=int(row["finnhub_id"]),
        headline=row["headline"],
        blurb=row.get("blurb") or "",
        source=row["source"],
        url=row["url"],
        image_url=row.get("image_url"),
        published_at=_parse_ts(row["published_at"]),
    )


class MacroNewsService:
    def __init__(
        self,
        repository: Optional[MacroNewsRepository] = None,
        collector: Optional[MacroNewsCollector] = None,
        jev: Optional[JevClient] = None,
        now: Callable[[], datetime] = _utcnow,
    ):
        self.repository = repository or MacroNewsRepository()
        self.collector = collector or MacroNewsCollector()
        self.jev = jev or JevClient()
        self.now = now

    # ── writing ───────────────────────────────────────────────────────────────

    def _scored_row(self, article: Article, scores: Scores, version: str, at: datetime) -> dict[str, Any]:
        return {
            **article.to_row(),
            "gate_p": scores.gate,
            "market_wide_p": scores.market_wide,
            "universe_probs": dict(scores.universes),
            "tags": tags_for(scores),
            "jev_model": self.jev.model_used,
            "question_version": version,
            "scored_at": at.isoformat(),
        }

    def _run(self, *, force: bool) -> dict[str, Any]:
        now = self.now()
        version = question_version()
        cost_before = self.jev.cost  # the client lives as long as the service
        since = now - timedelta(days=MACRO_LOOKBACK_DAYS)

        fresh = [] if force else self.collector.fetch(min_id=self.repository.max_finnhub_id())
        fresh_ids = {a.finnhub_id for a in fresh}
        stored = self.repository.read_window(since)
        retry = [
            article_from_row(row)
            for row in stored
            if int(row["finnhub_id"]) not in fresh_ids
            and (force or row.get("scored_at") is None or row.get("question_version") != version)
        ]

        batch = fresh + retry
        scores = self.jev.score_many([a.state() for a in batch])

        rows: list[dict[str, Any]] = []
        scored = tagged = 0
        for article, result in zip(batch, scores):
            if result is None:
                # A new story is stored unscored so it is not lost; a retried one that
                # failed again is left as it was.
                if article.finnhub_id in fresh_ids:
                    rows.append(article.to_row())
                continue
            row = self._scored_row(article, result, version, now)
            rows.append(row)
            scored += 1
            tagged += bool(row["tags"])

        written = self.repository.upsert(rows)
        if not force:
            self.repository.prune(now - timedelta(days=MACRO_RETENTION_DAYS))

        summary = {
            "fetched": len(fresh),
            "retried": len(retry),
            "scored": scored,
            "unscored": len(batch) - scored,
            "tagged": tagged,
            "written": written,
            "question_version": version,
            "jev_cost_usd": round(self.jev.cost - cost_before, 6),
        }
        logger.info("Macro news %s: %s", "rescore" if force else "pull", summary)
        return summary

    def pull(self) -> dict[str, Any]:
        """The scheduled job. Never raises."""
        try:
            return {"ok": True, **self._run(force=False)}
        except Exception as exc:
            logger.warning("Macro news pull failed: %s", exc)
            return {"ok": False, "error": str(exc)}

    def rescore(self) -> dict[str, Any]:
        """Re-score every stored story in the lookback window, after a wording or threshold change."""
        try:
            return {"ok": True, **self._run(force=True)}
        except Exception as exc:
            logger.warning("Macro news rescore failed: %s", exc)
            return {"ok": False, "error": str(exc)}

    # ── reading ───────────────────────────────────────────────────────────────

    @staticmethod
    def _serialise(row: dict[str, Any]) -> dict[str, Any]:
        probs = row.get("universe_probs") or {}
        scored = row.get("scored_at") is not None
        return {
            "id": int(row["finnhub_id"]),
            "headline": row["headline"],
            "blurb": row.get("blurb") or "",
            "source": row["source"],
            "url": row["url"],
            "image_url": row.get("image_url"),
            "published_at": row["published_at"],
            "scored": scored,
            "relevance": row.get("gate_p"),
            "market_wide": row.get("market_wide_p"),
            # Current universes in their usual order. A universe added since this row was
            # scored reads null until the next re-score, rather than being left out.
            "universes": {u: probs.get(u) for u in UNIVERSES},
            "tags": list(row.get("tags") or []),
        }

    def feed(self, days: int = MACRO_LOOKBACK_DAYS) -> dict[str, Any]:
        """What the Market News page shows: tagged stories, and everything else apart."""
        rows = self.repository.read_window(self.now() - timedelta(days=days))
        items = [self._serialise(r) for r in rows]
        fetched = [r.get("fetched_at") for r in rows if r.get("fetched_at")]
        return {
            "universes": list(UNIVERSES),
            "market_wide_label": MARKET_WIDE,
            "threshold": MACRO_TAG_THRESHOLD,
            "days": days,
            "updated_at": max(fetched) if fetched else None,
            "tagged": [i for i in items if i["tags"]],
            "other": [i for i in items if not i["tags"]],
        }
