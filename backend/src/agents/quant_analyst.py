"""Quant Analyst Worker Module

Purpose: Fetch market data via yfinance and compute technical indicators
(RSI, MACD, Sharpe, Beta, Volatility) as OBJECTIVE per-ticker facts, then
normalise them cross-sectionally across the day's candidate universe into
descriptive sub-dimensions (momentum / risk-adjusted return / stability) plus
context bands.

Two stages (see the quant scoring & ranking design proposal, 2026-07-03):
  Stage A  compute_raw_metrics(ticker, ohlcv, spy_close) -> per-ticker facts, no score.
  Stage B  score_universe(dict[ticker, raw])            -> cross-sectional percentiles.

The legacy single composite `raw_quant_score` (the threshold point-jump scorer) is
RETAINED as a back-compat shim so the orchestrator's existing `unified_score`
keeps working unchanged; the ranking rewrite that removes it is a separate seam.

This module is integrated into the LangGraph orchestrator's Phase 2A.

## Structure

Every indicator is an `Indicator`: one class, one measurement, one `_compute`.

	Indicator (ABC)              coerce → length guard → measure → survive failure
	├── RSI                      measured on the price series
	├── MACD
	├── Beta                     prices aligned against a benchmark series
	├── TrailingReturn
	└── ReturnsIndicator (ABC)   measured on DAILY RETURNS, not prices
	    ├── SharpeRatio
	    └── Volatility

`Indicator.compute` is the template: coerce the input to a 1-D Series, refuse
anything shorter than the measurement needs, run the maths, and turn any
exception into that indicator's documented failure value. Subclasses state only
the maths. That wrapper used to be copy-pasted around all six measurements —
`calculate_rsi` guarding and try/excepting before delegating to `_calculate_rsi`,
and so on — so the six pairs are now six classes.

`ReturnsIndicator` exists because Sharpe and volatility are not measured on
prices at all: both convert to daily returns first and both need at least two
returns before a spread means anything. Beta also uses returns but derives them
from a *pair* of aligned series, so it stays a direct `Indicator` — the split
tracks how the measurement actually works, not how the numbers are used.

Why this matters beyond tidiness: hand-writing these indicators was justified
(D-057) on the grounds that they would be easier to explain and unit test than a
library's. One class per measurement, with the error handling lifted out of the
maths, is what makes that claim true.

`QuantAnalyst` is the facade over the whole two-stage pipeline, and every
collaborator is injectable with the production default — `QuantAnalyst()` is what
the nightly run uses; a test can pass a fake `MarketDataSource` and never touch
the network.

The module-level functions at the bottom are kept as thin delegations. They are
this module's published surface — `agents/__init__` and the orchestrator import
`analyze_tickers`, and the unit suite calls the rest by name — so they keep
working unchanged.

Configuration is resolved at CALL time, not construction time, so a late change
to `QUANT_WINDOW` or `QUANT_MIN_UNIVERSE` behaves exactly as it did when these
were free functions.
"""

import os
import warnings
from abc import ABC, abstractmethod
from typing import Dict, Any

import numpy as np
import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")  # Suppress yfinance warnings

# Analysis window — extended from 30d to ~1y for more stable Sharpe/beta (D-080).
# Env-configurable so it can be tuned without a code change.
QUANT_WINDOW = os.getenv("QUANT_WINDOW", "1y")

# Below this many successfully-measured candidates, cross-sectional percentiles are
# statistically weak, so Stage B degrades to exposing facts + bands only (no
# sub-dimensions) rather than inventing ranks. The fixed-reference-band fallback is
# an open design question, deliberately NOT implemented here.
QUANT_MIN_UNIVERSE = int(os.getenv("QUANT_MIN_UNIVERSE", "10"))


def _ensure_series(data) -> pd.Series | None:
	"""
	Helper: Ensure input is a 1-D pandas Series.
	Returns None if data is invalid or multi-dimensional.
	"""
	if data is None:
		return None
	if isinstance(data, pd.Series):
		return data
	if isinstance(data, pd.DataFrame):
		if data.shape[1] == 1:
			return data.iloc[:, 0]
		return None
	return None


# ---------------------------------------------------------------------------
# Indicators
# ---------------------------------------------------------------------------

class Indicator(ABC):
	"""One technical measurement taken from a price series.

	``compute`` is the template every indicator shares: coerce whatever the caller
	passed into a 1-D Series, refuse a series too short to measure, run the maths,
	and convert any exception into this indicator's documented failure value. A
	subclass supplies only ``_compute``.

	The failure value is per-indicator on purpose. Most report ``None`` for "could
	not measure", but beta reports ``1.0`` — the market-neutral assumption — because
	downstream code treats beta as always present.
	"""

	label: str = "Indicator"
	failure_value: Any = None

	@property
	def min_points(self) -> int:
		"""Shortest series this measurement accepts. 0 means "any non-null series"."""
		return 0

	def compute(self, close_prices) -> Any:
		try:
			series = _ensure_series(close_prices)
			if series is None or len(series) < self.min_points:
				return self.failure_value
			return self._compute(series)
		except Exception as e:
			print(f"     {self.label} calculation failed: {e}")
			return self.failure_value

	@abstractmethod
	def _compute(self, close_prices: pd.Series) -> Any:
		"""The measurement itself, on a series already known to be usable."""


class ReturnsIndicator(Indicator, ABC):
	"""An indicator measured on DAILY RETURNS rather than on prices.

	Two prices make one return, and one return says nothing about spread, so both
	guards belong here rather than in each subclass.
	"""

	@property
	def min_points(self) -> int:
		return 2  # two prices → one return

	def _compute(self, close_prices: pd.Series) -> Any:
		daily_returns = close_prices.pct_change().dropna()
		if len(daily_returns) < 2:
			return self.failure_value
		return self._from_returns(daily_returns)

	@abstractmethod
	def _from_returns(self, daily_returns: pd.Series) -> Any:
		"""The measurement, on the daily-return series."""


class RSI(Indicator):
	"""Relative Strength Index, pure-pandas, using Wilder's smoothing (EMA).

	RSI = 100 - (100 / (1 + RS))
	RS = EMA(gains) / EMA(losses)
	"""

	label = "RSI"

	def __init__(self, period: int = 14):
		self.period = period

	@property
	def min_points(self) -> int:
		return self.period + 1

	def _compute(self, close_prices: pd.Series) -> float | None:
		period = self.period
		delta = close_prices.diff()
		gains = delta.clip(lower=0)
		losses = -delta.clip(upper=0)

		avg_gain = gains.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
		avg_loss = losses.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()

		rs = avg_gain / avg_loss
		rsi = 100 - (100 / (1 + rs))

		last_rsi = rsi.iloc[-1]
		return float(last_rsi) if pd.notna(last_rsi) else None


class MACD(Indicator):
	"""Moving Average Convergence Divergence, pure-pandas.

	MACD = EMA(12) - EMA(26); Signal = EMA(9) of MACD.
	"""

	label = "MACD"

	def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9):
		self.fast = fast
		self.slow = slow
		self.signal = signal

	@property
	def min_points(self) -> int:
		return self.slow

	def _compute(self, close_prices: pd.Series) -> Dict[str, Any] | None:
		ema_fast = close_prices.ewm(span=self.fast, adjust=False).mean()
		ema_slow = close_prices.ewm(span=self.slow, adjust=False).mean()
		macd_line = ema_fast - ema_slow
		signal_line = macd_line.ewm(span=self.signal, adjust=False).mean()
		histogram = macd_line - signal_line

		macd_val = float(macd_line.iloc[-1]) if pd.notna(macd_line.iloc[-1]) else 0.0
		signal_val = float(signal_line.iloc[-1]) if pd.notna(signal_line.iloc[-1]) else 0.0
		hist_val = float(histogram.iloc[-1]) if pd.notna(histogram.iloc[-1]) else 0.0

		signal = "bullish_crossover" if hist_val > 0 else "bearish_crossover"

		return {
			"macd_line": macd_val,
			"signal_line": signal_val,
			"histogram": hist_val,
			"signal": signal,
		}


class SharpeRatio(ReturnsIndicator):
	"""Annualised excess return per unit of volatility."""

	label = "Sharpe Ratio"

	def __init__(self, risk_free_rate: float = 0.02):
		self.risk_free_rate = risk_free_rate

	def _from_returns(self, daily_returns: pd.Series) -> float | None:
		mean_return = float(daily_returns.mean())
		std_return = float(daily_returns.std())

		annual_return = mean_return * 252
		annual_std = std_return * np.sqrt(252)

		if annual_std == 0 or not pd.notna(annual_std):
			return 0.0

		sharpe = (annual_return - self.risk_free_rate) / annual_std
		return float(sharpe) if pd.notna(sharpe) else None


class Volatility(ReturnsIndicator):
	"""Annualised standard deviation of daily returns."""

	label = "Volatility"

	def _from_returns(self, daily_returns: pd.Series) -> float | None:
		volatility = float(daily_returns.std()) * np.sqrt(252)
		return volatility if pd.notna(volatility) else None


class Beta(Indicator):
	"""Market sensitivity against a benchmark, typically the S&P 500.

	Takes the shared benchmark close series so a universe run downloads SPY once
	rather than once per ticker; only when it is absent does this fall back to a
	lone download (kept for single-ticker / back-compat callers).

	Unmeasurable beta reports ``1.0`` — market-neutral — not ``None``, because
	every downstream reader assumes the field is populated.
	"""

	label = "Beta"
	failure_value = 1.0

	def __init__(self, market_prices=None, data_source: "MarketDataSource | None" = None):
		self.market_prices = market_prices
		self.data_source = data_source

	def _compute(self, close_prices: pd.Series) -> float:
		market_prices = self.market_prices
		if market_prices is None:
			source = self.data_source or MarketDataSource()
			market_prices = source.benchmark_close()
			if market_prices is None:
				return 1.0

		market_prices = _ensure_series(market_prices)
		if market_prices is None:
			return 1.0

		data_aligned = pd.concat([close_prices, market_prices], axis=1).dropna()

		if len(data_aligned) < 2:
			return 1.0

		asset_returns = data_aligned.iloc[:, 0].pct_change().dropna()
		market_returns = data_aligned.iloc[:, 1].pct_change().dropna()

		covariance = float(asset_returns.cov(market_returns))
		market_variance = float(market_returns.var())

		if market_variance == 0 or not pd.notna(market_variance):
			return 1.0

		beta = covariance / market_variance
		return float(beta) if pd.notna(beta) else 1.0


class TrailingReturn(Indicator):
	"""Total return over the fetched window (last / first - 1). A plain fact, not
	a forecast."""

	label = "Trailing return"

	def _compute(self, close_prices: pd.Series) -> float | None:
		close_prices = close_prices.dropna()
		if len(close_prices) < 2:
			return None
		first = float(close_prices.iloc[0])
		last = float(close_prices.iloc[-1])
		if first == 0 or not pd.notna(first) or not pd.notna(last):
			return None
		return (last / first) - 1.0


# ---------------------------------------------------------------------------
# Market data
# ---------------------------------------------------------------------------

class MarketDataSource:
	"""Where price history comes from.

	The only part of this module that touches the network, which is what lets a
	test drive the whole pipeline off fixtures by passing a different source.
	"""

	def __init__(self, window: str | None = None):
		self._window = window

	@property
	def window(self) -> str:
		return QUANT_WINDOW if self._window is None else self._window

	def history(self, ticker: str, period: str | None = None) -> pd.DataFrame | None:
		"""Fetch OHLCV data for a ticker, or None if the fetch fails."""
		period = period or self.window
		try:
			print(f"  Fetching {period} data for {ticker}...")
			data = yf.download(ticker, period=period, progress=False, threads=False)

			if data is None or len(data) == 0:
				print(f"     No data returned for {ticker}")
				return None

			return data
		except Exception as e:
			print(f"     Error fetching {ticker}: {str(e)}")
			return None

	def benchmark_close(self, period: str | None = None) -> pd.Series | None:
		"""Fetch the SPY close series ONCE for the universe (shared across all beta
		calcs) so we don't re-download the market benchmark per ticker."""
		period = period or self.window
		try:
			spy_data = yf.download("SPY", period=period, progress=False, threads=False)
			if spy_data is None or len(spy_data) == 0:
				return None
			return _ensure_series(spy_data["Close"])
		except Exception as e:
			print(f"     Error fetching SPY benchmark: {e}")
			return None


# ---------------------------------------------------------------------------
# Context bands — DEFINITIONAL (true by convention, like "28C is above room
# temperature"), NOT predictive. RSI and beta are non-monotonic, so they are
# shown as bands only and never folded into a "higher = better" number.
# ---------------------------------------------------------------------------

class Band(ABC):
	"""A definitional label for a measurement — a restatement, never a verdict."""

	name: str = "band"

	@abstractmethod
	def of(self, value: float | None) -> str | None:
		"""The label for this value, or None when there is nothing to label."""


class RsiBand(Band):
	name = "rsi"

	def of(self, value: float | None) -> str | None:
		if value is None:
			return None
		if value < 30:
			return "oversold"
		if value <= 70:
			return "neutral"
		return "overbought"


class BetaBand(Band):
	name = "beta"

	def of(self, value: float | None) -> str | None:
		if value is None:
			return None
		# A negative beta is not "low market sensitivity" — it means the asset moved
		# INVERSELY to the market over the window. Folding it into "low" stated
		# something factually untrue, which breaks the premise of a definitional band.
		# (Observed live: DUK at beta -0.29 was labelled "low".)
		if value < 0:
			return "inverse"
		if value < 0.8:
			return "low"
		if value <= 1.2:
			return "market"
		return "high"


# ---------------------------------------------------------------------------
# Legacy composite scorer — RETAINED as a back-compat shim. The orchestrator's
# `unified_score` still reads `raw_quant_score`; removing it is the separate
# ranking-rewrite seam, not this module's job.
# ---------------------------------------------------------------------------

class LegacyCompositeScorer:
	"""DEPRECATED single composite 0-100 score (the "buy-o-meter").

	Kept only so the existing unified_score keeps working until the ranking rewrite
	replaces it. Quarantined in its own class so that retirement is the deletion of
	one name rather than an excavation. Do NOT surface this as a verdict in new UI.
	"""

	def score(
		self,
		rsi: float | None,
		macd_info: Dict[str, Any] | None,
		sharpe: float | None,
		beta: float | None,
		volatility: float | None,
	) -> int:
		score = 50

		if rsi is not None:
			if rsi < 30:
				score += 15
			elif rsi < 50:
				score += 5
			elif rsi < 70:
				score += 10
			else:
				score -= 10

		if macd_info is not None:
			if macd_info["signal"] == "bullish_crossover":
				score += 20
			else:
				score -= 10

		if sharpe is not None:
			if sharpe > 1.0:
				score += 15
			elif sharpe > 0.5:
				score += 10
			else:
				score -= 5

		if beta is not None:
			if beta < 0.8:
				score += 10
			elif beta <= 1.2:
				score += 5
			else:
				score -= 5

		if volatility is not None:
			if volatility < 0.15:
				score += 10
			elif volatility < 0.30:
				score += 5
			else:
				score -= 10

		return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Stage B — cross-sectional normalisation across the candidate universe.
# ---------------------------------------------------------------------------

class UniverseScorer:
	"""Normalise raw per-ticker facts across the whole candidate set into
	descriptive sub-dimensions + context bands. No verdict, no "good/bad".

	momentum             = percentile of (MACD histogram, trailing return)
	risk_adjusted_return = percentile of Sharpe
	stability            = percentile of low volatility (rank of -volatility)
	rsi_band / beta_band = definitional context only (non-monotonic)
	"""

	def __init__(
		self,
		min_universe: int | None = None,
		rsi_band: Band | None = None,
		beta_band: Band | None = None,
	):
		self._min_universe = min_universe
		self.rsi_band = rsi_band or RsiBand()
		self.beta_band = beta_band or BetaBand()

	@property
	def min_universe(self) -> int:
		return QUANT_MIN_UNIVERSE if self._min_universe is None else self._min_universe

	@staticmethod
	def percentile_rank(values: Dict[str, float | None]) -> Dict[str, float | None]:
		"""Percentile-rank the non-null values within the universe (0-100, higher =
		larger). Null inputs stay null. Percentile rank is the most explainable
		normalisation ("Nth percentile among today's candidates" is a factual count)."""
		present = {t: v for t, v in values.items() if v is not None and pd.notna(v)}
		result: Dict[str, float | None] = {t: None for t in values}
		if not present:
			return result
		ranks = pd.Series(present).rank(pct=True) * 100.0
		for ticker, pct in ranks.items():
			result[ticker] = round(float(pct), 1)
		return result

	@staticmethod
	def mean_of_present(*vals: float | None) -> float | None:
		present = [v for v in vals if v is not None]
		if not present:
			return None
		return round(sum(present) / len(present), 1)

	def bands_for(self, raw: Dict[str, Any]) -> Dict[str, str | None]:
		return {
			"rsi": self.rsi_band.of(raw.get("rsi")),
			"beta": self.beta_band.of(raw.get("beta")),
		}

	def score(self, raw_by_ticker: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
		tickers = list(raw_by_ticker.keys())
		measured = [t for t in tickers if raw_by_ticker[t].get("sharpe_ratio") is not None]

		# Small-universe guard: too few candidates to rank meaningfully. Expose facts +
		# bands, but leave sub-dimensions null rather than invent percentiles.
		if len(measured) < self.min_universe:
			return {
				t: {
					"sub_dimensions": {
						"momentum": None,
						"risk_adjusted_return": None,
						"stability": None,
					},
					"bands": self.bands_for(raw_by_ticker[t]),
					"percentiles": {},
					"quant_normalisation": "insufficient_universe",
				}
				for t in tickers
			}

		sharpe_pct = self.percentile_rank({t: raw_by_ticker[t].get("sharpe_ratio") for t in tickers})
		return_pct = self.percentile_rank({t: raw_by_ticker[t].get("trailing_return") for t in tickers})
		macd_pct = self.percentile_rank({t: raw_by_ticker[t].get("macd_histogram") for t in tickers})
		# Stability = LOW volatility ranks high, so rank the negation.
		neg_vol = {
			t: (-raw_by_ticker[t]["volatility"]) if raw_by_ticker[t].get("volatility") is not None else None
			for t in tickers
		}
		stability_pct = self.percentile_rank(neg_vol)

		scored: Dict[str, Dict[str, Any]] = {}
		for t in tickers:
			scored[t] = {
				"sub_dimensions": {
					"momentum": self.mean_of_present(macd_pct[t], return_pct[t]),
					"risk_adjusted_return": sharpe_pct[t],
					"stability": stability_pct[t],
				},
				"bands": self.bands_for(raw_by_ticker[t]),
				"percentiles": {
					"sharpe_ratio": sharpe_pct[t],
					"trailing_return": return_pct[t],
					"macd_histogram": macd_pct[t],
					"volatility": stability_pct[t],
				},
				"quant_normalisation": "cross_sectional",
			}
		return scored


# ---------------------------------------------------------------------------
# The pipeline
# ---------------------------------------------------------------------------

class QuantAnalyst:
	"""Facade over the two-stage quant pipeline.

	Every collaborator is optional and defaults to the standard implementation, so
	``QuantAnalyst()`` is the production configuration and any single piece — the
	data source, an indicator, the universe scorer — can be replaced without
	touching the rest.
	"""

	def __init__(
		self,
		data_source: MarketDataSource | None = None,
		scorer: UniverseScorer | None = None,
		legacy: LegacyCompositeScorer | None = None,
		rsi: Indicator | None = None,
		macd: Indicator | None = None,
		sharpe: Indicator | None = None,
		volatility: Indicator | None = None,
		trailing_return: Indicator | None = None,
	):
		self.data_source = data_source or MarketDataSource()
		self.scorer = scorer or UniverseScorer()
		self.legacy = legacy or LegacyCompositeScorer()
		self.rsi = rsi or RSI()
		self.macd = macd or MACD()
		self.sharpe = sharpe or SharpeRatio()
		self.volatility = volatility or Volatility()
		self.trailing_return = trailing_return or TrailingReturn()

	# ── Stage A — per-ticker objective facts (no score) ──────────────────────
	def raw_metrics(
		self,
		ticker: str,
		data: pd.DataFrame,
		spy_close: pd.Series | None = None,
	) -> Dict[str, Any]:
		"""Compute the objective, reproducible per-ticker measurements from already-
		fetched OHLCV. Takes the shared SPY close so beta doesn't re-download it."""
		close_prices = data["Close"]

		macd_info = self.macd.compute(close_prices)

		return {
			"ticker": ticker,
			"rsi": self.rsi.compute(close_prices),
			"macd": macd_info["signal"] if macd_info else None,
			"macd_histogram": macd_info["histogram"] if macd_info else None,
			"sharpe_ratio": self.sharpe.compute(close_prices),
			"beta": Beta(spy_close, self.data_source).compute(close_prices),
			"volatility": self.volatility.compute(close_prices),
			"trailing_return": self.trailing_return.compute(close_prices),
			"data_points": int(len(data)),
		}

	@staticmethod
	def empty_result(ticker: str, error: str = "Analysis failed") -> Dict[str, Any]:
		"""Uniform fallback row for a ticker whose data couldn't be fetched/measured."""
		return {
			"ticker": ticker,
			"rsi": None,
			"macd": None,
			"macd_histogram": None,
			"sharpe_ratio": None,
			"beta": 1.0,
			"volatility": None,
			"trailing_return": None,
			"data_points": 0,
			"raw_quant_score": 50,
			"sub_dimensions": {"momentum": None, "risk_adjusted_return": None, "stability": None},
			"bands": {"rsi": None, "beta": None},
			"percentiles": {},
			"quant_normalisation": "no_data",
			"error": error,
		}

	def analyze(self, tickers: list[str]) -> Dict[str, Dict[str, Any]]:
		"""Batch quant analysis over the candidate universe.

		Stage A (per ticker) → Stage B (cross-sectional) → assemble. SPY is fetched
		ONCE and shared across every beta calc. The legacy `raw_quant_score` is still
		attached (back-compat shim) alongside the new objective sub-dimensions/bands.
		"""
		spy_close = self.data_source.benchmark_close()

		raw_by_ticker: Dict[str, Dict[str, Any]] = {}
		failed: Dict[str, str] = {}

		for ticker in tickers:
			print(f"  Analyzing {ticker}...")
			data = self.data_source.history(ticker)
			if data is None or len(data) < 10:
				print(f"    ✗ Insufficient data for {ticker}")
				failed[ticker] = "Insufficient data"
				continue
			raw_by_ticker[ticker] = self.raw_metrics(ticker, data, spy_close)

		universe_scores = self.scorer.score(raw_by_ticker)

		results: Dict[str, Dict[str, Any]] = {}
		for ticker in tickers:
			if ticker in failed:
				results[ticker] = self.empty_result(ticker, failed[ticker])
				continue

			raw = raw_by_ticker[ticker]
			macd_info = {"signal": raw["macd"]} if raw.get("macd") else None
			raw_quant_score = self.legacy.score(
				raw.get("rsi"), macd_info, raw.get("sharpe_ratio"), raw.get("beta"), raw.get("volatility")
			)
			scored = universe_scores.get(ticker, {})

			results[ticker] = {
				**raw,
				"raw_quant_score": raw_quant_score,
				"sub_dimensions": scored.get("sub_dimensions"),
				"bands": scored.get("bands"),
				"percentiles": scored.get("percentiles"),
				"quant_normalisation": scored.get("quant_normalisation"),
				"timestamp": pd.Timestamp.now().isoformat(),
			}

		return results

	def analyze_one(self, ticker: str) -> Dict[str, Any] | None:
		"""Single-ticker convenience wrapper (back-compat). Note: cross-sectional
		sub-dimensions require a universe, so a lone ticker returns
		quant_normalisation="insufficient_universe" with null sub-dimensions."""
		result = self.analyze([ticker]).get(ticker)
		if result is None or result.get("error"):
			return None
		return result


# ---------------------------------------------------------------------------
# Published surface — thin delegations to the default analyst
# ---------------------------------------------------------------------------
# `agents/__init__` and the orchestrator import `analyze_tickers`, and the unit
# suite calls the rest by name. They stay so the class layer above is something
# callers can adopt at their own pace, not a breaking change.

_DEFAULT = QuantAnalyst()


def fetch_ticker_data(ticker: str, period: str | None = None) -> pd.DataFrame | None:
	return _DEFAULT.data_source.history(ticker, period)


def fetch_spy_close(period: str | None = None) -> pd.Series | None:
	return _DEFAULT.data_source.benchmark_close(period)


def calculate_rsi(close_prices: pd.Series, period: int = 14) -> float | None:
	return RSI(period).compute(close_prices)


def calculate_macd(close_prices: pd.Series) -> Dict[str, Any] | None:
	return MACD().compute(close_prices)


def calculate_sharpe_ratio(close_prices: pd.Series, risk_free_rate: float = 0.02) -> float | None:
	return SharpeRatio(risk_free_rate).compute(close_prices)


def calculate_beta(close_prices: pd.Series, market_prices: pd.Series | None = None) -> float | None:
	return Beta(market_prices).compute(close_prices)


def calculate_volatility(close_prices: pd.Series) -> float | None:
	return Volatility().compute(close_prices)


def calculate_trailing_return(close_prices: pd.Series) -> float | None:
	return TrailingReturn().compute(close_prices)


def _rsi_band(rsi: float | None) -> str | None:
	return RsiBand().of(rsi)


def _beta_band(beta: float | None) -> str | None:
	return BetaBand().of(beta)


def score_quant_metrics(
	rsi: float | None,
	macd_info: Dict[str, Any] | None,
	sharpe: float | None,
	beta: float | None,
	volatility: float | None,
) -> int:
	return _DEFAULT.legacy.score(rsi, macd_info, sharpe, beta, volatility)


def compute_raw_metrics(
	ticker: str,
	data: pd.DataFrame,
	spy_close: pd.Series | None = None,
) -> Dict[str, Any]:
	return _DEFAULT.raw_metrics(ticker, data, spy_close)


def _percentile_rank(values: Dict[str, float | None]) -> Dict[str, float | None]:
	return UniverseScorer.percentile_rank(values)


def _mean_of_present(*vals: float | None) -> float | None:
	return UniverseScorer.mean_of_present(*vals)


def score_universe(raw_by_ticker: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
	return _DEFAULT.scorer.score(raw_by_ticker)


def _empty_result(ticker: str, error: str = "Analysis failed") -> Dict[str, Any]:
	return QuantAnalyst.empty_result(ticker, error)


def analyze_tickers(tickers: list[str]) -> Dict[str, Dict[str, Any]]:
	return _DEFAULT.analyze(tickers)


def analyze_ticker(ticker: str) -> Dict[str, Any] | None:
	return _DEFAULT.analyze_one(ticker)
