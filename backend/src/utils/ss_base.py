"""Sentiment scout: the root of the collector hierarchy.
"""

from __future__ import annotations

import threading
import time
from abc import ABC, abstractmethod

from .ss_config import SentimentConfig
from .ss_models import SocialMention
from .ss_sources import PublisherRegistry


class RateLimiter:
	"""Spaces calls out so a shared API budget is not burst through.

	Instances guarding a provider are deliberately process-wide (see
	``ss_news.FINNHUB_LIMITER``, ``ss_social.STOCKTWITS_LIMITER``): the nightly
	union gather and any live refresh top-ups must not be able to collectively
	exceed a plan's ceiling, which a per-caller limiter would allow.
	"""

	def __init__(self, min_interval: float):
		self.min_interval = min_interval
		self._lock = threading.Lock()
		self._last_call = 0.0

	def wait(self) -> None:
		with self._lock:
			delay = self.min_interval - (time.monotonic() - self._last_call)
			if delay > 0:
				time.sleep(delay)
			self._last_call = time.monotonic()


class MentionSource(ABC):
	"""A place sentiment can be collected from, for a list of tickers."""
	name: str = "source"

	def __init__(self, config: SentimentConfig | None = None, registry: PublisherRegistry | None = None):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()

	@abstractmethod
	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		"""Return the mentions found for each ticker, keyed by ticker.
		"""

	def empty(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		"""The no-results shape every collector falls back to."""
		return {ticker: [] for ticker in tickers}