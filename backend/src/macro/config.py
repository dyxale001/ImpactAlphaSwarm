"""Feature flag and settings for macro news.

Read at import, like the funds flags, so the router either exists in the served app
or it does not. The flag defaults OFF: merging this changes nothing until an
environment sets it, and it must not be set before migration 031 has run and the Jev
key is in that environment.
"""

import os


def _flag(name: str, default: str = "false") -> bool:
    """Only the literal ``true`` (any case) switches a flag on, so a typo fails closed."""
    return os.getenv(name, default).strip().lower() == "true"


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


# Mounts /api/macro and, on the frontend, the Market News page.
MACRO_NEWS_ENABLED = _flag("MACRO_NEWS_ENABLED")

# 0.6 for both: in validation (04/10, 100 articles) 0.6 and 0.7 tagged identically,
# and 0.6 keeps the borderline-but-right cases. Separate knobs because the gate and
# the tags answer different questions and may need to move apart.
MACRO_TAG_THRESHOLD = _float("MACRO_TAG_THRESHOLD", 0.6)
MACRO_GATE_THRESHOLD = _float("MACRO_GATE_THRESHOLD", 0.6)

# How far back the page reads, and how far back a pull retries articles that failed
# to score. Seven days matches the sentiment news lookback.
MACRO_LOOKBACK_DAYS = _int("MACRO_LOOKBACK_DAYS", 7)

# Rows older than this are pruned at the end of a pull.
MACRO_RETENTION_DAYS = _int("MACRO_RETENTION_DAYS", 30)

# Pinned rather than ``jev-latest``: a silent model change would move every
# probability on the page, and the validation numbers would stop describing it.
JEV_MODEL = os.getenv("JEV_MODEL", "typesafe/jev-1.13")

# The decisions endpoint and the env var holding its key. OpenRouter today; another
# route that speaks the same request shape is a config change, not a code change.
JEV_DECISIONS_URL = os.getenv("JEV_DECISIONS_URL", "https://openrouter.ai/api/alpha/decisions")
JEV_API_KEY_ENV = os.getenv("JEV_API_KEY_ENV", "TYPESAFE_API_KEY_OPENROUTER")

# Parallel Jev calls. A pull is ~35 articles; six at a time finishes in seconds and
# stays far inside the provider's 1,200 requests a minute.
JEV_CONCURRENCY = _int("JEV_CONCURRENCY", 6)
JEV_TIMEOUT_SECONDS = _int("JEV_TIMEOUT_SECONDS", 30)

# The Groq account the per-sector overviews are written on. The sentiment drivers' lane
# by default: at most seven overviews a pull, three pulls a day, is a rounding error on
# it. Point it at another key if that lane ever gets busy.
MACRO_DIGEST_KEY_ENV = os.getenv("MACRO_DIGEST_KEY_ENV", "GROQ_API_KEY6")
MACRO_DIGEST_FALLBACK_KEY_ENV = os.getenv("MACRO_DIGEST_FALLBACK_KEY_ENV", "GROQ_API_KEY4")

# Publisher tiers an article must be in to be kept (the sentiment scout's registry).
MACRO_KEEP_TIERS = (1, 2)

FINNHUB_GENERAL_NEWS_URL = "https://finnhub.io/api/v1/news"
