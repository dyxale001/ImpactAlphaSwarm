"""Jev, through OpenRouter's Decisions API.

One request per article carries all eight questions; the answer to each is a single
probability of "yes". Request and response, as verified on 04/10:

    POST https://openrouter.ai/api/alpha/decisions
    {"model": "typesafe/jev-1.13", "state": "<text>",
     "questions": {"<id>": {"type": "noul", "instructions": "<question>"}}}
    -> {"model": "typesafe/jev-1.13-20260917",
        "answers": {"<id>": {"type": "noul", "noul": 0.98}}, "usage": {"cost": ...}}

A failed call returns None rather than raising. The article is still stored, unscored,
and the next pull tries it again, so an outage delays tags instead of losing stories.
"""

from __future__ import annotations

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional, Sequence

import requests

from ..agents.asset_discovery import UNIVERSES
from .config import (
    JEV_API_KEY_ENV,
    JEV_CONCURRENCY,
    JEV_DECISIONS_URL,
    JEV_MODEL,
    JEV_TIMEOUT_SECONDS,
)
from .tagger import Scores
from .universes import GATE_ID, MARKET_WIDE_ID, build_questions, question_id

logger = logging.getLogger(__name__)


def parse_answers(payload: Any) -> Optional[Scores]:
    """Scores from a response body, or None if any expected answer is missing."""
    try:
        answers = payload["answers"]

        def p(qid: str) -> float:
            value = float(answers[qid]["noul"])
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{qid} out of range: {value}")
            return value

        return Scores(
            gate=p(GATE_ID),
            market_wide=p(MARKET_WIDE_ID),
            universes={u: p(question_id(u)) for u in UNIVERSES},
        )
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Jev answer unreadable: %s", exc)
        return None


class JevClient:
    def __init__(self, session: Optional[requests.Session] = None, attempts: int = 2):
        self.session = session or requests.Session()
        self.attempts = attempts
        self.questions = build_questions()
        self.model_used: Optional[str] = None
        self.cost = 0.0
        self._lock = threading.Lock()

    @staticmethod
    def _api_key() -> str:
        return os.getenv(JEV_API_KEY_ENV, "").strip()

    def available(self) -> bool:
        return bool(self._api_key())

    def score(self, state: str) -> Optional[Scores]:
        key = self._api_key()
        if not key:
            return None
        body = {"model": JEV_MODEL, "state": state, "questions": self.questions}
        for attempt in range(1, self.attempts + 1):
            try:
                resp = self.session.post(
                    JEV_DECISIONS_URL,
                    json=body,
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    timeout=JEV_TIMEOUT_SECONDS,
                )
            except requests.RequestException as exc:
                logger.info("Jev request failed (attempt %d): %s", attempt, exc)
                continue
            if resp.status_code == 402:
                # Out of credit. Retrying will not help, and every other article in the
                # pull will hit the same wall, so say so plainly once per article.
                logger.warning("Jev refused: insufficient credit (HTTP 402)")
                return None
            if resp.status_code != 200:
                logger.info("Jev returned HTTP %s (attempt %d)", resp.status_code, attempt)
                continue
            try:
                payload = resp.json()
            except ValueError:
                continue
            scores = parse_answers(payload)
            if scores is not None:
                usage = payload.get("usage") or {}
                with self._lock:
                    self.model_used = payload.get("model") or JEV_MODEL
                    self.cost += float(usage.get("cost") or 0.0)
                return scores
        return None

    def score_many(self, states: Sequence[str]) -> list[Optional[Scores]]:
        """Scores in the same order as ``states``."""
        if not states:
            return []
        if not self.available():
            logger.warning("Macro news: %s is not set; articles stored unscored", JEV_API_KEY_ENV)
            return [None] * len(states)
        with ThreadPoolExecutor(max_workers=max(1, JEV_CONCURRENCY)) as pool:
            return list(pool.map(self.score, states))
