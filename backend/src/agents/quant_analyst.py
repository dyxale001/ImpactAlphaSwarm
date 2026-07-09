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
"""

import os
import warnings
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


def _calculate_rsi(close_prices: pd.Series, period: int = 14) -> float | None:
	"""
	Pure-pandas RSI using Wilder's smoothing (exponential moving average).

	RSI = 100 - (100 / (1 + RS))
	RS = EMA(gains) / EMA(losses)
	"""
	if len(close_prices) < period + 1:
		return None

	delta = close_prices.diff()
	gains = delta.clip(lower=0)
	losses = -delta.clip(upper=0)

	avg_gain = gains.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
	avg_loss = losses.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()

	rs = avg_gain / avg_loss
	rsi = 100 - (100 / (1 + rs))

	last_rsi = rsi.iloc[-1]
	return float(last_rsi) if pd.notna(last_rsi) else None


def _calculate_macd(close_prices: pd.Series) -> Dict[str, Any] | None:
	"""
	Pure-pandas MACD using exponential moving averages.
	MACD = EMA(12) - EMA(26)
	Signal = EMA(9) of MACD
	"""
	if len(close_prices) < 26:
		return None

	ema12 = close_prices.ewm(span=12, adjust=False).mean()
	ema26 = close_prices.ewm(span=26, adjust=False).mean()
	macd_line = ema12 - ema26
	signal_line = macd_line.ewm(span=9, adjust=False).mean()
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


def fetch_ticker_data(ticker: str, period: str | None = None) -> pd.DataFrame | None:
	"""
	Fetch OHLCV data from yfinance for a given ticker.

	Args:
		ticker: Stock ticker symbol (e.g., "NVDA", "MSFT")
		period: Data period; defaults to QUANT_WINDOW (~1y, D-080).

	Returns:
		DataFrame with OHLCV data, or None if fetch fails
	"""
	period = period or QUANT_WINDOW
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


def fetch_spy_close(period: str | None = None) -> pd.Series | None:
	"""Fetch the SPY close series ONCE for the universe (shared across all beta
	calcs) so we don't re-download the market benchmark per ticker."""
	period = period or QUANT_WINDOW
	try:
		spy_data = yf.download("SPY", period=period, progress=False, threads=False)
		if spy_data is None or len(spy_data) == 0:
			return None
		return _ensure_series(spy_data["Close"])
	except Exception as e:
		print(f"     Error fetching SPY benchmark: {e}")
		return None


def calculate_rsi(close_prices: pd.Series, period: int = 14) -> float | None:
	"""Calculate Relative Strength Index (RSI)."""
	try:
		close_prices = _ensure_series(close_prices)
		if close_prices is None or len(close_prices) < period + 1:
			return None
		return _calculate_rsi(close_prices, period)
	except Exception as e:
		print(f"     RSI calculation failed: {e}")
		return None


def calculate_macd(close_prices: pd.Series) -> Dict[str, Any] | None:
	"""Calculate MACD (Moving Average Convergence Divergence)."""
	try:
		close_prices = _ensure_series(close_prices)
		if close_prices is None or len(close_prices) < 26:
			return None
		return _calculate_macd(close_prices)
	except Exception as e:
		print(f"     MACD calculation failed: {e}")
		return None


def calculate_sharpe_ratio(close_prices: pd.Series, risk_free_rate: float = 0.02) -> float | None:
	"""Calculate Sharpe Ratio (risk-adjusted return)."""
	try:
		close_prices = _ensure_series(close_prices)
		if close_prices is None or len(close_prices) < 2:
			return None

		daily_returns = close_prices.pct_change().dropna()

		if len(daily_returns) < 2:
			return None

		mean_return = float(daily_returns.mean())
		std_return = float(daily_returns.std())

		annual_return = mean_return * 252
		annual_std = std_return * np.sqrt(252)

		if annual_std == 0 or not pd.notna(annual_std):
			return 0.0

		sharpe = (annual_return - risk_free_rate) / annual_std
		return float(sharpe) if pd.notna(sharpe) else None
	except Exception as e:
		print(f"     Sharpe Ratio calculation failed: {e}")
		return None


def calculate_beta(close_prices: pd.Series, market_prices: pd.Series | None = None) -> float | None:
	"""Calculate Beta (volatility vs market, typically S&P 500).

	Pass `market_prices` (the shared SPY close series) to avoid re-downloading the
	benchmark per ticker; only when it is None does this fall back to a lone
	download (kept for single-ticker / back-compat callers).
	"""
	try:
		close_prices = _ensure_series(close_prices)
		if close_prices is None:
			return 1.0

		if market_prices is None:
			market_prices = fetch_spy_close()
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
	except Exception as e:
		print(f"     Beta calculation failed: {e}")
		return 1.0


def calculate_volatility(close_prices: pd.Series) -> float | None:
	"""Calculate annualized volatility (standard deviation of daily returns)."""
	try:
		close_prices = _ensure_series(close_prices)
		if close_prices is None or len(close_prices) < 2:
			return None

		daily_returns = close_prices.pct_change().dropna()

		if len(daily_returns) < 2:
			return None

		volatility = float(daily_returns.std()) * np.sqrt(252)
		return volatility if pd.notna(volatility) else None
	except Exception as e:
		print(f"     Volatility calculation failed: {e}")
		return None


def calculate_trailing_return(close_prices: pd.Series) -> float | None:
	"""Total return over the fetched window (last / first - 1). A plain fact, not
	a forecast."""
	try:
		close_prices = _ensure_series(close_prices)
		if close_prices is None:
			return None
		close_prices = close_prices.dropna()
		if len(close_prices) < 2:
			return None
		first = float(close_prices.iloc[0])
		last = float(close_prices.iloc[-1])
		if first == 0 or not pd.notna(first) or not pd.notna(last):
			return None
		return (last / first) - 1.0
	except Exception as e:
		print(f"     Trailing return calculation failed: {e}")
		return None


# ---------------------------------------------------------------------------
# Context bands — DEFINITIONAL (true by convention, like "28C is above room
# temperature"), NOT predictive. RSI and beta are non-monotonic, so they are
# shown as bands only and never folded into a "higher = better" number.
# ---------------------------------------------------------------------------

def _rsi_band(rsi: float | None) -> str | None:
	if rsi is None:
		return None
	if rsi < 30:
		return "oversold"
	if rsi <= 70:
		return "neutral"
	return "overbought"


def _beta_band(beta: float | None) -> str | None:
	if beta is None:
		return None
	if beta < 0.8:
		return "low"
	if beta <= 1.2:
		return "market"
	return "high"


# ---------------------------------------------------------------------------
# Legacy composite scorer — RETAINED as a back-compat shim. The orchestrator's
# `unified_score` still reads `raw_quant_score`; removing it is the separate
# ranking-rewrite seam, not this module's job.
# ---------------------------------------------------------------------------

def score_quant_metrics(
	rsi: float | None,
	macd_info: Dict[str, Any] | None,
	sharpe: float | None,
	beta: float | None,
	volatility: float | None,
) -> int:
	"""DEPRECATED single composite 0-100 score (the "buy-o-meter"). Kept only so
	the existing unified_score keeps working until the ranking rewrite replaces it.
	Do NOT surface this as a verdict in new UI."""
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
# Stage A — per-ticker objective facts (no score).
# ---------------------------------------------------------------------------

def compute_raw_metrics(
	ticker: str,
	data: pd.DataFrame,
	spy_close: pd.Series | None = None,
) -> Dict[str, Any]:
	"""Compute the objective, reproducible per-ticker measurements from already-
	fetched OHLCV. Takes the shared SPY close so beta doesn't re-download it."""
	close_prices = data["Close"]

	rsi = calculate_rsi(close_prices)
	macd_info = calculate_macd(close_prices)
	sharpe = calculate_sharpe_ratio(close_prices)
	beta = calculate_beta(close_prices, spy_close)
	volatility = calculate_volatility(close_prices)
	trailing_return = calculate_trailing_return(close_prices)

	return {
		"ticker": ticker,
		"rsi": rsi,
		"macd": macd_info["signal"] if macd_info else None,
		"macd_histogram": macd_info["histogram"] if macd_info else None,
		"sharpe_ratio": sharpe,
		"beta": beta,
		"volatility": volatility,
		"trailing_return": trailing_return,
		"data_points": int(len(data)),
	}


# ---------------------------------------------------------------------------
# Stage B — cross-sectional normalisation across the candidate universe.
# ---------------------------------------------------------------------------

def _percentile_rank(values: Dict[str, float | None]) -> Dict[str, float | None]:
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


def _mean_of_present(*vals: float | None) -> float | None:
	present = [v for v in vals if v is not None]
	if not present:
		return None
	return round(sum(present) / len(present), 1)


def score_universe(raw_by_ticker: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
	"""Normalise raw per-ticker facts across the whole candidate set into
	descriptive sub-dimensions + context bands. No verdict, no "good/bad".

	momentum             = percentile of (MACD histogram, trailing return)
	risk_adjusted_return = percentile of Sharpe
	stability            = percentile of low volatility (rank of -volatility)
	rsi_band / beta_band = definitional context only (non-monotonic)
	"""
	tickers = list(raw_by_ticker.keys())
	measured = [t for t in tickers if raw_by_ticker[t].get("sharpe_ratio") is not None]

	# Small-universe guard: too few candidates to rank meaningfully. Expose facts +
	# bands, but leave sub-dimensions null rather than invent percentiles.
	if len(measured) < QUANT_MIN_UNIVERSE:
		return {
			t: {
				"sub_dimensions": {
					"momentum": None,
					"risk_adjusted_return": None,
					"stability": None,
				},
				"bands": {
					"rsi": _rsi_band(raw_by_ticker[t].get("rsi")),
					"beta": _beta_band(raw_by_ticker[t].get("beta")),
				},
				"percentiles": {},
				"quant_normalisation": "insufficient_universe",
			}
			for t in tickers
		}

	sharpe_pct = _percentile_rank({t: raw_by_ticker[t].get("sharpe_ratio") for t in tickers})
	return_pct = _percentile_rank({t: raw_by_ticker[t].get("trailing_return") for t in tickers})
	macd_pct = _percentile_rank({t: raw_by_ticker[t].get("macd_histogram") for t in tickers})
	# Stability = LOW volatility ranks high, so rank the negation.
	neg_vol = {
		t: (-raw_by_ticker[t]["volatility"]) if raw_by_ticker[t].get("volatility") is not None else None
		for t in tickers
	}
	stability_pct = _percentile_rank(neg_vol)

	scored: Dict[str, Dict[str, Any]] = {}
	for t in tickers:
		scored[t] = {
			"sub_dimensions": {
				"momentum": _mean_of_present(macd_pct[t], return_pct[t]),
				"risk_adjusted_return": sharpe_pct[t],
				"stability": stability_pct[t],
			},
			"bands": {
				"rsi": _rsi_band(raw_by_ticker[t].get("rsi")),
				"beta": _beta_band(raw_by_ticker[t].get("beta")),
			},
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
# Entry points
# ---------------------------------------------------------------------------

def _empty_result(ticker: str, error: str = "Analysis failed") -> Dict[str, Any]:
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


def analyze_tickers(tickers: list[str]) -> Dict[str, Dict[str, Any]]:
	"""Batch quant analysis over the candidate universe.

	Stage A (per ticker) → Stage B (cross-sectional) → assemble. SPY is fetched
	ONCE and shared across every beta calc. The legacy `raw_quant_score` is still
	attached (back-compat shim) alongside the new objective sub-dimensions/bands.
	"""
	spy_close = fetch_spy_close()

	raw_by_ticker: Dict[str, Dict[str, Any]] = {}
	failed: Dict[str, str] = {}

	for ticker in tickers:
		print(f"  Analyzing {ticker}...")
		data = fetch_ticker_data(ticker)
		if data is None or len(data) < 10:
			print(f"    ✗ Insufficient data for {ticker}")
			failed[ticker] = "Insufficient data"
			continue
		raw_by_ticker[ticker] = compute_raw_metrics(ticker, data, spy_close)

	universe_scores = score_universe(raw_by_ticker)

	results: Dict[str, Dict[str, Any]] = {}
	for ticker in tickers:
		if ticker in failed:
			results[ticker] = _empty_result(ticker, failed[ticker])
			continue

		raw = raw_by_ticker[ticker]
		macd_info = {"signal": raw["macd"]} if raw.get("macd") else None
		raw_quant_score = score_quant_metrics(
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


def analyze_ticker(ticker: str) -> Dict[str, Any] | None:
	"""Single-ticker convenience wrapper (back-compat). Note: cross-sectional
	sub-dimensions require a universe, so a lone ticker returns
	quant_normalisation="insufficient_universe" with null sub-dimensions."""
	result = analyze_tickers([ticker]).get(ticker)
	if result is None or result.get("error"):
		return None
	return result
