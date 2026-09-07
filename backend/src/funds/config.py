"""Feature flags and fixed settings for the funds catalogue.

Read at import, like every other flag in this codebase (``langgraph_orchestrator``
does the same for discovery and ranking), so a module either exists in the served
app or it does not. Both flags default OFF: merging this feature changes no
behaviour until an environment sets them.

The two flags are separate because the catalogue and the generated prose carry
different risks. ``FUNDS_ENABLED`` mounts the router and the page — inert data
served from published fact sheets. ``FUND_TRACES_ENABLED`` turns on the
model-written explanation, which cannot ship before its guards and the copy
review are in place. The catalogue is useful without it: version one renders a
templated "Why this appears" built from the snapshot's own fields.
"""

import os
from pathlib import Path


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

# Model-written fund explanations. Off by default and gated separately from the
# catalogue: it must not flip before the forbidden-term and number-grounding
# guards are proven, and before the copy has been reviewed.
FUND_TRACES_ENABLED = _flag("FUND_TRACES_ENABLED")

# Read a fact sheet with a model rather than a per-manager pattern. Off by
# default, following the same idiom as the two flags above: with it off nothing
# imports `anthropic`, no request leaves the machine, and extraction behaves
# exactly as it does today.
#
# Why it is worth having at all, stated plainly because the opposite was argued
# for a while: the per-manager templates are not more *accurate* than a model
# reading the same sheets — measured on the same denominator they are about the
# same, and the model was more correct twice, reading a category the regex
# truncated at a line break and a fund size the template refused with a reason
# that was false. What templates are is more *deterministic*, and the cache
# below is what buys that back.
FUND_LLM_EXTRACT_ENABLED = _flag("FUND_LLM_EXTRACT_ENABLED")

# The model that reads a sheet. Sonnet rather than Opus because the task is
# transcription against a rubric rather than reasoning, and rather than Haiku
# because a fact sheet's fee table has two columns and picking the wrong one is
# the failure that matters. No date suffix: the 5-series does not accept pinned
# dated ids.
FUND_LLM_MODEL = os.getenv("FUND_LLM_MODEL", "claude-sonnet-5")

# Which workspace to bill and log a reading against.
#
# Needed only for an ORGANISATION-level key. An `sk-ant-api03-…` key created at
# the organisation level rather than inside a workspace is refused with a 400
# saying so — the request has to name a workspace. A workspace-scoped key needs
# nothing here. Left unset by default because the second is the simpler fix and
# the one to prefer.
FUND_LLM_WORKSPACE_ID = os.getenv("ANTHROPIC_WORKSPACE_ID", "").strip() or None

# Where a reading is kept, keyed by the document's own sha256.
#
# This is the determinism argument, so it is not an optimisation. The same PDF
# gives the same answer forever, which means re-reading a sheet is a deliberate
# act (delete the entry) rather than a dice roll, and a figure a person approved
# cannot silently change under them on the next load. It also means the live
# accuracy measurement is repeatable without paying for it twice.
FUND_LLM_CACHE_DIR = os.getenv(
    "FUND_LLM_CACHE_DIR",
    str(Path(__file__).resolve().parents[2] / "data" / "funds" / "extract_cache"),
)

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
