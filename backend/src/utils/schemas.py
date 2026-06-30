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
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

logger = logging.getLogger("alpha-schemas")

# Generous upper bound on body/summary text; anything beyond is suspicious.
MAX_BODY_LEN = 40_000


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
    body: str = ""
    username: str | None = None
    created_at: datetime | None = None
    likes: int = 0
    retweets: int = 0
    symbols: list[str] = Field(default_factory=list)
    url: str | None = None

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
        return cls(
            id=msg.get("id"),
            body=msg.get("body") or "",
            username=(msg.get("user") or {}).get("username"),
            created_at=msg.get("created_at"),
            likes=(msg.get("likes") or {}).get("total", 0) or 0,
            retweets=(msg.get("retweets") or {}).get("total", 0) or 0,
            symbols=symbols,
            url=msg.get("url"),
        )

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
        if self.likes < 0 or self.retweets < 0:
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
