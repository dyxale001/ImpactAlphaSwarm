"""Quant Analyst Worker Module

Purpose: Fetch market data via yfinance, compute technical indicators (RSI, MACD, Sharpe, Beta, Volatility),
and produce a unified Raw Quant Score (0-100) for each ticker.

This module is integrated into the LangGraph orchestrator's Phase 2A.
"""

import warnings
from typing import Dict, Any

import numpy as np
import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")  # Suppress yfinance warnings


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


def fetch_ticker_data(ticker: str, period: str = "30d") -> pd.DataFrame | None:
	"""
	Fetch 30-day OHLCV data from yfinance for a given ticker.

	Args:
		ticker: Stock ticker symbol (e.g., "NVDA", "MSFT")
		period: Data period (default "30d" = 30 days)

	Returns:
		DataFrame with OHLCV data, or None if fetch fails
	"""
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
	"""Calculate Beta (volatility vs market, typically S&P 500)."""
	try:
		close_prices = _ensure_series(close_prices)
		if close_prices is None:
			return 1.0

		if market_prices is None:
			spy_data = yf.download("SPY", period="30d", progress=False, threads=False)
			if spy_data is None or len(spy_data) == 0:
				return 1.0
			market_prices = spy_data["Close"]

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


def score_quant_metrics(
	rsi: float | None,
	macd_info: Dict[str, Any] | None,
	sharpe: float | None,
	beta: float | None,
	volatility: float | None,
) -> int:
	"""Produce a unified Raw Quant Score (0–100) based on all indicators."""
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


def analyze_ticker(ticker: str) -> Dict[str, Any] | None:
	"""Complete Quant Analysis for a single ticker."""
	print(f"  Analyzing {ticker}...")

	data = fetch_ticker_data(ticker)
	if data is None or len(data) < 10:
		print(f"    ✗ Insufficient data for {ticker}")
		return None

	close_prices = data["Close"]

	rsi = calculate_rsi(close_prices)
	macd_info = calculate_macd(close_prices)
	sharpe = calculate_sharpe_ratio(close_prices)
	beta = calculate_beta(close_prices)
	volatility = calculate_volatility(close_prices)

	raw_quant_score = score_quant_metrics(rsi, macd_info, sharpe, beta, volatility)

	return {
		"ticker": ticker,
		"rsi": rsi,
		"macd": macd_info["signal"] if macd_info else None,
		"macd_histogram": macd_info["histogram"] if macd_info else None,
		"sharpe_ratio": sharpe,
		"beta": beta,
		"volatility": volatility,
		"raw_quant_score": raw_quant_score,
		"timestamp": pd.Timestamp.now().isoformat(),
	}


def analyze_tickers(tickers: list[str]) -> Dict[str, Dict[str, Any]]:
	"""Batch analyze multiple tickers."""
	results = {}

	for ticker in tickers:
		analysis = analyze_ticker(ticker)
		if analysis is not None:
			results[ticker] = analysis
		else:
			results[ticker] = {
				"ticker": ticker,
				"rsi": None,
				"macd": None,
				"sharpe_ratio": None,
				"beta": 1.0,
				"volatility": None,
				"raw_quant_score": 50,
				"error": "Analysis failed",
			}

	return results