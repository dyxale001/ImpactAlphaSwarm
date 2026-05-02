"""
Quant Analyst Worker Module

Purpose: Fetch market data via yfinance, compute technical indicators (RSI, MACD, Sharpe, Beta, Volatility),
and produce a unified Raw Quant Score (0–100) for each ticker.

This module is integrated into the LangGraph orchestrator's Phase 2A.
"""

import yfinance as yf
import pandas as pd
import numpy as np
from typing import Dict, Any
import warnings

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
    
    # Wilder's smoothing: alpha = 1/period
    avg_gain = gains.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    avg_loss = losses.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    
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
        "signal": signal
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
    """
    Calculate Relative Strength Index (RSI).
    Range: 0–100 (< 30 = oversold, > 70 = overbought)
    Uses Wilder's smoothing with pure pandas.
    """
    try:
        close_prices = _ensure_series(close_prices)
        if close_prices is None or len(close_prices) < period + 1:
            return None
        return _calculate_rsi(close_prices, period)
    except Exception as e:
        print(f"     RSI calculation failed: {e}")
        return None


def calculate_macd(close_prices: pd.Series) -> Dict[str, Any] | None:
    """
    Calculate MACD (Moving Average Convergence Divergence).
    Returns: MACD line, Signal line, and histogram
    Uses pure pandas EMA.
    """
    try:
        close_prices = _ensure_series(close_prices)
        if close_prices is None or len(close_prices) < 26:
            return None
        return _calculate_macd(close_prices)
    except Exception as e:
        print(f"     MACD calculation failed: {e}")
        return None


def calculate_sharpe_ratio(close_prices: pd.Series, risk_free_rate: float = 0.02) -> float | None:
    """
    Calculate Sharpe Ratio (risk-adjusted return).
    Formula: (mean_return - risk_free_rate) / std_return
    Annualized for 30 days of data.
    """
    try:
        close_prices = _ensure_series(close_prices)
        if close_prices is None or len(close_prices) < 2:
            return None
        
        daily_returns = close_prices.pct_change().dropna()
        
        if len(daily_returns) < 2:
            return None
        
        # Coerce to scalars to avoid ambiguous truth value errors
        mean_return = float(daily_returns.mean())
        std_return = float(daily_returns.std())
        
        # Annualize (assuming 252 trading days per year)
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
    """
    Calculate Beta (volatility vs market, typically S&P 500).
    If market_prices not provided, uses SPY (S&P 500 ETF) as proxy.
    """
    try:
        close_prices = _ensure_series(close_prices)
        if close_prices is None:
            return 1.0
        
        if market_prices is None:
            # Fetch SPY (S&P 500) as market proxy
            spy_data = yf.download("SPY", period="30d", progress=False, threads=False)
            if spy_data is None or len(spy_data) == 0:
                return 1.0  # Default to market beta
            market_prices = spy_data['Close']
        
        market_prices = _ensure_series(market_prices)
        if market_prices is None:
            return 1.0
        
        # Align data
        data_aligned = pd.concat([close_prices, market_prices], axis=1).dropna()
        
        if len(data_aligned) < 2:
            return 1.0
        
        asset_returns = data_aligned.iloc[:, 0].pct_change().dropna()
        market_returns = data_aligned.iloc[:, 1].pct_change().dropna()
        
        # Covariance between asset and market
        covariance = float(asset_returns.cov(market_returns))
        market_variance = float(market_returns.var())
        
        if market_variance == 0 or not pd.notna(market_variance):
            return 1.0
        
        beta = covariance / market_variance
        return float(beta) if pd.notna(beta) else 1.0
    except Exception as e:
        print(f"     Beta calculation failed: {e}")
        return 1.0  # Default to market beta


def calculate_volatility(close_prices: pd.Series) -> float | None:
    """
    Calculate annualized volatility (standard deviation of daily returns).
    """
    try:
        close_prices = _ensure_series(close_prices)
        if close_prices is None or len(close_prices) < 2:
            return None
        
        daily_returns = close_prices.pct_change().dropna()
        
        if len(daily_returns) < 2:
            return None
        
        volatility = float(daily_returns.std()) * np.sqrt(252)  # Annualize
        return volatility if pd.notna(volatility) else None
    except Exception as e:
        print(f"     Volatility calculation failed: {e}")
        return None


def score_quant_metrics(
    rsi: float | None,
    macd_info: Dict[str, Any] | None,
    sharpe: float | None,
    beta: float | None,
    volatility: float | None
) -> int:
    """
    Produce a unified Raw Quant Score (0–100) based on all indicators.
    
    Scoring logic:
    - RSI: 0-30 (oversold) +15, 30-50 neutral +5, 50-70 +10, 70+ (overbought) -10
    - MACD: bullish_crossover +20, bearish -10, neutral 0
    - Sharpe: > 1.0 +15, 0.5-1.0 +10, < 0.5 -5
    - Beta: < 0.8 (defensive) +10, 0.8-1.2 (neutral) +5, > 1.2 (aggressive) -5
    - Volatility: < 0.15 (low) +10, 0.15-0.30 (moderate) +5, > 0.30 (high) -10
    
    Base: 50 points
    """
    score = 50
    
    # RSI scoring
    if rsi is not None:
        if rsi < 30:
            score += 15  # Oversold (potential reversal)
        elif rsi < 50:
            score += 5   # Neutral-low
        elif rsi < 70:
            score += 10  # Neutral-high (strong momentum)
        else:
            score -= 10  # Overbought (potential pullback)
    
    # MACD scoring
    if macd_info is not None:
        if macd_info["signal"] == "bullish_crossover":
            score += 20  # Strong bullish signal
        else:
            score -= 10  # Bearish signal
    
    # Sharpe Ratio scoring (risk-adjusted return)
    if sharpe is not None:
        if sharpe > 1.0:
            score += 15  # Excellent risk-adjusted return
        elif sharpe > 0.5:
            score += 10  # Good risk-adjusted return
        else:
            score -= 5   # Poor risk-adjusted return
    
    # Beta scoring (volatility vs market)
    if beta is not None:
        if beta < 0.8:
            score += 10  # Defensive (lower volatility)
        elif beta <= 1.2:
            score += 5   # Neutral (market-aligned)
        else:
            score -= 5   # Aggressive (higher volatility)
    
    # Volatility scoring (absolute volatility)
    if volatility is not None:
        if volatility < 0.15:
            score += 10  # Low volatility (stable)
        elif volatility < 0.30:
            score += 5   # Moderate volatility (acceptable)
        else:
            score -= 10  # High volatility (risky)
    
    # Clamp to 0–100 range
    return max(0, min(100, score))


def analyze_ticker(ticker: str) -> Dict[str, Any] | None:
    """
    Complete Quant Analysis for a single ticker.
    
    Returns:
        Dictionary with all metrics and raw quant score, or None if analysis fails
    """
    print(f"  Analyzing {ticker}...")
    
    # Fetch data
    data = fetch_ticker_data(ticker)
    if data is None or len(data) < 10:
        print(f"    ✗ Insufficient data for {ticker}")
        return None
    
    close_prices = data['Close']
    
    # Calculate all indicators
    rsi = calculate_rsi(close_prices)
    macd_info = calculate_macd(close_prices)
    sharpe = calculate_sharpe_ratio(close_prices)
    beta = calculate_beta(close_prices)
    volatility = calculate_volatility(close_prices)
    
    # Produce unified score
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
        "timestamp": pd.Timestamp.now().isoformat()
    }


def analyze_tickers(tickers: list[str]) -> Dict[str, Dict[str, Any]]:
    """
    Batch analyze multiple tickers.
    
    Returns:
        Dictionary mapping ticker → analysis results
    """
    results = {}
    
    for ticker in tickers:
        analysis = analyze_ticker(ticker)
        if analysis is not None:
            results[ticker] = analysis
        else:
            # Fallback: return structure with None values
            results[ticker] = {
                "ticker": ticker,
                "rsi": None,
                "macd": None,
                "sharpe_ratio": None,
                "beta": 1.0,
                "volatility": None,
                "raw_quant_score": 50,  # Neutral default
                "error": "Analysis failed"
            }
    
    return results


if __name__ == "__main__":
    # Test with a few tickers
    test_tickers = ["NVDA", "MSFT", "AAPL", "TSLA"]
    print("Testing Quant Analyst Worker")
    print("=" * 60)
    
    results = analyze_tickers(test_tickers)
    
    print("\n" + "=" * 60)
    print("QUANT ANALYSIS RESULTS:")
    print("=" * 60)
    for ticker, metrics in results.items():
        print(f"\n{ticker}:")
        print(f"  RSI: {metrics.get('rsi', 'N/A')}")
        print(f"  MACD: {metrics.get('macd', 'N/A')}")
        print(f"  Sharpe Ratio: {metrics.get('sharpe_ratio', 'N/A')}")
        print(f"  Beta: {metrics.get('beta', 'N/A')}")
        print(f"  Volatility: {metrics.get('volatility', 'N/A')}")
        print(f"  Raw Quant Score: {metrics.get('raw_quant_score', 'N/A')}")