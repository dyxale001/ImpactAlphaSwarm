"""A pull, a re-score and the page's feed.

A pull fetches stories newer than the newest stored, scores them, and in the same
batch retries anything in the lookback window that is unscored or was scored by older
questions. That retry is what makes a Jev outage or a wording change self-healing on
the next scheduled pull, without anyone calling ``/rescore``.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from ..agents.asset_discovery import UNIVERSES
from .collector import Article, MacroNewsCollector
from .config import (
    MACRO_DIGEST_SPACING_SECONDS,
    MACRO_LOOKBACK_DAYS,
    MACRO_RETENTION_DAYS,
    MACRO_TAG_THRESHOLD,
)
from .digest import DigestStory, MacroDigestGenerator, is_commentary
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
        digester: Optional[MacroDigestGenerator] = None,
        now: Callable[[], datetime] = _utcnow,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.repository = repository or MacroNewsRepository()
        self.collector = collector or MacroNewsCollector()
        self.jev = jev or JevClient()
        self.digester = digester or MacroDigestGenerator()
        self.now = now
        self.sleep = sleep

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
        overviews = self._refresh_digests(since, now)
        if not force:
            self.repository.prune(now - timedelta(days=MACRO_RETENTION_DAYS))

        summary = {
            "fetched": len(fresh),
            "retried": len(retry),
            "scored": scored,
            "unscored": len(batch) - scored,
            "tagged": tagged,
            "written": written,
            "overviews": overviews,
            "question_version": version,
            "jev_cost_usd": round(self.jev.cost - cost_before, 6),
        }
        logger.info("Macro news %s: %s", "rescore" if force else "pull", summary)
        return summary

    # ── overviews ─────────────────────────────────────────────────────────────

    @staticmethod
    def _groups() -> list[str]:
        return [MARKET_WIDE, *UNIVERSES]

    @staticmethod
    def _group_p(row: dict[str, Any], group: str) -> float:
        if group == MARKET_WIDE:
            return row.get("market_wide_p") or 0.0
        return (row.get("universe_probs") or {}).get(group) or 0.0

    def _members(self, rows: list[dict[str, Any]], group: str) -> list[dict[str, Any]]:
        """A group's tagged stories, most relevant first, newest first on a tie."""
        tagged = [r for r in rows if group in (r.get("tags") or [])]
        tagged.sort(key=lambda r: str(r["published_at"]), reverse=True)
        return sorted(tagged, key=lambda r: self._group_p(r, group), reverse=True)

    def _refresh_digests(self, since: datetime, now: datetime) -> int:
        """Rewrite the overview of every group whose tagged stories changed. Returns how many."""
        rows = self.repository.read_window(since)
        latest = self.repository.latest_digests()
        written = 0
        called = False
        for group in self._groups():
            members = self._members(rows, group)
            if not members:
                continue
            ids = sorted(int(r["finnhub_id"]) for r in members)
            previous = latest.get(group)
            if previous and sorted(int(i) for i in previous.get("article_ids") or []) == ids:
                continue
            stories = [
                DigestStory(
                    publisher=r["source"],
                    published_at=_parse_ts(r["published_at"]),
                    headline=r["headline"],
                    blurb=r.get("blurb") or "",
                )
                for r in members
            ]
            # Spaced out so a pull's overviews stay under the key's per-minute token limit.
            if called:
                self.sleep(MACRO_DIGEST_SPACING_SECONDS)
            called = True
            summary = self.digester.generate(group, stories, total=len(members))
            if summary is None:
                continue
            written += self.repository.insert_digest(
                {
                    "universe": group,
                    "slot_start": now.isoformat(),
                    "summary": summary,
                    "article_ids": ids,
                    "model": self.digester.model,
                }
            )
        return written

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
            # A presenter's stock pick or a trading idea, not a news event. Still listed
            # and still scored, but labelled, and kept out of the sector summaries.
            "commentary": is_commentary(row["headline"]),
        }

    @staticmethod
    def _updated_at(rows: list[dict[str, Any]]) -> Optional[str]:
        fetched = [r.get("fetched_at") for r in rows if r.get("fetched_at")]
        return max(fetched) if fetched else None

    def _overviews(self, rows: list[dict[str, Any]], groups: list[str]) -> dict[str, dict[str, Any]]:
        """The latest overview per group, shown only while the group still has tagged
        stories in the window, so a paragraph never outlives the stories it describes."""
        latest = self.repository.latest_digests()
        out: dict[str, dict[str, Any]] = {}
        for group in groups:
            digest = latest.get(group)
            if digest and self._members(rows, group):
                out[group] = {
                    "summary": digest["summary"],
                    "generated_at": digest.get("generated_at") or digest.get("slot_start"),
                    "article_count": len(digest.get("article_ids") or []),
                }
        return out

    def _section(self, rows: list[dict[str, Any]], group: str, overviews: dict, limit: int) -> dict[str, Any]:
        """One group for the stock tab: its overview and its most relevant stories.
        Commentary (a presenter's pick, a trading idea) never leads, as on the page."""
        members = self._members(rows, group)
        news = [r for r in members if not is_commentary(r["headline"])]
        return {
            "group": group,
            "overview": overviews.get(group),
            "total": len(members),
            "stories": [self._serialise(r) for r in news[:limit]],
        }

    def stock_view(self, ticker: str, days: int = MACRO_LOOKBACK_DAYS) -> dict[str, Any]:
        """The stock page's Market news tab: its universe's news, then market-wide news.

        Universe level, never ticker level (D-223): every stock in a universe sees the
        same stories, and the tab says so. A stock with no universe, or one no longer
        in the list, gets ``sector: None`` and still sees market-wide news."""
        universe = self.repository.universe_for(ticker)
        if universe not in UNIVERSES:
            universe = None
        rows = self.repository.read_window(self.now() - timedelta(days=days))
        groups = [MARKET_WIDE] + ([universe] if universe else [])
        overviews = self._overviews(rows, groups)
        return {
            "ticker": ticker.upper(),
            "universe": universe,
            "market_wide_label": MARKET_WIDE,
            "universes": list(UNIVERSES),
            "threshold": MACRO_TAG_THRESHOLD,
            "days": days,
            "updated_at": self._updated_at(rows),
            "sector": self._section(rows, universe, overviews, limit=5) if universe else None,
            "market_wide": self._section(rows, MARKET_WIDE, overviews, limit=3),
        }

    def feed(self, days: int = MACRO_LOOKBACK_DAYS) -> dict[str, Any]:
        """What the Market News page shows: tagged stories, and everything else apart."""
        rows = self.repository.read_window(self.now() - timedelta(days=days))
        items = [self._serialise(r) for r in rows]
        overviews = self._overviews(rows, self._groups())
        return {
            "universes": list(UNIVERSES),
            "market_wide_label": MARKET_WIDE,
            "threshold": MACRO_TAG_THRESHOLD,
            "days": days,
            "updated_at": self._updated_at(rows),
            "overviews": overviews,
            "tagged": [i for i in items if i["tags"]],
            "other": [i for i in items if not i["tags"]],
        }
