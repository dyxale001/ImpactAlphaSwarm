"""One object holding every tunable setting for the Compare page's written comparison.

Off by default, so a deployment that has not opted in answers ``available: false`` and
never calls a model on the reader's behalf. It also needs QUANT_HISTORY_ENABLED, because the
paragraph is written from the same price windows the Quant tab draws.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.utils.ss_config import _env_bool, _env_int


@dataclass(frozen=True)
class CompareConfig:
	"""Immutable settings for the comparison trace."""

	trace_enabled: bool = False
	#: The guard against an essay, applied to the model only. The prompt asks for at most
	#: 150 words when it explains the reader's run; the model writes about 1,000 to 1,100
	#: characters and runs over a little with three stocks. The template is not held to
	#: it: it says every reading in full and runs to about 1,700 for three.
	trace_max_chars: int = 1500
	trace_min_chars: int = 40
	#: Model calls one reader may cause in a day before the template stands in. Each
	#: paragraph is stored until its data moves on, so a reader reaches this only by
	#: working through many different sets and horizons.
	trace_daily_limit: int = 25
	#: Two to three columns. Four rows of numbers stop being readable side by side, and
	#: every extra stock is another window fetched before the paragraph can be written.
	min_tickers: int = 2
	max_tickers: int = 3

	@classmethod
	def from_env(cls) -> "CompareConfig":
		return cls(
			trace_enabled=_env_bool("COMPARE_TRACE_ENABLED", False),
			trace_max_chars=max(200, _env_int("COMPARE_TRACE_MAX_CHARS", 1500)),
			trace_min_chars=max(1, _env_int("COMPARE_TRACE_MIN_CHARS", 40)),
			trace_daily_limit=max(0, _env_int("COMPARE_TRACE_DAILY_LIMIT", 25)),
		)
