"""Feature flags and fixed settings for the funds catalogue.

Read at import, like every other flag in this codebase (``langgraph_orchestrator``
does the same for discovery and ranking), so a module either exists in the served
app or it does not. Both flags default OFF: merging this feature changes no
behaviour until an environment sets them.

``FUNDS_ENABLED`` mounts the router and the page — inert data served from
published fact sheets — and everything on it, the fund page's reasoning trace
included: that paragraph ships behind its own guards and template fallback
rather than a flag (see trace.py). ``FUND_TRACES_ENABLED`` was reserved for
model-written fund prose and is no longer read.
"""

import os


def _flag(name: str, default: str = "false") -> bool:
    """Read a boolean env flag the way the rest of the backend does.

    Anything other than the literal string ``true`` (any case, surrounding
    whitespace ignored) is false, so a typo or a stray ``1`` fails closed rather
    than switching a feature on.
    """
    return os.getenv(name, default).strip().lower() == "true"


# Mounts /api/fund-catalogue and, on the frontend, the Funds page. Off by
# default; flip only once the seeded catalogue is loaded, because an empty
# catalogue renders a page that says nothing.
FUNDS_ENABLED = _flag("FUNDS_ENABLED")

# Reserved for model-written fund explanations. Nothing reads it: the fund
# page's reasoning trace (trace.py) is on wherever the catalogue is, behind its
# guards and its template fallback, and needs no flag.
FUND_TRACES_ENABLED = _flag("FUND_TRACES_ENABLED")

# Private Supabase Storage bucket holding one PDF per fact-sheet snapshot at
# ``<isin>/<as_of>.pdf``. Copies are kept for audit; users are linked to the
# management company's own URL, because that is the authoritative publication and
# re-serving someone else's document is a licensing question nobody has asked.
# The stored copy is the fallback for when a published link rots, which happens:
# one platform-hosted sheet found during design was five years stale.
MDD_BUCKET = "mdd"

# Signed-URL lifetime for a stored fact sheet. One hour, matching the badge icons
# the frontend already serves this way.
MDD_SIGNED_URL_TTL_SECONDS = int(os.getenv("FUNDS_MDD_URL_TTL", "3600"))

# Platform minimum for a monthly debit order, in rand. None means "no minimum",
# which is the truth for the platform this catalogue is bounded to. The hook
# exists so a future platform with a real minimum needs a value here rather than
# a new rule in the matcher.
PLATFORM_MIN_DEBIT_ORDER: float | None = None
