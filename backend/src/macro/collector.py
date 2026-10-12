"""Finnhub's general news feed, reduced to trusted publishers.

The feed returns the latest ~100 market and world stories (Reuters, CNBC and
Bloomberg in every sample so far). ``minId`` asks only for stories newer than the
newest one already stored, so three pulls a day read each story once.

Publishers go through the sentiment scout's registry, both to recover the wire behind
a syndicated story and to keep only tiers 1 and 2. Today that drops nothing; it is
there so a change in what Finnhub carries cannot put an untiered source on the page.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from ..utils.ss_sources import PublisherRegistry, default_registry
from .config import FINNHUB_GENERAL_NEWS_URL, MACRO_KEEP_TIERS

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Article:
    finnhub_id: int
    headline: str
    blurb: str
    source: str
    url: str
    image_url: Optional[str]
    published_at: datetime

    def state(self) -> str:
        """What Jev is shown: publisher, date, headline and the publisher's own summary."""
        day = self.published_at.strftime("%Y-%m-%d")
        return f"{self.source}, {day}: {self.headline}\n{self.blurb}".rstrip()

    def to_row(self) -> dict[str, Any]:
        return {
            "finnhub_id": self.finnhub_id,
            "headline": self.headline,
            "blurb": self.blurb or None,
            "source": self.source,
            "url": self.url,
            "image_url": self.image_url,
            "published_at": self.published_at.isoformat(),
        }


def parse_article(raw: Any, registry: PublisherRegistry) -> Optional[Article]:
    """One feed item, or None if it is malformed or not from a kept publisher tier."""
    if not isinstance(raw, dict):
        return None
    try:
        finnhub_id = int(raw["id"])
        headline = str(raw.get("headline") or "").strip()
        url = str(raw.get("url") or "").strip()
        published_at = datetime.fromtimestamp(int(raw["datetime"]), tz=timezone.utc)
    except (KeyError, TypeError, ValueError, OverflowError, OSError):
        return None
    if not headline or not url:
        return None

    # Stored as Finnhub sends it, even when (as with every Reuters item) it is just the
    # headline again plus "Reuters". Jev was validated on exactly this text, so it is
    # what Jev sees; the page hides a blurb that only repeats the headline.
    blurb = str(raw.get("summary") or "").strip()
    source = registry.effective_source(headline, blurb, url, str(raw.get("source") or ""))
    if registry.tier_of(source) not in MACRO_KEEP_TIERS:
        return None

    return Article(
        finnhub_id=finnhub_id,
        headline=headline,
        blurb=blurb,
        source=source,
        url=url,
        image_url=(str(raw.get("image")).strip() or None) if raw.get("image") else None,
        published_at=published_at,
    )


class MacroNewsCollector:
    def __init__(self, registry: Optional[PublisherRegistry] = None, timeout: int = 15):
        self.registry = registry or default_registry()
        self.timeout = timeout

    def fetch(self, min_id: Optional[int] = None) -> list[Article]:
        """Stories newer than ``min_id``, oldest first. Never raises; a failure is an empty list."""
        api_key = os.getenv("FINNHUB_API_KEY", "").strip()
        if not api_key:
            logger.warning("Macro news: FINNHUB_API_KEY is not set")
            return []

        params: dict[str, Any] = {"category": "general", "token": api_key}
        if min_id:
            params["minId"] = min_id
        try:
            resp = requests.get(
                FINNHUB_GENERAL_NEWS_URL, params=params, headers={"Accept": "application/json"},
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            logger.warning("Macro news: Finnhub request failed: %s", exc)
            return []
        if resp.status_code != 200:
            logger.warning("Macro news: Finnhub returned HTTP %s", resp.status_code)
            return []
        try:
            payload = resp.json()
        except ValueError:
            return []
        if not isinstance(payload, list):
            return []

        articles: dict[int, Article] = {}
        for raw in payload:
            article = parse_article(raw, self.registry)
            # minId is honoured by Finnhub, but filtering again costs nothing and keeps
            # a pull from re-scoring stories it already holds if it ever is not.
            if article is None or (min_id and article.finnhub_id <= min_id):
                continue
            articles[article.finnhub_id] = article
        return sorted(articles.values(), key=lambda a: a.finnhub_id)
