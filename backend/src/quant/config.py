"""One object holding every tunable setting for the Quant tab's read side.

Every field maps to the env var it is read from. Both features default OFF, so a
deployment that has not opted in behaves exactly as before: the endpoints answer
``available: false`` and the backend never fetches a price series or calls a model on the
asset page's behalf.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.utils.ss_config import _env_bool, _env_int


@dataclass(frozen=True)
class QuantViewConfig:
	"""Immutable settings shared by the history service and the trace service."""

	#: The historical price and RSI window behind the Quant tab's chart.
	history_enabled: bool = False
	#: How long a fetched window is served from memory before yfinance is asked again.
	#: A day's closes do not change once the session has ended, so this can be long; it
	#: is bounded only so an intraday reader eventually sees today's bar move.
	history_cache_minutes: int = 720
	#: The most points a window is served with. Facts are always computed on the full
	#: daily series; only the plotted series is thinned, so a five year chart is a few
	#: hundred points rather than twelve hundred.
	history_max_points: int = 260

	#: The written paragraph over the window. Needs the history on, since that is what
	#: it is written from.
	trace_enabled: bool = False
	trace_max_chars: int = 900
	trace_min_chars: int = 40

	@classmethod
	def from_env(cls) -> "QuantViewConfig":
		return cls(
			history_enabled=_env_bool("QUANT_HISTORY_ENABLED", False),
			history_cache_minutes=max(1, _env_int("QUANT_HISTORY_CACHE_MINUTES", 720)),
			history_max_points=max(30, _env_int("QUANT_HISTORY_MAX_POINTS", 260)),
			trace_enabled=_env_bool("QUANT_TRACE_ENABLED", False),
			trace_max_chars=max(120, _env_int("QUANT_TRACE_MAX_CHARS", 900)),
			trace_min_chars=max(1, _env_int("QUANT_TRACE_MIN_CHARS", 40)),
		)
