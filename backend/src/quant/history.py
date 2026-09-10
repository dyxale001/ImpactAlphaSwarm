"""Historical price windows for the Quant tab: 1M, 6M, 3Y and 5Y.

The nightly run downloads a year of closes per ticker, measures it and keeps only the
measurements. Nothing OHLCV is stored anywhere, so the asset page cannot draw a price line
from the database. It does not need to. Every figure here is a deterministic function of
public closes, so a five year RSI series is reproducible on demand from yfinance today,
where a table written by the nightly would hold one week of rows at the time this ships.

What comes back for a window is two things, deliberately separated:

  * ``points``  the plotted series, one close and one RSI reading per trading day, thinned
                to a few hundred points for the longer horizons;
  * ``facts``   the numbers a reader (or the trace that describes the window) can rely on,
                always computed on the full daily series before any thinning: the change
                over the window, its high and low, the worst peak to trough fall, how many
                days RSI spent past 70 or under 30.

The cross-sectional percentiles the Quant panel shows are NOT here. They are relative to
the other assets in one user's run and belong to ``ai_recommendation``; a window is the
same for every reader, which is what lets one fetch be cached and shared.

Off by default (``QUANT_HISTORY_ENABLED``). Off means no yfinance call on the asset page's
behalf, exactly as before.
"""

from __future__ import annotations

import datetime
import logging
import math
import threading
import time
from typing import Any

from src.agents.quant_analyst import RSI, MarketDataSource, _ensure_series

from .config import QuantViewConfig

logger = logging.getLogger("quant-view")


#: The horizons the panel offered on 2026-08-11 and D-125 locked, in calendar days.
#: A month is a month of dates, not twenty trading days, because the axis is dated and
#: a reader asking for "one month" means the calendar.
HORIZONS: dict[str, int] = {"1M": 31, "6M": 183, "3Y": 1096, "5Y": 1827}

#: Calendar days fetched BEFORE the window starts so the indicators are settled by its
#: first plotted point. RSI(14) and the MACD EMAs are recursive; started cold at the
#: window's edge their first weeks would be warm-up noise drawn as though it were a
#: reading. Three hundred calendar days is roughly two hundred trading days, far past
#: where either has converged.
WARMUP_DAYS = 300

#: Fewer trading days than this and a window is reported as thin rather than plotted.
#: One or two closes make a dot, not a line, and a chart that draws them invites a
#: reader to see a trend in nothing.
MIN_POINTS = 5

#: RSI conventions. The same thresholds RsiBand uses for the run's own reading, so a
#: day the chart shades and a band the panel names never disagree.
RSI_OVERBOUGHT = 70.0
RSI_OVERSOLD = 30.0

#: yfinance exchange codes as a reader would say them. The code is what fast_info
#: returns; the chart says "Listed on Nasdaq", not "Listed on NMS". Unknown codes fall
#: through as themselves rather than being guessed at.
EXCHANGE_NAMES: dict[str, str] = {
	"NMS": "Nasdaq",
	"NGM": "Nasdaq",
	"NCM": "Nasdaq",
	"NAS": "Nasdaq",
	"NYQ": "NYSE",
	"NYSE": "NYSE",
	"ASE": "NYSE American",
	"PCX": "NYSE Arca",
	"BTS": "Cboe BZX",
	"JNB": "JSE",
}


def utc_today() -> datetime.date:
	return datetime.datetime.now(datetime.timezone.utc).date()


def exchange_name(code: str | None) -> str:
	"""The exchange as a reader would name it, or the code itself when it is not known."""
	if not code:
		return ""
	return EXCHANGE_NAMES.get(str(code).upper(), str(code))


class TTLCache:
	"""A small, bounded, thread-safe map of windows already fetched today.

	Keyed by the caller, valued by whatever they store, expiring after ``ttl_seconds``.
	Bounded because the key space is every ticker times four horizons and a process that
	lives for weeks would otherwise hold every window anyone ever opened. Eviction is
	oldest first, which is good enough for a cache whose entries all live the same length.
	"""

	def __init__(self, ttl_seconds: float, max_entries: int = 512, clock=None):
		self.ttl_seconds = float(ttl_seconds)
		self.max_entries = max(1, int(max_entries))
		self._clock = clock or time.monotonic
		self._entries: dict[Any, tuple[float, Any]] = {}
		self._lock = threading.Lock()

	def get(self, key: Any) -> Any | None:
		with self._lock:
			hit = self._entries.get(key)
			if hit is None:
				return None
			expires_at, value = hit
			if self._clock() >= expires_at:
				del self._entries[key]
				return None
			return value

	def put(self, key: Any, value: Any) -> None:
		with self._lock:
			if key not in self._entries and len(self._entries) >= self.max_entries:
				oldest = min(self._entries, key=lambda k: self._entries[k][0])
				del self._entries[oldest]
			self._entries[key] = (self._clock() + self.ttl_seconds, value)

	def __len__(self) -> int:
		with self._lock:
			return len(self._entries)


def _round(value: float | None, digits: int) -> float | None:
	if value is None:
		return None
	try:
		if math.isnan(value) or math.isinf(value):
			return None
	except TypeError:
		return None
	return round(float(value), digits)


class WindowFacts:
	"""The numbers a window supports, computed on the FULL daily series. Pure, no I/O.

	Every figure is a plain description of closes that already happened. There is no
	score, no verdict and no forecast in here, which is the whole reason the trace can be
	allowed to quote them: a paragraph that can only repeat these cannot recommend
	anything.
	"""

	@staticmethod
	def compute(dates: list[str], closes: list[float], rsi: list[float | None]) -> dict[str, Any] | None:
		if len(closes) < 2:
			return None

		first, last = closes[0], closes[-1]
		change_pct = ((last / first) - 1.0) * 100.0 if first else None

		high_i = max(range(len(closes)), key=lambda i: closes[i])
		low_i = min(range(len(closes)), key=lambda i: closes[i])

		# The worst fall from any peak to a later trough, as a percentage of that peak.
		# Walked once, forwards: the running peak is the highest close seen so far, and
		# the drawdown at each day is how far below it that day sits.
		peak = closes[0]
		worst = 0.0
		for close in closes:
			if close > peak:
				peak = close
			if peak > 0:
				fall = (close / peak - 1.0) * 100.0
				if fall < worst:
					worst = fall

		# Annualised volatility of THIS window's daily returns. Distinct from the 1y
		# figure the run persists, and labelled as the window's own so the two are not
		# read as one number that disagrees with itself.
		returns = [
			(closes[i] / closes[i - 1]) - 1.0
			for i in range(1, len(closes))
			if closes[i - 1]
		]
		volatility_pct = None
		if len(returns) >= 2:
			mean = sum(returns) / len(returns)
			variance = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
			volatility_pct = math.sqrt(variance) * math.sqrt(252) * 100.0

		readings = [r for r in rsi if r is not None]
		latest_rsi = next((r for r in reversed(rsi) if r is not None), None)

		return {
			"start": dates[0],
			"end": dates[-1],
			"trading_days": len(closes),
			"first_close": _round(first, 4),
			"last_close": _round(last, 4),
			"change_pct": _round(change_pct, 1),
			"high": _round(closes[high_i], 4),
			"high_date": dates[high_i],
			"low": _round(closes[low_i], 4),
			"low_date": dates[low_i],
			"max_drawdown_pct": _round(worst, 1),
			"volatility_pct": _round(volatility_pct, 1),
			"latest_rsi": _round(latest_rsi, 0),
			"rsi_days_measured": len(readings),
			"days_rsi_overbought": sum(1 for r in readings if r > RSI_OVERBOUGHT),
			"days_rsi_oversold": sum(1 for r in readings if r < RSI_OVERSOLD),
		}


class QuantHistoryService:
	"""Serves one ticker's window for one horizon, fetching it the first time it is asked for."""

	def __init__(
		self,
		config: QuantViewConfig | None = None,
		data_source: MarketDataSource | None = None,
		rsi: RSI | None = None,
		cache: TTLCache | None = None,
		today: Any = None,
	):
		self.config = config or QuantViewConfig.from_env()
		self.data_source = data_source or MarketDataSource()
		self.rsi = rsi or RSI()
		self.cache = cache if cache is not None else TTLCache(self.config.history_cache_minutes * 60)
		self._today = today or utc_today

	@property
	def enabled(self) -> bool:
		return self.config.history_enabled

	@staticmethod
	def horizon_days(horizon: str) -> int:
		"""Calendar days in a horizon, or a ValueError naming the ones that exist."""
		try:
			return HORIZONS[horizon.upper()]
		except (KeyError, AttributeError):
			raise ValueError(f"horizon must be one of {', '.join(HORIZONS)}") from None

	def window(self, ticker: str, horizon: str) -> dict[str, Any]:
		"""The window as the endpoint serves it. Raises only for an unknown horizon.

		A fetch that fails, or a ticker yfinance has nothing for, comes back with empty
		``points`` and null ``facts`` rather than raising: to the chart those are one
		state, "nothing to plot", and neither is the reader's fault.
		"""
		symbol = ticker.upper()
		key_horizon = horizon.upper()
		days = self.horizon_days(key_horizon)

		today = self._today()
		cache_key = (symbol, key_horizon, today.isoformat())
		cached = self.cache.get(cache_key)
		if cached is not None:
			return cached

		payload = self._build(symbol, key_horizon, days, today)
		# Only a window with something in it is worth remembering. Caching an empty
		# answer would pin a transient yfinance failure to the ticker for the rest of
		# the day.
		if payload["points"]:
			self.cache.put(cache_key, payload)
		return payload

	# ── the build ────────────────────────────────────────────────────────────

	def _build(self, symbol: str, horizon: str, days: int, today: datetime.date) -> dict[str, Any]:
		empty = self._empty(symbol, horizon)
		window_start = today - datetime.timedelta(days=days)
		fetch_start = window_start - datetime.timedelta(days=WARMUP_DAYS)
		# yfinance's end is exclusive, so tomorrow includes today's bar once it exists.
		fetch_end = today + datetime.timedelta(days=1)

		try:
			frame = self.data_source.history_between(symbol, fetch_start, fetch_end)
		except Exception as exc:
			logger.warning("Quant history fetch failed for %s %s: %s", symbol, horizon, exc)
			return empty
		if frame is None or len(frame) == 0 or "Close" not in frame:
			return empty

		close = _ensure_series(frame["Close"])
		if close is None:
			return empty
		close = close.dropna()
		if len(close) < 2:
			return empty

		# RSI over the WHOLE fetched series, warm-up included, then trimmed with the
		# closes. Computing it on the trimmed series alone is the cold start the warm-up
		# exists to avoid.
		rsi_series = self.rsi.series(close)

		dates_all = [self._date_key(idx) for idx in close.index]
		start_key = window_start.isoformat()
		keep = [i for i, d in enumerate(dates_all) if d >= start_key]
		if len(keep) < MIN_POINTS:
			return empty

		dates = [dates_all[i] for i in keep]
		closes = [float(close.iloc[i]) for i in keep]
		rsi_values: list[float | None] = []
		for i in keep:
			value = None
			if rsi_series is not None:
				raw = rsi_series.iloc[i]
				value = None if raw is None or (isinstance(raw, float) and math.isnan(raw)) else float(raw)
			rsi_values.append(value)

		facts = WindowFacts.compute(dates, closes, rsi_values)
		points = [
			{"date": d, "close": _round(c, 4), "rsi": _round(r, 1)}
			for d, c, r in zip(dates, closes, rsi_values)
		]
		points = self._thin(points, self.config.history_max_points)

		profile = self._profile(symbol)
		return {
			"ticker": symbol,
			"horizon": horizon,
			"currency": profile.get("currency", ""),
			"exchange": profile.get("exchange", ""),
			"exchange_name": exchange_name(profile.get("exchange")),
			"points": points,
			"facts": facts,
		}

	def _profile(self, symbol: str) -> dict[str, str]:
		try:
			return self.data_source.profile(symbol)
		except Exception as exc:
			logger.info("Quant history profile lookup failed for %s: %s", symbol, exc)
			return {"currency": "", "exchange": ""}

	@staticmethod
	def _empty(symbol: str, horizon: str) -> dict[str, Any]:
		return {
			"ticker": symbol,
			"horizon": horizon,
			"currency": "",
			"exchange": "",
			"exchange_name": "",
			"points": [],
			"facts": None,
		}

	@staticmethod
	def _date_key(index_value: Any) -> str:
		"""A pandas timestamp as the YYYY-MM-DD key the frontend buckets by."""
		try:
			return index_value.date().isoformat()
		except AttributeError:
			return str(index_value)[:10]

	@staticmethod
	def _thin(points: list[dict[str, Any]], max_points: int) -> list[dict[str, Any]]:
		"""Every Nth point, always keeping the last one.

		The last close is the one the reader compares the whole line to, and a stride
		that happened to skip it would draw a line ending a week before "today".
		"""
		if len(points) <= max_points:
			return points
		stride = math.ceil(len(points) / max_points)
		thinned = points[::stride]
		if thinned[-1] is not points[-1]:
			thinned.append(points[-1])
		return thinned
