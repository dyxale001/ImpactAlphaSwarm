"""Sentiment scout: the root of the collector hierarchy.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from .ss_config import SentimentConfig
from .ss_models import SocialMention
from .ss_sources import PublisherRegistry


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