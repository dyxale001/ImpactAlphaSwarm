"""Pydantic validation schemas for ingested data.

These models act as the gatekeeper at the ingestion boundary: data is validated
here *before* it is scored, cached, or stored. Two failure modes are handled:

- Reject: structurally broken records (missing id, unparseable timestamp,
  wrong types) raise a ValidationError and are dropped by the caller.
- Flag: valid-but-suspicious records (future timestamps, empty text, oversized
  bodies, negative engagement) are kept but marked ``is_anomalous`` with reasons,
  so downstream code can audit or down-weight them rather than trust them blindly.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

logger = logging.getLogger("alpha-schemas")

# Generous upper bound on body/summary text; anything beyond is suspicious.
MAX_BODY_LEN = 40_000


# ---------------------------------------------------------------------------
# Social-text cleaning
# ---------------------------------------------------------------------------
# StockTwits bodies are raw user posts: emoji, profanity, tracking links and
# trailing cashtag spam. We produce a cleaned, professional ``display_body`` that
# is used downstream for both sentiment scoring and display, so the score and the
# text the user reads come from the same sanitized content. The raw ``body`` is
# retained only for the ingestion-time anomaly check and ticker-symbol matching.

# Links (http/https/www) — dropped entirely; they add no readable value.
_URL_RE = re.compile(r"(https?://\S+|www\.\S+)", re.IGNORECASE)

# Emoji / pictographs / dingbats / flags / symbol-arrows and their zero-width
# joiners and variation selectors. Deliberately avoids the general-punctuation
# block so dashes, quotes and ellipses survive.
_EMOJI_RE = re.compile(
    "["
    "\U0001F000-\U0001FAFF"  # emoji, pictographs, supplemental & extended
    "\U00002600-\U000027BF"  # misc symbols + dingbats
    "\U0001F1E6-\U0001F1FF"  # regional indicators (flags)
    "\U00002B00-\U00002BFF"  # misc symbols and arrows
    "\U00002190-\U000021FF"  # arrows
    "\U0000FE00-\U0000FE0F"  # variation selectors
    "\U0000200D"             # zero-width joiner
    "\U000020E3"             # combining enclosing keycap
    "]+",
    flags=re.UNICODE,
)

# Curated profanity/slur → professional-substitute map. Whole-word,
# case-insensitive. Each swear is swapped for a mild, meaning-preserving word so
# the sentence still reads naturally (no "****"). Slurs and words with no clean
# grammatical substitute map to "" and are removed, then whitespace is collapsed.
_PROFANITY_REPLACEMENTS = {
    "fucking": "really",
    "fuckin": "really",
    "fucked": "wrecked",
    "fuck": "screw",
    "fucker": "clown",
    "motherfucker": "clown",
    "shit": "junk",
    "shitty": "poor",
    "shite": "junk",
    "bullshit": "nonsense",
    "damn": "darn",
    "dammit": "darn it",
    "goddamn": "darn",
    "crap": "junk",
    "piss": "annoy",
    "pissed": "annoyed",
    "ass": "",
    "arse": "",
    "asshole": "jerk",
    "arsehole": "jerk",
    "bitch": "complain",
    "bastard": "jerk",
    "dick": "jerk",
    "cock": "",
    "prick": "jerk",
    "pussy": "coward",
    "cunt": "jerk",
    "twat": "jerk",
    "slut": "",
    "whore": "",
    "retard": "fool",
    "retarded": "foolish",
    "fag": "",
    "faggot": "",
    "nigger": "",
    "nigga": "",
    "wtf": "what",
    "stfu": "be quiet",
    "gtfo": "leave",
}
_PROFANITY_RE = re.compile(
    r"\b(" + "|".join(sorted(_PROFANITY_REPLACEMENTS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)


def _match_case(word: str, replacement: str) -> str:
    """Cast ``replacement`` to the casing of the matched ``word`` so substitutions
    blend in (ALL CAPS -> upper, Title -> capitalized, else lowercase)."""
    if not replacement:
        return ""
    if word.isupper() and len(word) > 1:
        return replacement.upper()
    if word[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def _sub_profanity(match: re.Match[str]) -> str:
    word = match.group(0)
    return _match_case(word, _PROFANITY_REPLACEMENTS[word.lower()])


def clean_social_text(text: str) -> str:
    """Return a professional, readable version of a raw social post.

    Strips links and emoji, swaps profanity/slurs for mild substitutes (slurs are
    removed), and collapses the runs of whitespace and cashtag spam that user
    posts accumulate. Used for both scoring and display so the sentiment score and
    the shown text agree.
    """
    if not text:
        return ""
    cleaned = _URL_RE.sub("", text)
    cleaned = _EMOJI_RE.sub("", cleaned)
    cleaned = _PROFANITY_RE.sub(_sub_profanity, cleaned)
    # Collapse whitespace (incl. newlines) into single spaces for a clean read.
    cleaned = re.sub(r"\s+", " ", cleaned)
    # Tidy stray spaces left before punctuation by the removals above.
    cleaned = re.sub(r"\s+([.,!?;:])", r"\1", cleaned)
    return cleaned.strip()


# ---------------------------------------------------------------------------
# Social-post quality gating
# ---------------------------------------------------------------------------
# StockTwits streams are heavy with posts that carry no usable, ticker-specific
# opinion: bare cashtags ("$META"), watchlist/rotation lists tagging many names,
# and promo/pump ads. These pollute the sentiment score, so we reject them at
# ingestion rather than scoring noise. Thresholds are the "balanced" preset.

MIN_CONTENT_WORDS = 4  # a post needs at least this many real words to be scored
MAX_CASHTAGS = 3       # more than this = a list/watchlist, not a view on one name

# A cashtag ($ followed by a letter) — excludes dollar amounts like "$675".
_CASHTAG_RE = re.compile(r"\$[A-Za-z][A-Za-z.\-]*")
_MENTION_RE = re.compile(r"@\w+")
# Promotional / solicitation patterns: outsized "%+ gains" claims (3+ digit
# percentages, so a genuine "up 2%" is not caught), "free ... plays/calls", and
# channel solicitations. Kept tight to avoid flagging legitimate posts.
_PROMO_RE = re.compile(
    r"([1-9]\d{2,}[\d,]*\s*%"
    r"|\bfree\b[^.\n]*\b(plays?|calls?|picks?|signals?|alerts?)\b"
    r"|\blink in bio\b|\bdm me\b|\bjoin (?:my|the|us)\b|\bsign[\s-]?up\b"
    r"|t\.me/|discord\.gg|\btelegram\b)",
    re.IGNORECASE,
)


def _content_word_count(text: str) -> int:
    """Count real words after removing cashtags, @mentions and links — the tokens
    that actually express an opinion."""
    stripped = _CASHTAG_RE.sub(" ", text)
    stripped = _MENTION_RE.sub(" ", stripped)
    stripped = _URL_RE.sub(" ", stripped)
    return len(re.findall(r"[A-Za-z][A-Za-z'’\-]+", stripped))


def assess_social_quality(body: str) -> tuple[bool, str | None]:
    """Decide whether a social post is worth scoring. Returns (ok, reason); when
    ``ok`` is False the caller drops the post. Evaluated on the raw body."""
    if _PROMO_RE.search(body):
        return False, "promotional/solicitation content"
    if len(_CASHTAG_RE.findall(body)) > MAX_CASHTAGS:
        return False, "too many cashtags (list/watchlist spam)"
    if _content_word_count(body) < MIN_CONTENT_WORDS:
        return False, "insufficient content"
    return True, None


# ---------------------------------------------------------------------------
# StockTwits (current/interim sentiment source)
# ---------------------------------------------------------------------------


class StockTwitsMessage(BaseModel):
    """A validated StockTwits message ready for sentiment scoring.

    Built from the raw StockTwits API message via ``from_raw``, which flattens
    the nested ``user``/``likes``/``retweets``/``symbols`` structures.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    id: int
    # Raw original body — retained for the empty-text anomaly check and the
    # ticker-symbol match filter at ingestion.
    body: str = ""
    # Cleaned, professional version of ``body`` (no emoji, no profanity, no
    # links). This is what flows downstream for both scoring and display.
    display_body: str = ""
    username: str | None = None
    created_at: datetime | None = None
    # Engagement counts, surfaced individually in the UI. ``reshares`` is
    # StockTwits' equivalent of a retweet; ``replies`` is the comment count.
    likes: int = 0
    reshares: int = 0
    replies: int = 0
    symbols: list[str] = Field(default_factory=list)
    url: str | None = None
    # Author's own Bullish/Bearish tag on the post (StockTwits
    # ``entities.sentiment.basic``). Preferred over VADER when present — a
    # user-declared label reads slang, sarcasm and emoji better than a lexicon.
    declared_sentiment: str | None = None

    # Quality gate: whether the post carries a usable, ticker-specific opinion.
    # Low-quality posts (bare cashtags, watchlist lists, promos) are dropped by
    # the collector instead of scoring noise. See ``assess_social_quality``.
    passes_quality: bool = True
    quality_reason: str | None = None

    is_anomalous: bool = False
    anomaly_reasons: list[str] = Field(default_factory=list)

    @classmethod
    def from_raw(cls, msg: dict[str, Any]) -> "StockTwitsMessage":
        """Flatten a raw StockTwits API message into the validation schema."""
        symbols = [
            str(s.get("symbol", "")).upper()
            for s in (msg.get("symbols") or [])
            if s.get("symbol")
        ]
        body = msg.get("body") or ""
        likes = msg.get("likes") or {}
        # StockTwits calls retweets "reshares"; older code read a non-existent
        # "retweets.total" (always 0). Read the real field, with fallbacks.
        reshares = msg.get("reshares") or {}
        # Reply/comment count lives on the conversation object when present.
        conversation = msg.get("conversation") or {}
        # Author-declared sentiment lives under entities.sentiment.basic.
        sentiment_entity = (msg.get("entities") or {}).get("sentiment") or {}
        declared = sentiment_entity.get("basic") if isinstance(sentiment_entity, dict) else None
        return cls(
            id=msg.get("id"),
            body=body,
            display_body=clean_social_text(body),
            username=(msg.get("user") or {}).get("username"),
            created_at=msg.get("created_at"),
            likes=likes.get("total", 0) or 0,
            reshares=reshares.get("reshared_count", reshares.get("total", 0)) or 0,
            replies=conversation.get("replies", conversation.get("replies_count", 0)) or 0,
            symbols=symbols,
            url=msg.get("url"),
            declared_sentiment=declared if declared in ("Bullish", "Bearish") else None,
        )

    @model_validator(mode="after")
    def _assess_quality(self) -> "StockTwitsMessage":
        self.passes_quality, self.quality_reason = assess_social_quality(self.body)
        return self

    @model_validator(mode="after")
    def _flag_anomalies(self) -> "StockTwitsMessage":
        reasons: list[str] = []

        if not self.body.strip():
            reasons.append("message has no usable text")
        if self.created_at is not None:
            created = self.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created > datetime.now(timezone.utc):
                reasons.append("created_at is in the future")
        if len(self.body) > MAX_BODY_LEN:
            reasons.append("body exceeds maximum length")
        if self.likes < 0 or self.reshares < 0 or self.replies < 0:
            reasons.append("negative engagement count")

        self.is_anomalous = bool(reasons)
        self.anomaly_reasons = reasons
        return self


def parse_stocktwits_message(raw: dict[str, Any]) -> StockTwitsMessage | None:
    """Validate a raw StockTwits message. Returns a StockTwitsMessage (possibly
    flagged) or ``None`` if structurally invalid (rejected + logged)."""
    try:
        return StockTwitsMessage.from_raw(raw)
    except ValidationError as exc:
        logger.warning("Rejected malformed StockTwits message %s: %s", raw.get("id", "<no-id>"), exc.errors())
        return None


# ---------------------------------------------------------------------------
# Finnhub company news (trusted financial-source sentiment)
# ---------------------------------------------------------------------------


class FinnhubArticle(BaseModel):
    """A validated Finnhub company-news article ready for sentiment scoring.

    Built from the raw Finnhub ``company-news`` payload via ``from_raw``. The
    article text used downstream is ``headline`` + ``summary``; ``source`` is the
    publisher name (e.g. "Reuters", "CNBC") used to enforce the trusted-source
    whitelist before scoring.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    id: int
    headline: str = ""
    summary: str = ""
    source: str = ""
    related: str = ""
    category: str = ""
    url: str | None = None
    created_at: datetime | None = None

    is_anomalous: bool = False
    anomaly_reasons: list[str] = Field(default_factory=list)

    @classmethod
    def from_raw(cls, msg: dict[str, Any]) -> "FinnhubArticle":
        """Flatten a raw Finnhub company-news article into the validation schema."""
        return cls(
            id=msg.get("id"),
            headline=msg.get("headline") or "",
            summary=msg.get("summary") or "",
            source=msg.get("source") or "",
            related=(msg.get("related") or "").upper(),
            category=msg.get("category") or "",
            url=msg.get("url"),
            created_at=msg.get("datetime"),
        )

    @field_validator("created_at", mode="before")
    @classmethod
    def _coerce_timestamp(cls, value: Any) -> Any:
        # Finnhub gives ``datetime`` as epoch seconds (int). Non-positive values
        # are treated as missing rather than 1970-01-01.
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if value <= 0:
                return None
            return datetime.fromtimestamp(value, tz=timezone.utc)
        return value

    @model_validator(mode="after")
    def _flag_anomalies(self) -> "FinnhubArticle":
        reasons: list[str] = []

        if not (self.headline + " " + self.summary).strip():
            reasons.append("article has no usable text")
        if self.created_at is not None:
            created = self.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created > datetime.now(timezone.utc):
                reasons.append("datetime is in the future")
        if len(self.summary) > MAX_BODY_LEN:
            reasons.append("summary exceeds maximum length")

        self.is_anomalous = bool(reasons)
        self.anomaly_reasons = reasons
        return self


def parse_finnhub_article(raw: dict[str, Any]) -> FinnhubArticle | None:
    """Validate a raw Finnhub company-news article. Returns a FinnhubArticle
    (possibly flagged) or ``None`` if structurally invalid (rejected + logged)."""
    try:
        return FinnhubArticle.from_raw(raw)
    except ValidationError as exc:
        logger.warning("Rejected malformed Finnhub article %s: %s", raw.get("id", "<no-id>"), exc.errors())
        return None


# ---------------------------------------------------------------------------
# Marketaux news (tier-1-only supplemental news source)
# ---------------------------------------------------------------------------


class MarketauxArticle(BaseModel):
    """A validated Marketaux ``/v1/news/all`` article ready for sentiment scoring.

    Built from a raw item in the ``data`` array via ``from_raw``. The text used
    downstream is ``title`` + ``description``; ``source`` is the publisher
    (domain or name) used to enforce the tier-1 whitelist before scoring;
    ``symbols`` is the list of tickers Marketaux tagged on the article (from its
    ``entities`` array), used to fan a single batched response out per ticker.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    uuid: str = ""
    title: str = ""
    description: str = ""
    source: str = ""
    url: str | None = None
    created_at: datetime | None = None
    symbols: list[str] = Field(default_factory=list)

    is_anomalous: bool = False
    anomaly_reasons: list[str] = Field(default_factory=list)

    @classmethod
    def from_raw(cls, msg: dict[str, Any]) -> "MarketauxArticle":
        """Flatten a raw Marketaux news item into the validation schema."""
        symbols: list[str] = []
        for entity in msg.get("entities") or []:
            symbol = (entity.get("symbol") or "").upper().strip()
            if symbol and symbol not in symbols:
                symbols.append(symbol)
        return cls(
            uuid=msg.get("uuid") or "",
            title=msg.get("title") or "",
            # Prefer the fuller description; fall back to the snippet.
            description=msg.get("description") or msg.get("snippet") or "",
            source=msg.get("source") or "",
            url=msg.get("url"),
            created_at=msg.get("published_at"),
            symbols=symbols,
        )

    @model_validator(mode="after")
    def _flag_anomalies(self) -> "MarketauxArticle":
        reasons: list[str] = []

        if not (self.title + " " + self.description).strip():
            reasons.append("article has no usable text")
        if self.created_at is not None:
            created = self.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created > datetime.now(timezone.utc):
                reasons.append("published_at is in the future")
        if len(self.description) > MAX_BODY_LEN:
            reasons.append("description exceeds maximum length")

        self.is_anomalous = bool(reasons)
        self.anomaly_reasons = reasons
        return self


def parse_marketaux_article(raw: dict[str, Any]) -> MarketauxArticle | None:
    """Validate a raw Marketaux news item. Returns a MarketauxArticle (possibly
    flagged) or ``None`` if structurally invalid (rejected + logged)."""
    try:
        return MarketauxArticle.from_raw(raw)
    except ValidationError as exc:
        logger.warning("Rejected malformed Marketaux article %s: %s", raw.get("uuid", "<no-id>"), exc.errors())
        return None
