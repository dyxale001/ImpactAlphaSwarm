"""Sentiment scout: publisher trust tiers and source attribution.

Answers two questions about a news article, both purely from its metadata:

  * Who actually published it? Aggregators republish other people's stories and
    get credited for them, so ``_effective_source`` tries to recover the real wire.
  * How much should that publisher count? ``_source_tier`` maps a publisher to a
    reliability tier, and the tier drives both its weight and its share of the
    news score.

Every threshold here is overridable by env var so tiering can be retuned without
a deploy.
"""

from __future__ import annotations

import os
import re
import urllib.parse

# Trusted publishers, split into reliability tiers. Each tier carries a weight so
# that, within the news signal, a tier-1 wire counts for more than a tier-2/3
# article. Sources are matched case-insensitively against Finnhub's ``source``
# field (substring match, so "yahoo" matches "Yahoo Finance"). A source not listed
# in any tier is not trusted and is dropped before scoring. Each tier's source
# list and weight is overridable via env (e.g. NEWS_TIER2_SOURCES, NEWS_TIER2_WEIGHT).
_DEFAULT_TIER_SOURCES: dict[int, tuple[str, ...]] = {
    # Tier 1: established financial wires / newspapers of record.
    1: (
        "reuters",
        "bloomberg",
        "cnbc",
        "wall street journal",
        "wsj",
        "financial times",
        "associated press",
        "ap news",
        "marketwatch",
        "barron",
        "the economist",
        "morningstar",
    ),
    # Tier 2: reputable but more aggregator / secondary outlets.
    2: (
        "yahoo",
        "forbes",
        "investor's business daily",
        "investors business daily",
        "business insider",
    ),
    # Tier 3: crowd-sourced / contributor analysis.
    3: (
        "seekingalpha",
        "seeking alpha",
        "the motley fool",
        "motley fool",
    ),
}

_DEFAULT_TIER_WEIGHTS: dict[int, float] = {1: 1.0, 2: 0.6, 3: 0.3}

# Tier-group shares for the two-level news blend: the news score is a weighted
# combination of each reliability tier's OWN average, with these shares, rather
# than a per-article weighted mean. This makes a tier's influence independent of
# how many articles it has, so a few tier-1 wires are not swamped by a flood of
# tier-2/3 articles. Shares are renormalized over the tiers actually present, so
# they need not sum to 1. Overridable via NEWS_TIER{n}_SHARE.
_DEFAULT_TIER_SHARES: dict[int, float] = {1: 0.6, 2: 0.3, 3: 0.1}


def _tier_share(tier: int) -> float:
    try:
        return float(os.getenv(f"NEWS_TIER{tier}_SHARE", str(_DEFAULT_TIER_SHARES[tier])))
    except ValueError:
        return _DEFAULT_TIER_SHARES[tier]


def _tier_sources(tier: int) -> tuple[str, ...]:
    override = os.getenv(f"NEWS_TIER{tier}_SOURCES", "").strip()
    if not override:
        return _DEFAULT_TIER_SOURCES[tier]
    return tuple(s.strip().lower() for s in override.split(",") if s.strip())


def _tier_weight(tier: int) -> float:
    try:
        return float(os.getenv(f"NEWS_TIER{tier}_WEIGHT", str(_DEFAULT_TIER_WEIGHTS[tier])))
    except ValueError:
        return _DEFAULT_TIER_WEIGHTS[tier]


def _source_tier(source: str) -> int | None:
    """Return 1/2/3 for a recognized trusted publisher, else ``None``."""
    name = (source or "").lower()
    for tier in (1, 2, 3):
        if any(s in name for s in _tier_sources(tier)):
            return tier
    return None


# --- Syndicated wire recovery ------------------------------------------------
# Aggregators (Yahoo, MarketWatch, …) routinely republish wire-service stories.
# Finnhub credits the aggregator in ``source``, which down-tiers a genuine
# tier-1 wire. We recover the originating wire from (a) the article URL's domain
# and (b) a leading dateline in the text ("WASHINGTON (Reuters) - …") and tier on
# that instead, so a Reuters story republished by an aggregator is credited as
# Reuters (tier 1) rather than the aggregator (tier 2/3). Conservative by design:
# only known tier-1 wires are recovered, and datelines are honored only near the
# start of the text so an article that merely *mentions* a wire isn't upgraded.
# Returned names substring-match the tier-1 source lists in ``_DEFAULT_TIER_SOURCES``.
# Single source of truth for tier-1 publisher domains -> display name, shared by
# the Finnhub syndication recovery (URL-domain path, below) and the Marketaux
# domain whitelist (server-side tier-1-only filter, see ``_collect_marketaux_news``).
_TIER1_DOMAINS: tuple[tuple[str, str], ...] = (
    ("reuters.com", "Reuters"),
    ("bloomberg.com", "Bloomberg"),
    ("wsj.com", "Wall Street Journal"),
    ("ft.com", "Financial Times"),
    ("apnews.com", "Associated Press"),
    ("cnbc.com", "CNBC"),
    ("marketwatch.com", "MarketWatch"),
    ("barrons.com", "Barron's"),
    ("economist.com", "The Economist"),
    ("morningstar.com", "Morningstar"),
)

_DATELINE_RE = re.compile(r"\((reuters|bloomberg|ap|associated press|dow jones)\)", re.IGNORECASE)
_DATELINE_NAMES: dict[str, str] = {
    "reuters": "Reuters",
    "bloomberg": "Bloomberg",
    "ap": "Associated Press",
    "associated press": "Associated Press",
    "dow jones": "Dow Jones",
}

# Only trust a wire dateline that appears near the start of the article text.
_DATELINE_SCAN_CHARS = 200


def _effective_source(headline: str, summary: str, url: str | None, source: str) -> str:
    if url:
        host = urllib.parse.urlparse(url).netloc.lower()
        for domain, name in _TIER1_DOMAINS:
            if host == domain or host.endswith("." + domain):
                return name

    lead = f"{headline} {summary}"[:_DATELINE_SCAN_CHARS]
    match = _DATELINE_RE.search(lead)
    if match:
        return _DATELINE_NAMES[match.group(1).lower()]

    return source


def _tier1_publisher(source: str) -> str | None:
    name = (source or "").lower()
    for domain, display in _TIER1_DOMAINS:
        if domain in name:
            return display
    # ``source`` may be a publisher name rather than a domain.
    if _source_tier(source) == 1:
        return source
    return None
