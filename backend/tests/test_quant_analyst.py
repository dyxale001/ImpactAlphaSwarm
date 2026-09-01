"""Unit tests for the quant analyst (src/agents/quant_analyst.py).

Two stages, tested separately because they fail differently:

    Stage A  compute_raw_metrics(ticker, ohlcv, spy_close) -> per-ticker facts
    Stage B  score_universe(dict[ticker, raw])             -> cross-sectional percentiles

Stage A is arithmetic on a price series. Where a closed-form answer exists, these
tests assert it against an INDEPENDENT reference computed in plain Python rather
than re-deriving it with pandas -- the same technique used to confirm the live
beta of -0.2943 by hand.

Stage B is the two-stage percentile engine that PR #16 silently reverted on main
in July. That revert survived three days and was caught by a manual code review,
not by anything automatic. TestScoreUniverse is the automation that was missing.

Nothing here touches the network. `fetch_ticker_data` / `fetch_spy_close` are the
only I/O in the module and are deliberately out of scope; every test feeds a
constructed price series instead.
"""

import math
import statistics

import numpy as np
import pandas as pd
import pytest

from src.agents import quant_analyst as qa
from src.agents.quant_analyst import (
    _beta_band,
    _ensure_series,
    _mean_of_present,
    _percentile_rank,
    _rsi_band,
    calculate_beta,
    calculate_macd,
    calculate_rsi,
    calculate_sharpe_ratio,
    calculate_trailing_return,
    calculate_volatility,
    compute_raw_metrics,
    score_quant_metrics,
    score_universe,
)


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────

def prices_from_returns(returns, start=100.0):
    """Reconstruct a price series whose pct_change is exactly `returns`."""
    levels = [start]
    for r in returns:
        levels.append(levels[-1] * (1.0 + r))
    return pd.Series(levels, dtype=float)


def wiggly_prices(n=60, seed=7, start=100.0):
    """A deterministic, non-degenerate price series long enough for RSI + MACD."""
    rng = np.random.default_rng(seed)
    return prices_from_returns(rng.normal(0.0008, 0.015, n), start)


def raw(ticker, sharpe=1.0, trailing_return=0.1, macd_histogram=0.5,
        volatility=0.2, rsi=55.0, beta=1.0, data_points=250):
    """A Stage-A output row."""
    return {
        "ticker": ticker,
        "rsi": rsi,
        "macd": "bullish_crossover",
        "macd_histogram": macd_histogram,
        "sharpe_ratio": sharpe,
        "beta": beta,
        "volatility": volatility,
        "trailing_return": trailing_return,
        "data_points": data_points,
    }


def universe(n, **overrides):
    """`n` measurable tickers named T00, T01, ... with per-index-varying metrics."""
    out = {}
    for i in range(n):
        ticker = f"T{i:02d}"
        out[ticker] = raw(
            ticker,
            sharpe=0.1 * i,
            trailing_return=0.01 * i,
            macd_histogram=0.1 * i,
            volatility=0.05 + 0.01 * i,
        )
        out[ticker].update(overrides.get(ticker, {}))
    return out


# ═════════════════════════════════════════════════════════════════════════════
# _ensure_series
# ═════════════════════════════════════════════════════════════════════════════

class TestEnsureSeries:
    def test_none_passes_through(self):
        assert _ensure_series(None) is None

    def test_series_is_returned_unchanged(self):
        series = pd.Series([1.0, 2.0])
        assert _ensure_series(series) is series

    def test_single_column_frame_is_unwrapped(self):
        frame = pd.DataFrame({"Close": [1.0, 2.0, 3.0]})
        result = _ensure_series(frame)
        assert isinstance(result, pd.Series)
        assert list(result) == [1.0, 2.0, 3.0]

    def test_multi_column_frame_is_rejected(self):
        # yfinance returns a multi-column frame for a multi-ticker download;
        # silently picking a column would compute the wrong asset's metrics.
        assert _ensure_series(pd.DataFrame({"a": [1.0], "b": [2.0]})) is None

    @pytest.mark.parametrize("junk", [[1, 2, 3], "NVDA", 42, {"a": 1}])
    def test_other_types_are_rejected(self, junk):
        assert _ensure_series(junk) is None


# ═════════════════════════════════════════════════════════════════════════════
# Stage A — RSI
# ═════════════════════════════════════════════════════════════════════════════

class TestRSI:
    def test_too_short_a_window_returns_none(self):
        # Wilder's smoothing needs period + 1 observations.
        assert calculate_rsi(pd.Series([100.0] * 14), period=14) is None

    def test_uninterrupted_gains_pin_rsi_at_100(self):
        rising = pd.Series([100.0 + i for i in range(30)])
        assert calculate_rsi(rising) == pytest.approx(100.0)

    def test_uninterrupted_losses_pin_rsi_at_0(self):
        falling = pd.Series([200.0 - i for i in range(30)])
        assert calculate_rsi(falling) == pytest.approx(0.0)

    def test_rsi_stays_within_bounds(self):
        value = calculate_rsi(wiggly_prices())
        assert value is not None
        assert 0.0 <= value <= 100.0

    def test_accepts_a_single_column_frame(self):
        frame = pd.DataFrame({"Close": [100.0 + i for i in range(30)]})
        assert calculate_rsi(frame) == pytest.approx(100.0)

    def test_a_bad_input_is_swallowed_rather_than_crashing_the_run(self):
        # Every Stage-A helper is defensive by design: one bad ticker must not
        # take down the nightly universe.
        assert calculate_rsi("not a series") is None


# ═════════════════════════════════════════════════════════════════════════════
# Stage A — MACD
# ═════════════════════════════════════════════════════════════════════════════

class TestMACD:
    def test_too_short_a_window_returns_none(self):
        assert calculate_macd(pd.Series([100.0] * 25)) is None

    def test_returns_the_documented_shape(self):
        result = calculate_macd(wiggly_prices())
        assert set(result) == {"macd_line", "signal_line", "histogram", "signal"}

    def test_a_rising_series_reads_bullish(self):
        rising = pd.Series([100.0 + i for i in range(60)])
        result = calculate_macd(rising)
        assert result["histogram"] > 0
        assert result["signal"] == "bullish_crossover"

    def test_a_falling_series_reads_bearish(self):
        falling = pd.Series([200.0 - i for i in range(60)])
        result = calculate_macd(falling)
        assert result["histogram"] < 0
        assert result["signal"] == "bearish_crossover"

    def test_histogram_is_the_gap_between_macd_and_signal_lines(self):
        result = calculate_macd(wiggly_prices())
        assert result["histogram"] == pytest.approx(result["macd_line"] - result["signal_line"])

    def test_a_flat_series_is_classified_bearish_at_a_zero_histogram(self):
        # PINNED QUIRK, not an endorsement: the label is `hist > 0`, so an exactly
        # flat histogram falls to "bearish_crossover". Worth knowing before this
        # string is shown to a user as an explanation.
        flat = pd.Series([100.0] * 60)
        result = calculate_macd(flat)
        assert result["histogram"] == pytest.approx(0.0)
        assert result["signal"] == "bearish_crossover"


# ═════════════════════════════════════════════════════════════════════════════
# Stage A — Sharpe
# ═════════════════════════════════════════════════════════════════════════════

class TestSharpeRatio:
    @pytest.mark.parametrize("prices", [pd.Series([100.0]), pd.Series([], dtype=float)])
    def test_too_few_observations_return_none(self, prices):
        assert calculate_sharpe_ratio(prices) is None

    def test_two_prices_give_one_return_which_is_not_enough_for_a_deviation(self):
        assert calculate_sharpe_ratio(pd.Series([100.0, 110.0])) is None

    def test_zero_volatility_returns_zero_rather_than_dividing_by_zero(self):
        assert calculate_sharpe_ratio(pd.Series([100.0] * 30)) == 0.0

    def test_matches_an_independent_reference_computation(self):
        # Reference computed in plain Python, not pandas, so a pandas-side
        # regression cannot hide behind an identical re-derivation.
        returns = [0.1, -0.05]
        prices = prices_from_returns(returns)

        mean = statistics.fmean(returns)
        stdev = statistics.stdev(returns)               # sample, ddof=1, as pandas
        expected = (mean * 252 - 0.02) / (stdev * math.sqrt(252))

        assert calculate_sharpe_ratio(prices) == pytest.approx(expected)

    def test_the_risk_free_rate_is_subtracted_from_the_annualised_return(self):
        prices = wiggly_prices()
        assert calculate_sharpe_ratio(prices, risk_free_rate=0.0) > calculate_sharpe_ratio(
            prices, risk_free_rate=0.10
        )

    def test_a_rising_series_scores_above_a_falling_one(self):
        rng = np.random.default_rng(3)
        shocks = rng.normal(0.0, 0.01, 120)
        up = prices_from_returns([0.002 + s for s in shocks])
        down = prices_from_returns([-0.002 + s for s in shocks])
        assert calculate_sharpe_ratio(up) > calculate_sharpe_ratio(down)


# ═════════════════════════════════════════════════════════════════════════════
# Stage A — Beta
# ═════════════════════════════════════════════════════════════════════════════

class TestBeta:
    def test_an_asset_that_moves_twice_the_market_has_beta_two(self):
        # Closed form: with r_asset = 2 * r_market exactly,
        # beta = cov(2r, r) / var(r) = 2.
        market_returns = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02, -0.005, 0.012, -0.018, 0.008]
        market = prices_from_returns(market_returns)
        asset = prices_from_returns([2 * r for r in market_returns])
        assert calculate_beta(asset, market) == pytest.approx(2.0)

    def test_an_asset_measured_against_itself_has_beta_one(self):
        series = wiggly_prices()
        assert calculate_beta(series, series) == pytest.approx(1.0)

    def test_an_inversely_moving_asset_has_negative_beta(self):
        # A negative beta is a real, reportable state -- see the beta_band tests.
        market_returns = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02, -0.005, 0.012]
        market = prices_from_returns(market_returns)
        inverse = prices_from_returns([-r for r in market_returns])
        assert calculate_beta(inverse, market) == pytest.approx(-1.0)

    def test_a_flat_market_falls_back_to_one(self):
        assert calculate_beta(wiggly_prices(), pd.Series([100.0] * 60)) == 1.0

    @pytest.mark.parametrize(
        "asset,market",
        [
            (None, pd.Series([100.0, 101.0])),
            (pd.Series([100.0, 101.0]), pd.DataFrame({"a": [1.0], "b": [2.0]})),
            (pd.Series([100.0]), pd.Series([100.0])),
        ],
    )
    def test_unusable_inputs_fall_back_to_one_not_none(self, asset, market):
        # Beta is the only Stage-A metric whose failure value is 1.0 rather than
        # None, because profile_fit reads it: `None` would mean "no constraint".
        assert calculate_beta(asset, market) == 1.0

    @pytest.mark.filterwarnings("ignore::RuntimeWarning")
    def test_misaligned_indexes_are_intersected_not_silently_zipped(self):
        market = pd.Series([100.0, 101.0, 102.0, 103.0], index=[0, 1, 2, 3])
        asset = pd.Series([50.0, 50.5, 51.0, 51.5], index=[2, 3, 4, 5])
        # Only indexes 2 and 3 overlap, leaving a single aligned return. Sample
        # variance over one observation is undefined, and the NaN guard catches
        # it -- rather than the two series being zipped positionally, which would
        # silently compute a beta against the wrong dates.
        assert calculate_beta(asset, market) == 1.0


# ═════════════════════════════════════════════════════════════════════════════
# Stage A — volatility and trailing return
# ═════════════════════════════════════════════════════════════════════════════

class TestVolatility:
    def test_a_flat_series_has_zero_volatility(self):
        assert calculate_volatility(pd.Series([100.0] * 30)) == pytest.approx(0.0)

    @pytest.mark.parametrize("prices", [pd.Series([100.0]), pd.Series([100.0, 101.0])])
    def test_too_few_returns_give_none(self, prices):
        assert calculate_volatility(prices) is None

    def test_matches_an_independent_annualised_standard_deviation(self):
        returns = [0.01, -0.02, 0.015, 0.005, -0.01]
        expected = statistics.stdev(returns) * math.sqrt(252)
        assert calculate_volatility(prices_from_returns(returns)) == pytest.approx(expected)

    def test_a_noisier_series_is_more_volatile(self):
        rng = np.random.default_rng(11)
        calm = prices_from_returns(rng.normal(0, 0.005, 100))
        wild = prices_from_returns(rng.normal(0, 0.040, 100))
        assert calculate_volatility(wild) > calculate_volatility(calm)


class TestTrailingReturn:
    def test_total_return_over_the_window(self):
        assert calculate_trailing_return(pd.Series([100.0, 120.0, 150.0])) == pytest.approx(0.5)
        assert calculate_trailing_return(pd.Series([100.0, 50.0])) == pytest.approx(-0.5)

    def test_it_reads_the_endpoints_not_the_path(self):
        # A plain fact about the window, not a forecast.
        assert calculate_trailing_return(
            pd.Series([100.0, 500.0, 3.0, 110.0])
        ) == pytest.approx(0.1)

    def test_leading_nulls_are_dropped_before_the_endpoints_are_taken(self):
        assert calculate_trailing_return(
            pd.Series([float("nan"), 100.0, 110.0])
        ) == pytest.approx(0.1)

    @pytest.mark.parametrize(
        "prices",
        [pd.Series([100.0]), pd.Series([], dtype=float), pd.Series([0.0, 100.0])],
    )
    def test_undefined_cases_return_none(self, prices):
        assert calculate_trailing_return(prices) is None


# ═════════════════════════════════════════════════════════════════════════════
# Context bands — definitional, non-monotonic
# ═════════════════════════════════════════════════════════════════════════════

class TestRSIBand:
    @pytest.mark.parametrize(
        "rsi,expected",
        [
            (None, None), (0.0, "oversold"), (29.99, "oversold"),
            (30.0, "neutral"), (50.0, "neutral"), (70.0, "neutral"),
            (70.01, "overbought"), (100.0, "overbought"),
        ],
    )
    def test_boundaries(self, rsi, expected):
        assert _rsi_band(rsi) == expected


class TestBetaBand:
    @pytest.mark.parametrize(
        "beta,expected",
        [
            (None, None),
            (-2.0, "inverse"), (-0.29, "inverse"), (-0.0001, "inverse"),
            (0.0, "low"), (0.5, "low"), (0.79, "low"),
            (0.8, "market"), (1.0, "market"), (1.2, "market"),
            (1.21, "high"), (3.0, "high"),
        ],
    )
    def test_boundaries(self, beta, expected):
        assert _beta_band(beta) == expected

    def test_a_negative_beta_is_never_labelled_low(self):
        # REGRESSION GUARD: observed live, DUK at beta -0.29 was labelled "low".
        # A band is definitional -- true by convention -- so a band that states
        # something factually untrue breaks the premise of the whole mechanism.
        for beta in (-0.01, -0.29, -1.0, -5.0):
            assert _beta_band(beta) == "inverse"


# ═════════════════════════════════════════════════════════════════════════════
# Stage B — percentile ranking
# ═════════════════════════════════════════════════════════════════════════════

class TestPercentileRank:
    def test_empty_input(self):
        assert _percentile_rank({}) == {}

    def test_all_null_input_stays_null(self):
        assert _percentile_rank({"A": None, "B": None}) == {"A": None, "B": None}

    def test_evenly_spaced_values_map_onto_even_percentiles(self):
        assert _percentile_rank({"A": 1.0, "B": 2.0, "C": 3.0, "D": 4.0}) == {
            "A": 25.0, "B": 50.0, "C": 75.0, "D": 100.0,
        }

    def test_the_largest_value_is_the_hundredth_percentile(self):
        result = _percentile_rank({"A": -5.0, "B": 0.0, "C": 99.0})
        assert result["C"] == 100.0

    def test_ties_share_an_averaged_percentile(self):
        assert _percentile_rank({"A": 1.0, "B": 1.0, "C": 2.0}) == {
            "A": 50.0, "B": 50.0, "C": 100.0,
        }

    def test_a_lone_value_is_the_hundredth_percentile(self):
        assert _percentile_rank({"A": 0.3}) == {"A": 100.0}

    def test_nulls_are_excluded_from_the_ranking_but_kept_in_the_result(self):
        # A ticker we could not measure must not be scored as if it came last.
        result = _percentile_rank({"A": 1.0, "B": None, "C": 2.0})
        assert result == {"A": 50.0, "B": None, "C": 100.0}

    def test_nan_is_treated_as_absent(self):
        result = _percentile_rank({"A": 1.0, "B": float("nan"), "C": 2.0})
        assert result["B"] is None
        assert result["A"] == 50.0

    def test_percentiles_are_rounded_to_one_decimal(self):
        result = _percentile_rank({f"T{i}": float(i) for i in range(3)})
        for value in result.values():
            assert round(value, 1) == value

    def test_ranking_is_order_preserving(self):
        values = {"A": 3.0, "B": 1.0, "C": 2.0}
        result = _percentile_rank(values)
        assert result["B"] < result["C"] < result["A"]


class TestMeanOfPresent:
    def test_all_absent_gives_none(self):
        assert _mean_of_present(None, None) is None
        assert _mean_of_present() is None

    def test_absent_values_are_skipped_not_counted_as_zero(self):
        assert _mean_of_present(80.0, None) == 80.0

    def test_mean_of_what_is_there(self):
        assert _mean_of_present(80.0, 60.0) == 70.0
        assert _mean_of_present(10.0, 20.0, 30.0) == 20.0

    def test_rounded_to_one_decimal(self):
        assert _mean_of_present(1.0, 2.0) == 1.5
        assert _mean_of_present(1.0, 1.0, 2.0) == 1.3


# ═════════════════════════════════════════════════════════════════════════════
# Stage B — score_universe
#
# This is the engine PR #16 silently reverted on main.
# ═════════════════════════════════════════════════════════════════════════════

class TestScoreUniverse:
    def test_a_full_universe_is_normalised_cross_sectionally(self):
        scored = score_universe(universe(qa.QUANT_MIN_UNIVERSE))
        assert all(row["quant_normalisation"] == "cross_sectional" for row in scored.values())

    def test_every_input_ticker_appears_in_the_output(self):
        raws = universe(12)
        scored = score_universe(raws)
        assert set(scored) == set(raws)

    def test_the_three_subdimensions_are_populated(self):
        scored = score_universe(universe(12))
        for row in scored.values():
            subs = row["sub_dimensions"]
            assert set(subs) == {"momentum", "risk_adjusted_return", "stability"}
            assert all(v is not None for v in subs.values())

    def test_risk_adjusted_return_is_the_sharpe_percentile(self):
        scored = score_universe(universe(10))
        # sharpe rises with the ticker index, so T09 is top and T00 bottom.
        assert scored["T09"]["sub_dimensions"]["risk_adjusted_return"] == 100.0
        assert scored["T00"]["sub_dimensions"]["risk_adjusted_return"] == 10.0

    def test_momentum_is_the_mean_of_the_macd_and_trailing_return_percentiles(self):
        scored = score_universe(universe(10))
        for ticker, row in scored.items():
            pct = row["percentiles"]
            assert row["sub_dimensions"]["momentum"] == pytest.approx(
                _mean_of_present(pct["macd_histogram"], pct["trailing_return"])
            )

    def test_stability_ranks_low_volatility_highest(self):
        # INVARIANT: stability is the percentile of NEGATED volatility. Getting
        # this sign wrong would rank the most erratic names as the most stable,
        # and nothing downstream would notice.
        raws = universe(10)
        scored = score_universe(raws)
        calmest = min(raws, key=lambda t: raws[t]["volatility"])
        wildest = max(raws, key=lambda t: raws[t]["volatility"])
        assert scored[calmest]["sub_dimensions"]["stability"] == 100.0
        assert scored[wildest]["sub_dimensions"]["stability"] == 10.0

    def test_bands_are_attached_from_the_raw_facts(self):
        raws = universe(10)
        raws["T00"]["rsi"] = 12.0
        raws["T00"]["beta"] = -0.29
        scored = score_universe(raws)
        assert scored["T00"]["bands"] == {"rsi": "oversold", "beta": "inverse"}

    def test_percentiles_are_disclosed_alongside_the_subdimensions(self):
        # The product promise is disclosure: the UI must be able to say why an
        # asset placed where it did.
        scored = score_universe(universe(10))
        assert set(scored["T00"]["percentiles"]) == {
            "sharpe_ratio", "trailing_return", "macd_histogram", "volatility",
        }

    # ── small-universe guard ────────────────────────────────────────────────

    def test_a_small_universe_refuses_to_invent_percentiles(self):
        scored = score_universe(universe(qa.QUANT_MIN_UNIVERSE - 1))
        for row in scored.values():
            assert row["quant_normalisation"] == "insufficient_universe"
            assert row["sub_dimensions"] == {
                "momentum": None, "risk_adjusted_return": None, "stability": None,
            }
            assert row["percentiles"] == {}

    def test_a_small_universe_still_reports_the_raw_facts_as_bands(self):
        # Withhold the ranks, keep the facts -- the states must stay
        # distinguishable downstream (ranking.quant_lean depends on this).
        raws = universe(3)
        raws["T00"]["rsi"] = 85.0
        raws["T00"]["beta"] = 1.9
        scored = score_universe(raws)
        assert scored["T00"]["bands"] == {"rsi": "overbought", "beta": "high"}

    def test_the_threshold_is_exact(self):
        assert score_universe(universe(qa.QUANT_MIN_UNIVERSE))["T00"][
            "quant_normalisation"] == "cross_sectional"
        assert score_universe(universe(qa.QUANT_MIN_UNIVERSE - 1))["T00"][
            "quant_normalisation"] == "insufficient_universe"

    def test_only_measurable_tickers_count_toward_the_threshold(self):
        # "Measured" means a non-null Sharpe. Padding the universe with rows that
        # failed to fetch must not unlock cross-sectional ranking.
        raws = universe(qa.QUANT_MIN_UNIVERSE - 1)
        for i in range(5):
            ticker = f"DEAD{i}"
            raws[ticker] = raw(ticker, sharpe=None, volatility=None,
                               trailing_return=None, macd_histogram=None)
        scored = score_universe(raws)
        assert all(r["quant_normalisation"] == "insufficient_universe" for r in scored.values())

    def test_an_unmeasurable_ticker_inside_a_full_universe_keeps_null_subdimensions(self):
        raws = universe(qa.QUANT_MIN_UNIVERSE)
        raws["DEAD"] = raw("DEAD", sharpe=None, volatility=None,
                           trailing_return=None, macd_histogram=None, rsi=None, beta=None)
        scored = score_universe(raws)
        assert scored["DEAD"]["quant_normalisation"] == "cross_sectional"
        assert scored["DEAD"]["sub_dimensions"] == {
            "momentum": None, "risk_adjusted_return": None, "stability": None,
        }
        assert scored["DEAD"]["bands"] == {"rsi": None, "beta": None}
        # The measurable names are unaffected by its presence.
        assert scored["T09"]["sub_dimensions"]["risk_adjusted_return"] == 100.0

    def test_an_empty_universe_does_not_crash(self):
        assert score_universe({}) == {}


# ═════════════════════════════════════════════════════════════════════════════
# Stage A entry point
# ═════════════════════════════════════════════════════════════════════════════

class TestComputeRawMetrics:
    def test_returns_the_documented_shape(self):
        frame = pd.DataFrame({"Close": wiggly_prices()})
        result = compute_raw_metrics("NVDA", frame, spy_close=wiggly_prices(seed=99))
        assert set(result) == {
            "ticker", "rsi", "macd", "macd_histogram", "sharpe_ratio",
            "beta", "volatility", "trailing_return", "data_points",
        }
        assert result["ticker"] == "NVDA"

    def test_data_points_counts_the_rows_actually_fetched(self):
        # ranking.data_sufficiency divides by this, so an inflated count would
        # overstate how much evidence a candidate has.
        frame = pd.DataFrame({"Close": wiggly_prices(n=42)})
        result = compute_raw_metrics("T", frame, spy_close=wiggly_prices(seed=2))
        assert result["data_points"] == 43  # n returns -> n + 1 prices

    def test_the_shared_spy_series_is_used_instead_of_a_per_ticker_download(self, monkeypatch):
        # REGRESSION GUARD: beta falls back to fetch_spy_close() when the shared
        # series is not passed. Losing the shared series turns one benchmark
        # download into one per ticker -- slow, rate-limited, and invisible in
        # the output. Any network call here is a hard failure.
        def explode(*args, **kwargs):
            raise AssertionError("compute_raw_metrics attempted a network download")

        monkeypatch.setattr(qa.yf, "download", explode)
        frame = pd.DataFrame({"Close": wiggly_prices()})
        result = compute_raw_metrics("T", frame, spy_close=wiggly_prices(seed=5))
        assert result["beta"] is not None

    def test_a_short_series_yields_nulls_rather_than_raising(self):
        frame = pd.DataFrame({"Close": [100.0, 101.0, 102.0]})
        result = compute_raw_metrics("T", frame, spy_close=pd.Series([100.0, 101.0, 102.0]))
        assert result["rsi"] is None
        assert result["macd"] is None
        assert result["macd_histogram"] is None
        assert result["data_points"] == 3


# ═════════════════════════════════════════════════════════════════════════════
# Legacy composite — the deprecated "buy-o-meter"
#
# Pinned, not endorsed. The orchestrator's unified_score still reads
# raw_quant_score, and PR #16 showed that a silent change here goes unnoticed.
# ═════════════════════════════════════════════════════════════════════════════

class TestLegacyScoreQuantMetrics:
    def test_no_inputs_leave_the_neutral_baseline(self):
        assert score_quant_metrics(None, None, None, None, None) == 50

    def test_the_result_is_clamped_to_0_100(self):
        best = score_quant_metrics(25.0, {"signal": "bullish_crossover"}, 1.5, 0.5, 0.10)
        worst = score_quant_metrics(80.0, {"signal": "bearish_crossover"}, 0.0, 2.0, 0.50)
        assert best == 100
        assert worst == 10
        assert 0 <= best <= 100 and 0 <= worst <= 100

    @pytest.mark.parametrize(
        "rsi,expected",
        [(25.0, 65), (40.0, 55), (60.0, 60), (80.0, 40)],
    )
    def test_the_rsi_ladder_is_not_monotonic(self, rsi, expected):
        # PINNED QUIRK: the 30-50 band scores +5 but the 50-70 band scores +10,
        # so "less oversold" can score higher. This is exactly the kind of covert
        # verdict the unified ranking replaces; it is pinned only because the
        # orchestrator still reads it.
        assert score_quant_metrics(rsi, None, None, None, None) == expected

    def test_each_factor_is_independent_and_additive(self):
        base = score_quant_metrics(None, None, None, None, None)
        assert score_quant_metrics(None, {"signal": "bullish_crossover"}, None, None, None) == base + 20
        assert score_quant_metrics(None, {"signal": "bearish_crossover"}, None, None, None) == base - 10
        assert score_quant_metrics(None, None, 1.5, None, None) == base + 15
        assert score_quant_metrics(None, None, None, 0.5, None) == base + 10
        assert score_quant_metrics(None, None, None, None, 0.10) == base + 10
