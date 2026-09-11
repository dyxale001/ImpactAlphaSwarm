"""Writing a run's ranked assets into ``ai_recommendation``.

Split out of ``supabase_client.save_top_assets``, which built its rows in a single
loop that made one Supabase round trip and one yfinance call per ticker. That cost
about three seconds an asset, measured, and it is the reason showing the whole
ranked feed was parked once already: thirty assets spent ninety seconds here, and
the insert that followed was large enough that Supabase dropped the connection and
the retry silently stored the run without its ranking-v2 columns.

Nothing is cached that was not cached before. The per-ticker work is *batched* --
one query for every asset id, one for the carried-forward news, and the price
fetches run concurrently rather than single file. Each price is still a live
lookup: ``ZarPriceConverter`` deliberately never caches a price, because that is
the number being recorded.
"""

from __future__ import annotations

import datetime
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from .gr_reasoningtracestyle import HOUSE_STYLE


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class RecommendationWriteConfig:
    """Immutable settings for one write. Every field maps to an env var."""

    # Rows per insert request. A row carries full news_articles and social_posts
    # JSON, so thirty of them in one request is what dropped the connection.
    insert_chunk_size: int = 10
    # Concurrent yfinance price lookups. Yahoo answers cloud IPs slowly and the
    # calls are pure I/O, so the width buys almost linear speedup.
    price_workers: int = 8
    # Bound on the batched carry-forward news query. The table holds roughly one
    # run per user at a time (create_ai_run clears the previous run's rows), so
    # this is far above what a lookup over one run's assets can return.
    prior_news_row_cap: int = 500

    @classmethod
    def from_env(cls) -> "RecommendationWriteConfig":
        return cls(
            insert_chunk_size=_env_int("REC_INSERT_CHUNK_SIZE", 10),
            price_workers=_env_int("REC_PRICE_WORKERS", 8),
            prior_news_row_cap=_env_int("REC_PRIOR_NEWS_ROW_CAP", 500),
        )


class RecommendationWriter:
    """Persists the ranked assets of one run for one user.

    Collaborators are constructor arguments so a test can pass fakes; both
    default to the production singletons in ``supabase_client``. They are
    imported lazily because that module owns this one's wrapper function.
    """

    def __init__(
        self,
        client: Any = None,
        prices: Any = None,
        config: Optional[RecommendationWriteConfig] = None,
    ) -> None:
        from .supabase_client import supabase, zar_prices

        self._client = supabase if client is None else client
        self._prices = zar_prices if prices is None else prices
        self._config = config or RecommendationWriteConfig.from_env()

    # -- public ------------------------------------------------------------

    def write(
        self,
        run_id: str,
        user_id: str,
        assets: List[Dict[str, Any]],
        quant_results: Dict[str, Dict[str, Any]],
        sentiment_results: Dict[str, Dict[str, Any]],
        price_cache: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Replace this run's rows with ``assets``, ranked by list position.

        ``user_id`` is accepted for call-site compatibility; the rows key on
        ``run_id``, which already belongs to exactly one user.
        """
        ranked = [asset for asset in assets if asset.get("ticker")]
        if not ranked:
            return {"status": "no_rows"}

        tickers = [asset["ticker"] for asset in ranked]

        # Three batched gathers up front, replacing three per-ticker round trips.
        asset_ids = self._asset_ids(tickers)
        prices = self._prices_for(tickers, price_cache)
        prior_news = self._prior_news_for(ranked, sentiment_results, asset_ids)

        now = datetime.datetime.utcnow().isoformat()
        rows = []
        for rank, asset in enumerate(ranked, start=1):
            ticker = asset["ticker"]
            asset_id = asset_ids.get(ticker)
            if not asset_id:
                print(f"Skipping {ticker}: no asset id could be resolved")
                continue
            rows.append(
                self._row(
                    rank=rank,
                    asset=asset,
                    asset_id=asset_id,
                    run_id=run_id,
                    now=now,
                    quant=quant_results.get(ticker, {}),
                    sentiment=sentiment_results.get(ticker, {}),
                    price_at_run=prices.get(ticker),
                    prior=prior_news.get(asset_id),
                )
            )

        if not rows:
            # Every ranked ticker failed asset resolution (a batch of watchlist
            # tickers with no assets row, say). That is a failed save, not the
            # benign "nothing to save" case above: nothing was cleared or written,
            # so the previous run's rows still sit under this run_id and the
            # caller must not report the run complete.
            return {"status": "resolution_failed", "requested": len(ranked)}

        result = self._insert(run_id, rows)
        # Counts let the caller tell a full save from a partial one (some tickers
        # skipped for lack of a resolvable asset) without re-deriving it.
        result.update(requested=len(ranked), saved=len(rows))
        return result

    # -- batched gathers ---------------------------------------------------

    def _asset_ids(self, tickers: Sequence[str]) -> Dict[str, str]:
        """Ticker to asset id for every ticker, creating rows for new names.

        One select for the whole set plus one insert for the misses, where the
        old path made a round trip per ticker. An asset id is an immutable
        primary key, so reusing it within a write is not staleness.
        """
        unique = list(dict.fromkeys(tickers))
        found: Dict[str, str] = {}

        try:
            resp = (
                self._client.table("assets")
                .select("id,ticker")
                .in_("ticker", unique)
                .execute()
            )
            for row in resp.data or []:
                if row.get("ticker") and row.get("id"):
                    found[row["ticker"]] = row["id"]
        except Exception as e:
            print(f"Batched asset id lookup failed ({e}); falling back per ticker")
            return self._asset_ids_individually(unique)

        missing = [ticker for ticker in unique if ticker not in found]
        if not missing:
            return found

        try:
            resp = (
                self._client.table("assets")
                .insert([{"ticker": ticker, "name": ticker} for ticker in missing])
                .execute()
            )
            for row in resp.data or []:
                if row.get("ticker") and row.get("id"):
                    found[row["ticker"]] = row["id"]
        except Exception as e:
            print(f"Batched asset insert failed ({e}); falling back per ticker")
            found.update(self._asset_ids_individually(missing))

        return found

    def _asset_ids_individually(self, tickers: Sequence[str]) -> Dict[str, str]:
        """The original one-at-a-time path, kept as the fallback."""
        from .supabase_client import get_or_create_asset_id

        resolved: Dict[str, str] = {}
        for ticker in tickers:
            asset_id = get_or_create_asset_id(ticker)
            if asset_id:
                resolved[ticker] = asset_id
        return resolved

    def _prices_for(
        self, tickers: Sequence[str], price_cache: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Live rand prices for every ticker, fetched concurrently.

        ``price_cache`` is the caller's own dict, used by the nightly to stop
        overlapping tickers costing one lookup per user within a single batch. It
        does not outlive that batch, and the manual path passes none at all.
        """
        unique = list(dict.fromkeys(tickers))
        resolved: Dict[str, Any] = {}
        pending: List[str] = []

        for ticker in unique:
            if price_cache is not None and ticker in price_cache:
                resolved[ticker] = price_cache[ticker]
            else:
                pending.append(ticker)

        if not pending:
            return resolved

        # Warm the shared USD/ZAR rate before fanning out. Every worker needs it
        # and its cache is empty at this point, so without this the whole pool
        # misses at once and pays for the same rate lookup N times over.
        try:
            self._prices.fx_rate("USD")
        except Exception:
            pass

        workers = max(1, min(self._config.price_workers, len(pending)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for ticker, price in zip(pending, pool.map(self._price_of, pending)):
                resolved[ticker] = price
                if price_cache is not None:
                    price_cache[ticker] = price

        return resolved

    def _price_of(self, ticker: str) -> Optional[float]:
        try:
            return self._prices.price_in_zar(ticker)
        except Exception as e:
            print(f"Failed to fetch price for {ticker}: {e}")
            return None

    def _prior_news_for(
        self,
        ranked: List[Dict[str, Any]],
        sentiment_results: Dict[str, Dict[str, Any]],
        asset_ids: Dict[str, str],
    ) -> Dict[str, Dict[str, Any]]:
        """Last good news, for only those assets this run found none for.

        Same rule as before -- a transient Finnhub failure must not blank out an
        asset's news until the next nightly -- but resolved in one query for the
        whole run instead of one per empty asset.
        """
        empty_ids = []
        for asset in ranked:
            sentiment = sentiment_results.get(asset["ticker"], {})
            if int(sentiment.get("news_count") or 0) == 0 and not (
                sentiment.get("news_articles") or []
            ):
                asset_id = asset_ids.get(asset["ticker"])
                if asset_id:
                    empty_ids.append(asset_id)

        if not empty_ids:
            return {}

        ids = list(dict.fromkeys(empty_ids))
        try:
            resp = (
                self._client.table("ai_recommendation")
                .select(
                    "asset_id,news_articles,news_count,"
                    "news_sentiment_score,news_bullish,news_bearish"
                )
                .in_("asset_id", ids)
                .gt("news_count", 0)
                .order("created_at", desc=True)
                .limit(self._config.prior_news_row_cap)
                .execute()
            )
        except Exception as e:
            print(f"Batched prior-news lookup failed ({e}); falling back per asset")
            return self._prior_news_individually(ids)

        # Rows arrive newest first, so the first sighting of an asset is its most
        # recent one -- the same row the per-asset query used to return.
        latest: Dict[str, Dict[str, Any]] = {}
        for row in resp.data or []:
            asset_id = row.get("asset_id")
            if asset_id and asset_id not in latest:
                latest[asset_id] = row
        return latest

    def _prior_news_individually(self, ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
        from .supabase_client import get_last_news_for_asset

        latest: Dict[str, Dict[str, Any]] = {}
        for asset_id in ids:
            prior = get_last_news_for_asset(asset_id)
            if prior:
                latest[asset_id] = prior
        return latest

    # -- row construction --------------------------------------------------

    def _row(
        self,
        rank: int,
        asset: Dict[str, Any],
        asset_id: str,
        run_id: str,
        now: str,
        quant: Dict[str, Any],
        sentiment: Dict[str, Any],
        price_at_run: Optional[float],
        prior: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        from .supabase_client import RANKING_V2_COLUMNS

        news = self._news_fields(sentiment, prior)

        row = {
            "asset_id": asset_id,
            "sentiment_score": int(
                sentiment.get("sentiment_score") or asset.get("sentiment_score") or 0
            ),
            "confidence_score": float(asset.get("unified_score") or 0),
            # Normalised on the way in as well as where it is generated, so a trace
            # written by any other path still lands in house style (no dash used as
            # punctuation).
            "reasoning_trace": HOUSE_STYLE.apply(asset.get("reasoning") or ""),
            "hype_penalty": int(asset.get("adjustments", {}).get("hype_penalty", 0)),
            "created_at": now,
            "run_id": run_id,
            "rank": rank,
            "price_at_run": price_at_run,
            "quant_score": int(asset.get("quant_score") or 0),
            "beta": float(quant.get("beta")) if quant.get("beta") is not None else None,
            "risk_penalty": int(asset.get("adjustments", {}).get("risk_penalty", 0)),
            "macd": quant.get("macd"),
            "macd_histogram": quant.get("macd_histogram"),
            "rsi": quant.get("rsi"),
            "sharpe_ratio": quant.get("sharpe_ratio"),
            "volatility": quant.get("volatility"),
            # Objective cross-sectional quant sub-dimensions + context bands
            # (see migrations/004). Null when the candidate universe was too
            # small to rank (quant_normalisation = 'insufficient_universe').
            "momentum_pctile": (quant.get("sub_dimensions") or {}).get("momentum"),
            "risk_adj_pctile": (quant.get("sub_dimensions") or {}).get(
                "risk_adjusted_return"
            ),
            "stability_pctile": (quant.get("sub_dimensions") or {}).get("stability"),
            "rsi_band": (quant.get("bands") or {}).get("rsi"),
            "beta_band": (quant.get("bands") or {}).get("beta"),
            "quant_normalisation": quant.get("quant_normalisation"),
            "sources": self._source_labels(sentiment.get("sources")),
            "bullish_posts": int(sentiment.get("bullish_posts") or 0),
            "bearish_posts": int(sentiment.get("bearish_posts") or 0),
            # News sub-signal (blended into sentiment_score, weighted higher than
            # social). Defaults to the blended score / 0 when no news was found.
            "news_sentiment_score": int(
                news["news_sentiment_score"]
                if news["news_sentiment_score"] is not None
                else (sentiment.get("sentiment_score") or 0)
            ),
            "social_sentiment_score": int(
                sentiment.get("social_sentiment_score")
                or sentiment.get("sentiment_score")
                or 0
            ),
            "news_count": news["news_count"],
            "news_bullish": news["news_bullish"],
            "news_bearish": news["news_bearish"],
            # Per-article transparency list: publisher, tier, date, headline, link.
            "news_articles": news["news_articles"],
            # Per-post transparency list: author, date, text, link, sentiment.
            #
            # Capped, because this row already carries every news article as JSON and
            # its insert is at the edge of what Supabase accepts: a ~30 row insert has
            # been seen to fail with "Server disconnected" and silently retry without
            # the ranking v2 columns, which is why _insert_chunks exists at all. The
            # asset card only ever rendered five posts, and the full per-day lists now
            # live on social_sentiment_daily, so keeping more here would grow the row
            # that is already breaking to feed a view nothing reads.
            "social_posts": self._top_social_posts(sentiment.get("social_posts")),
        }

        # Unified ranking v2 terms (migration 010), present only when the ranking
        # module ran. Written for disclosure: the UI and the reasoning trace need
        # to say WHY an asset placed where it did, not just where.
        for key in RANKING_V2_COLUMNS:
            if key in asset:
                row[key] = asset[key]

        return row

    @staticmethod
    def _news_fields(
        sentiment: Dict[str, Any], prior: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """This run's news, or the last good news when this run found none."""
        news_articles = sentiment.get("news_articles") or []
        news_count = int(sentiment.get("news_count") or 0)

        if news_count == 0 and not news_articles and prior:
            return {
                "news_articles": prior.get("news_articles") or [],
                "news_count": int(prior.get("news_count") or 0),
                "news_sentiment_score": prior.get("news_sentiment_score"),
                "news_bullish": int(prior.get("news_bullish") or 0),
                "news_bearish": int(prior.get("news_bearish") or 0),
            }

        return {
            "news_articles": news_articles,
            "news_count": news_count,
            "news_sentiment_score": sentiment.get("news_sentiment_score"),
            "news_bullish": int(sentiment.get("news_bullish") or 0),
            "news_bearish": int(sentiment.get("news_bearish") or 0),
        }

    @staticmethod
    def _top_social_posts(posts: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """The most influential posts, for the asset card's preview list.

        The number comes from SentimentConfig so it sits with the other social settings
        rather than as a bare literal here, and it is read per call so an env override
        takes effect without a restart of anything that imported this module early.

        Sorted by influence rather than truncated in place: the payload arrives newest
        first, so a plain slice would keep the most recent posts rather than the ones
        that actually moved the score.
        """
        if not posts:
            return []
        from .ss_config import SentimentConfig

        keep = SentimentConfig.from_env().social_recommendation_posts
        if len(posts) <= keep:
            return posts
        return sorted(posts, key=lambda p: p.get("influence") or 0, reverse=True)[:keep]

    @staticmethod
    def _source_labels(raw_sources: Any) -> Optional[str]:
        """Display names for each signal source, news first since it weighs more."""
        if not isinstance(raw_sources, dict):
            return raw_sources if raw_sources not in ("", []) else None

        source_labels = {"finnhub": "News", "stocktwits": "Stocktwits"}
        present = [
            source_labels[key]
            for key in ("finnhub", "stocktwits")
            if raw_sources.get(key)
        ]
        # Include any other present sources not in the ordered list above.
        present.extend(
            key.capitalize()
            for key, value in raw_sources.items()
            if value and key not in source_labels
        )
        return ", ".join(present) if present else None

    # -- persistence -------------------------------------------------------

    def _insert(self, run_id: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        from .supabase_client import RANKING_V2_COLUMNS

        self._clear(run_id)

        has_v2 = any(key in row for row in rows for key in RANKING_V2_COLUMNS)
        try:
            return {"status": "inserted", "response": self._insert_chunks(rows)}
        except Exception as e:
            # Most likely migration 010 has not been applied yet, so the v2
            # columns don't exist. The recommendations themselves matter far more
            # than the disclosure fields, so drop those and retry.
            if not has_v2:
                raise
            print(f"Insert with ranking v2 columns failed ({e}); retrying without them")

        # Chunking means some rows may already have landed. Clear the run and
        # reinsert the whole set, so a run is never stored half with
        # signal_strength and half without -- a mix the frontend cannot reason
        # about, since it decides per row whether the scorecard is renderable.
        self._clear(run_id)
        legacy_rows = [
            {k: v for k, v in row.items() if k not in RANKING_V2_COLUMNS}
            for row in rows
        ]
        return {
            "status": "inserted_without_v2",
            "response": self._insert_chunks(legacy_rows),
        }

    def _clear(self, run_id: str) -> None:
        """Make the write idempotent for this run.

        create_ai_run clears the PREVIOUS run's rows, but two analyses for the
        same user can race (observed 26ms apart: both deletes landed before
        either insert, leaving two full sets under one run_id). Duplicates then
        broke the asset page, whose single-row lookup errors on multiple matches.
        Clearing here means the last writer wins, whatever the ordering.
        """
        try:
            self._client.table("ai_recommendation").delete().eq(
                "run_id", run_id
            ).execute()
        except Exception as e:
            print(f"Warning: could not clear existing rows for run {run_id}: {e}")

    def _insert_chunks(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Insert in batches. One request for thirty rows, each carrying full
        news and social JSON, is large enough that Supabase drops the
        connection."""
        size = max(1, self._config.insert_chunk_size)
        inserted: List[Dict[str, Any]] = []
        for start in range(0, len(rows), size):
            resp = (
                self._client.table("ai_recommendation")
                .insert(rows[start : start + size])
                .execute()
            )
            inserted.extend(resp.data or [])
        return inserted
