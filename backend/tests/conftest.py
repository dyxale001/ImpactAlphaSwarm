"""Shared test setup.

Three jobs, all about determinism:

1.  Put ``backend/`` on ``sys.path`` so ``import src.…`` works no matter which
    directory pytest was invoked from.

2.  Give the Supabase client placeholder credentials if the environment has
    none, so collection does not depend on a developer's ``.env``.

3.  Pin every env-tunable scoring constant to its DOCUMENTED DEFAULT before the
    modules under test are imported.

Point 2 is not hypothetical. ``supabase_client`` raises at *import* when
``SUPABASE_URL`` or ``SUPABASE_SERVICE_ROLE_KEY`` is missing, and several test
modules import it transitively. Today the suite survives only because
``langgraph_orchestrator`` calls ``load_dotenv()`` and a developer happens to have
``backend/.env`` — so in a fresh clone, a git worktree or CI, collection fails
with four errors before a single test runs. ``setdefault`` leaves a real
environment untouched; the placeholders only ever apply where there was nothing.
Nothing in the suite reaches the network, so a fake URL is never dialled.

Point 3 matters more than it looks. ``ranking.py``, ``quant_analyst.py`` and
``ss_aggregation.py`` all read their thresholds via ``os.getenv`` at *import*
time, and ``langgraph_orchestrator`` calls ``load_dotenv()``, which pulls
``backend/.env`` into the environment. None of the scoring tunables are set in
``.env`` today, but if one ever were, every expected value in this suite would
shift underneath it and the failures would look like real regressions.

``load_dotenv()`` does not override variables that are already set, so assigning
them here wins. The values below are the defaults written into the source; if a
default legitimately changes, update it here and the failing expectations will
show you exactly which behaviour moved.
"""

import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# ── credentials the client insists on at import ──────────────────────────────
# setdefault, not assignment: a real environment must win, because some tests are
# run against a scratch project deliberately.
_IMPORT_TIME_REQUIRED = {
    "SUPABASE_URL": "http://localhost:54321",
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
}

for _key, _value in _IMPORT_TIME_REQUIRED.items():
    os.environ.setdefault(_key, _value)

# ── documented defaults, pinned ──────────────────────────────────────────────
_PINNED_DEFAULTS = {
    # funds/config.py — read ONCE at import, so a developer's .env must not
    # decide what a test gets. Assignment rather than setdefault, because that
    # is exactly how it bit on 2026-09-07: a flag set in backend/.env to try
    # something live shifted the suite underneath it, and three tests failed
    # looking like regressions when nothing had regressed.
    "FUNDS_ENABLED": "true",
    "FUND_TRACES_ENABLED": "false",
    # ranking.py
    "RANK_W_QUANT": "0.5",
    "RANK_W_SENT": "0.5",
    "RANK_DIRECTION_MODE": "shift",
    "RANK_CONV_FLOOR": "0.1",
    "RANK_DS_FLOOR": "0.2",
    "RANK_PF_FLOOR": "0.3",
    "RANK_DS_NEWS_FULL": "10",
    "RANK_DS_SOCIAL_FULL": "25",
    "RANK_DS_QUANT_FULL": "120",
    "RANK_TIE_EPSILON": "0.02",
    # quant_analyst.py
    "QUANT_WINDOW": "1y",
    "QUANT_MIN_UNIVERSE": "10",
    # ss_aggregation.py / ss_sources.py
    "NEWS_RECENCY_HALFLIFE_DAYS": "2",
    "NEWS_SENTIMENT_WEIGHT": "0.7",
    "NEWS_TIER1_SHARE": "0.6",
    "NEWS_TIER2_SHARE": "0.3",
    "NEWS_TIER3_SHARE": "0.1",
    # asset_discovery.py — the funnel gates, the score blend and the hysteresis
    # constants. `.env` sets DISCOVERY_ENABLED / DISCOVERY_SHADOW_MODE, which this
    # module never reads, but pin the rest so a later addition to `.env` cannot
    # move a threshold underneath these expectations.
    "DISCOVERY_MAX_NEW_PER_NIGHT": "5",
    "DISCOVERY_MIN_MARKET_CAP_USD": "2e9",
    "DISCOVERY_MIN_IPO_AGE_DAYS": "180",
    "DISCOVERY_MIN_AVG_DOLLAR_VOL": "1e7",
    "DISCOVERY_MIN_NEWS_ARTICLES": "1",
    "DISCOVERY_NEWS_LOOKBACK_DAYS": "7",
    "DISCOVERY_DECAY_FACTOR": "0.7",
    "DISCOVERY_RETIRE_THRESHOLD": "0.1",
    "DISCOVERY_W_TREND": "0.5",
    "DISCOVERY_W_NEWS": "0.3",
    "DISCOVERY_W_LIQ": "0.2",
    "DISCOVERY_NEWS_SCORE_CAP": "10",
    "DISCOVERY_LIQ_SCORE_CAP": "5e8",
}

for _key, _value in _PINNED_DEFAULTS.items():
    os.environ[_key] = _value
