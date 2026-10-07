"""One object holding every tunable setting for the Compare page's written comparison.

Off by default, so a deployment that has not opted in answers ``available: false`` and
never calls a model on the page's behalf. It also needs QUANT_HISTORY_ENABLED, because the
paragraph is written from the same price windows the Quant tab draws.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.utils.ss_config import _env_bool, _env_int


@dataclass(frozen=True)
class CompareConfig:
	"""Immutable settings for the comparison trace."""

	trace_enabled: bool = False
	#: The guard against an essay. The prompt asks for at most 120 words, roughly 750
	#: characters; the template for three stocks with RSI and beta runs to about 1,150.
	trace_max_chars: int = 1300
	trace_min_chars: int = 40
	#: Two to three columns. Four rows of numbers stop being readable side by side, and
	#: every extra stock is another window fetched before the paragraph can be written.
	min_tickers: int = 2
	max_tickers: int = 3

	@classmethod
	def from_env(cls) -> "CompareConfig":
		return cls(
			trace_enabled=_env_bool("COMPARE_TRACE_ENABLED", False),
			trace_max_chars=max(200, _env_int("COMPARE_TRACE_MAX_CHARS", 1300)),
			trace_min_chars=max(1, _env_int("COMPARE_TRACE_MIN_CHARS", 40)),
		)
