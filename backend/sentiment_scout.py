"""
Sentiment Scout Worker Module

Purpose: Collect social mentions from Reddit and Telegram, score them with VADER
and optional Transformers, and produce a unified Raw Sentiment Score (0-100).

The worker is designed to run safely when API credentials or optional libraries are
not available. In that case, it returns neutral scores with no collected posts.
"""

from __future__ import annotations

import asyncio
import os
import re
import warnings
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

warnings.filterwarnings("ignore")

try:
    import praw
except ImportError:  # pragma: no cover
    praw = None

try:
    from telethon import TelegramClient
except ImportError:  # pragma: no cover
    TelegramClient = None

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except ImportError:  # pragma: no cover
    SentimentIntensityAnalyzer = None

try:
    from transformers import pipeline as hf_pipeline
except ImportError:  # pragma: no cover
    hf_pipeline = None

try:
    import cloudscraper
except ImportError:  # pragma: no cover
    cloudscraper = None

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None


@dataclass(frozen=True)
class SocialMention:
    ticker: str
    text: str
    source: str
    url: str | None = None
    engagement: int = 0
    created_at: str | None = None


def _normalize_tickers(tickers: list[str]) -> list[str]:
    return sorted({ticker.upper().strip() for ticker in tickers if ticker and ticker.strip()})


def _clean_text(text: str) -> str:
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\$[A-Za-z][A-Za-z0-9_.-]*", " ", text)
    text = re.sub(r"[^\w\s'.-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


@lru_cache(maxsize=1)
def _get_vader_analyzer():
    if SentimentIntensityAnalyzer is None:
        return None
    return SentimentIntensityAnalyzer()


@lru_cache(maxsize=1)
def _get_transformer_pipeline():
    if hf_pipeline is None:
        return None

    model_name = os.getenv("SENTIMENT_TRANSFORMER_MODEL", "distilbert-base-uncased-finetuned-sst-2-english")
    try:
        return hf_pipeline("sentiment-analysis", model=model_name)
    except Exception:
        return None


def _score_with_vader(text: str) -> float:
    analyzer = _get_vader_analyzer()
    if analyzer is None:
        return 0.0
    return float(analyzer.polarity_scores(text)["compound"])


def _score_with_transformer(text: str) -> float | None:
    classifier = _get_transformer_pipeline()
    if classifier is None:
        return None

    try:
        result = classifier(text[:512])
        if not result:
            return None

        top = result[0]
        label = str(top.get("label", "")).upper()
        score = float(top.get("score", 0.0))
        signed = score if "POS" in label else -score if "NEG" in label else 0.0
        return max(-1.0, min(1.0, signed))
    except Exception:
        return None


def _combine_scores(vader_score: float, transformer_score: float | None) -> float:
    if transformer_score is None:
        return vader_score
    return (0.60 * vader_score) + (0.40 * transformer_score)


def _mention_sentiment(text: str) -> float:
    cleaned = _clean_text(text)
    vader_score = _score_with_vader(cleaned)
    transformer_score = _score_with_transformer(cleaned)
    return _combine_scores(vader_score, transformer_score)


def _score_mentions(mentions: list[SocialMention]) -> dict[str, Any]:
    if not mentions:
        return {
            "sentiment_score": 50,
            "bullish_posts": 0,
            "bearish_posts": 0,
            "top_posts": [],
            "mention_count": 0,
        }

    scored_mentions: list[dict[str, Any]] = []
    bullish_posts = 0
    bearish_posts = 0

    for mention in mentions:
        signed_score = _mention_sentiment(mention.text)
        if signed_score >= 0.05:
            bullish_posts += 1
        elif signed_score <= -0.05:
            bearish_posts += 1

        scored_mentions.append(
            {
                "text": mention.text,
                "source": mention.source,
                "url": mention.url,
                "engagement": mention.engagement,
                "sentiment_raw": round(signed_score, 4),
                "sentiment_contribution": round((signed_score + 1) * 50, 2),
            }
        )

    average_signed = sum(item["sentiment_raw"] for item in scored_mentions) / len(scored_mentions)
    sentiment_score = int(round(max(0.0, min(1.0, (average_signed + 1.0) / 2.0)) * 100))

    top_posts = sorted(scored_mentions, key=lambda item: abs(item["sentiment_raw"]), reverse=True)[:3]

    return {
        "sentiment_score": sentiment_score,
        "bullish_posts": bullish_posts,
        "bearish_posts": bearish_posts,
        "top_posts": top_posts,
        "mention_count": len(scored_mentions),
    }


def _reddit_client():
    if praw is None:
        return None

    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    user_agent = os.getenv("REDDIT_USER_AGENT")

    if not client_id or not client_secret or not user_agent:
        return None

    try:
        return praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=user_agent,
        )
    except Exception:
        return None


def _collect_reddit_mentions(tickers: list[str], limit: int = 25) -> dict[str, list[SocialMention]]:
    client = _reddit_client()
    results = {ticker: [] for ticker in tickers}
    if client is None:
        return results

    subreddits = ["wallstreetbets", "investing"]

    for ticker in tickers:
        ticker_variants = {ticker, f"${ticker}"}
        for subreddit_name in subreddits:
            try:
                subreddit = client.subreddit(subreddit_name)
                for submission in subreddit.search(ticker, sort="new", time_filter="week", limit=limit):
                    text = f"{submission.title} {getattr(submission, 'selftext', '')}".strip()
                    if not text:
                        continue
                    upper_text = text.upper()
                    if not any(variant in upper_text for variant in ticker_variants):
                        continue
                    results[ticker].append(
                        SocialMention(
                            ticker=ticker,
                            text=text,
                            source=f"reddit:{subreddit_name}",
                            url=getattr(submission, "url", None),
                            engagement=int(getattr(submission, "score", 0) or 0),
                        )
                    )
            except Exception:
                continue

    return results


def _collect_stocktwits_mentions(tickers: list[str], limit: int = 30) -> dict[str, list[SocialMention]]:
    results = {ticker: [] for ticker in tickers}
    if requests is None and cloudscraper is None:
        return results

    client_id = os.getenv("STOCKTWITS_CLIENT_ID", None)
    headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }

    session = None
    if cloudscraper is not None:
        try:
            session = cloudscraper.create_scraper(browser={"browser": "chrome", "platform": "linux", "desktop": True})
        except Exception:
            session = None

    if session is None:
        session = requests

    for ticker in tickers:
        sym = ticker.upper()
        url = f"https://api.stocktwits.com/api/2/streams/symbol/{sym}.json"
        params = {"limit": limit}
        if client_id:
            params["client_id"] = client_id

        try:
            resp = session.get(url, params=params, headers=headers, timeout=10)
            if resp.status_code != 200:
                continue
            payload = resp.json()
            messages = payload.get("messages", [])[:limit] if isinstance(payload, dict) else []
            for msg in messages:
                body = msg.get("body", "") or ""
                symbols = [s.get("symbol", "").upper() for s in msg.get("symbols", []) if s.get("symbol")]
                if symbols and sym not in symbols and sym not in body.upper() and f"${sym}" not in body.upper():
                    continue
                url_link = msg.get("url") or None
                user = (msg.get("user") or {}).get("username", "")
                likes = (msg.get("likes") or {}).get("total", 0) or 0
                retweets = (msg.get("retweets") or {}).get("total", 0) or 0
                engagement = int(likes) + int(retweets)
                results[sym].append(
                    SocialMention(
                        ticker=sym,
                        text=body,
                        source=f"stocktwits:{user}",
                        url=url_link,
                        engagement=engagement,
                        created_at=msg.get("created_at"),
                    )
                )
        except Exception:
            continue

    return results


async def _collect_telegram_mentions_async(tickers: list[str], limit: int = 50) -> dict[str, list[SocialMention]]:
    results = {ticker: [] for ticker in tickers}
    if TelegramClient is None:
        return results

    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    channels = [channel.strip() for channel in os.getenv("TELEGRAM_CHANNELS", "").split(",") if channel.strip()]

    if not api_id or not api_hash or not channels:
        return results

    try:
        api_id_int = int(api_id)
    except ValueError:
        return results

    try:
        async with TelegramClient("sentiment_scout", api_id_int, api_hash) as client:
            for channel in channels:
                try:
                    async for message in client.iter_messages(channel, limit=limit):
                        text = getattr(message, "message", None) or ""
                        if not text:
                            continue
                        upper_text = text.upper()
                        for ticker in tickers:
                            ticker_variants = {ticker, f"${ticker}"}
                            if any(variant in upper_text for variant in ticker_variants):
                                results[ticker].append(
                                    SocialMention(
                                        ticker=ticker,
                                        text=text,
                                        source=f"telegram:{channel}",
                                        engagement=int(getattr(message, "views", 0) or 0),
                                        created_at=str(getattr(message, "date", "")),
                                    )
                                )
                except Exception:
                    continue
    except Exception:
        return {ticker: [] for ticker in tickers}

    return results


def collect_mentions(tickers: list[str]) -> dict[str, list[SocialMention]]:
    normalized_tickers = _normalize_tickers(tickers)
    reddit_mentions = _collect_reddit_mentions(normalized_tickers)

    try:
        telegram_mentions = asyncio.run(_collect_telegram_mentions_async(normalized_tickers))
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            telegram_mentions = loop.run_until_complete(_collect_telegram_mentions_async(normalized_tickers))
        finally:
            loop.close()

    # StockTwits (social buzz) - optional, graceful fallback if requests missing
    try:
        stocktwits_mentions = _collect_stocktwits_mentions(normalized_tickers)
    except NameError:
        stocktwits_mentions = {ticker: [] for ticker in normalized_tickers}

    combined: dict[str, list[SocialMention]] = {ticker: [] for ticker in normalized_tickers}
    for ticker in normalized_tickers:
        #combined[ticker].extend(reddit_mentions.get(ticker, []))
        #combined[ticker].extend(telegram_mentions.get(ticker, []))
        combined[ticker].extend(stocktwits_mentions.get(ticker, []))

    return combined


def analyze_ticker(ticker: str) -> dict[str, Any]:
    mentions = collect_mentions([ticker]).get(ticker.upper(), [])
    scored = _score_mentions(mentions)
    scored["ticker"] = ticker.upper()
    scored["sources"] = {
        #"reddit": sum(1 for mention in mentions if mention.source.startswith("reddit:")),
        #"telegram": sum(1 for mention in mentions if mention.source.startswith("telegram:")),
        "stocktwits": sum(1 for mention in mentions if mention.source.startswith("stocktwits:")),
    }
    return scored


def analyze_tickers(tickers: list[str]) -> dict[str, dict[str, Any]]:
    normalized_tickers = _normalize_tickers(tickers)
    mentions_by_ticker = collect_mentions(normalized_tickers)

    results: dict[str, dict[str, Any]] = {}
    for ticker in normalized_tickers:
        scored = _score_mentions(mentions_by_ticker.get(ticker, []))
        scored["ticker"] = ticker
        scored["sources"] = {
            #"reddit": sum(1 for mention in mentions_by_ticker.get(ticker, []) if mention.source.startswith("reddit:")),
            #"telegram": sum(1 for mention in mentions_by_ticker.get(ticker, []) if mention.source.startswith("telegram:")),
            "stocktwits": sum(1 for mention in mentions_by_ticker.get(ticker, []) if mention.source.startswith("stocktwits:")),
        }
        results[ticker] = scored

    return results


if __name__ == "__main__":
    test_tickers = ["NVDA", "MSFT", "AAPL", "TSLA"]
    print("Testing Sentiment Scout Worker")
    print("=" * 60)

    results = analyze_tickers(test_tickers)

    print("\n" + "=" * 60)
    print("SENTIMENT ANALYSIS RESULTS:")
    print("=" * 60)
    for ticker, metrics in results.items():
        print(f"\n{ticker}:")
        print(f"  Sentiment Score: {metrics.get('sentiment_score', 'N/A')}")
        print(f"  Bullish Posts: {metrics.get('bullish_posts', 'N/A')}")
        print(f"  Bearish Posts: {metrics.get('bearish_posts', 'N/A')}")
        print(f"  Mention Count: {metrics.get('mention_count', 'N/A')}")
        print(f"  Top Posts: {len(metrics.get('top_posts', []))}")