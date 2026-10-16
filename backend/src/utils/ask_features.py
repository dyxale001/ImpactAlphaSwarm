"""What the product's pages are, as Ask AlphaSwarm can describe them.

WHY THIS IS ITS OWN MODULE.

Ask answers "what does the Compare page do?" and "where do I see market
news?" from fixed, reviewed text, never from a model — the same rule every
other platform answer follows. The text has to live somewhere, and it has
to stay in step with the product. Putting it in one registry rather than
scattered across api.py gives it a single place to be wrong in, and a
single place to review.

THE RULE THAT MATTERS: a page that is switched off is not described.

Market News, Compare and Funds each sit behind a feature flag that
defaults OFF. A flag-off deployment answers a question about them with a
404 in the sidebar, so describing them — worse, linking to them — would
send a user to a page that does not exist for them. Each feature therefore
carries the flag that gates it, and `enabled_features()` is the only way
to ask "what can I tell this user about?".

Where a flag is read matters too. Funds and Market News are mounted by the
BACKEND under their own flags, so the backend can answer authoritatively.
Compare's backend routes mount unconditionally; only its PAGE is gated, by
a frontend-only variable (VITE_COMPARE_ENABLED). Both processes load the
same .env in this project, so it is read from there rather than assumed.

The copy below is lifted from the product itself — the page headers and
their "About this page" panels — not paraphrased, so what Ask says and
what the page says cannot drift into contradicting each other.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Callable, Optional


def _env_true(name: str) -> bool:
    """Only the literal "true" (any case) switches a flag on, matching how
    every other flag in the backend reads its environment, so a typo fails
    closed rather than open."""
    return os.getenv(name, "false").strip().lower() == "true"


@dataclass(frozen=True)
class Feature:
    key: str
    name: str
    path: str
    # One sentence: what it is.
    summary: str
    # What a user can do there, in the product's own words.
    detail: str
    # Phrases that mean "I am asking about this page".
    triggers: tuple[str, ...]
    # None = always available.
    enabled: Optional[Callable[[], bool]] = None

    def is_enabled(self) -> bool:
        return True if self.enabled is None else bool(self.enabled())


FEATURES: tuple[Feature, ...] = (
    Feature(
        key="market_news",
        name="Market News",
        path="/news",
        summary=(
            "Market News is the page for world and market news, sorted by which "
            "investment sectors each story touches."
        ),
        detail=(
            "World news can affect whole groups of companies at once: an "
            "interest-rate decision touches banks, a chip export rule touches "
            "semiconductors. Each story is tagged to the sectors it is "
            "relevant to, each sector gets a short AI-written summary of its "
            "stories, and news that affects markets broadly is shown as "
            "market-wide. It tells you how relevant a story is, not whether "
            "it is good or bad news, and it informs rather than advises — "
            "nothing on it changes AlphaSwarm's rankings or signals. The "
            "model only sees a headline and the publisher's short summary, so "
            "it can be wrong, and every story links to its source so you can "
            "check."
        ),
        triggers=("market news", "macro news", "world news", "news page", "news by sector", "sector news"),
        enabled=lambda: _env_true("MACRO_NEWS_ENABLED"),
    ),
    Feature(
        key="compare",
        name="Compare",
        path="/compare",
        summary=(
            "Compare lines up two or three stocks, or two or three funds, "
            "side by side."
        ),
        detail=(
            "Pick two or three stocks, or two or three funds, and see every "
            "figure next to each other with what the differences mean. A "
            "toggle switches between stocks and funds. The page never picks "
            "one for you — it describes what each figure is, and the decision "
            "stays yours. A comparison is a link, so you can share it, and "
            "the 'Compare with…' button on a stock or fund page opens it "
            "already filled in."
        ),
        triggers=("compare page", "comparison page", "compare tool", "side by side", "compare two", "compare stocks", "compare funds"),
        enabled=lambda: _env_true("VITE_COMPARE_ENABLED") or _env_true("COMPARE_ENABLED"),
    ),
    Feature(
        key="financial_tools",
        name="Financial Tools",
        path="/financial-tools",
        summary=(
            "Financial Tools holds AlphaSwarm's planners for working out what "
            "investing could do for you over time."
        ),
        detail=(
            "There are two: an Investment Planner, which projects potential "
            "growth or works backwards from a goal, and a TFSA Planner for a "
            "tax-free savings account. Both let you set an inflation "
            "assumption, so the result can be read in today's money as well "
            "as in future rand. They are projections from the numbers you "
            "enter, not predictions of what will happen."
        ),
        triggers=("financial tools", "financial tool", "investment planner", "tfsa planner", "planner", "calculator", "projection tool"),
    ),
    Feature(
        key="funds",
        name="Funds",
        path="/funds",
        summary=(
            "The Funds page is AlphaSwarm's catalogue of South African unit "
            "trusts and JSE-listed ETFs."
        ),
        detail=(
            "Each fund shows the risk profile its manager publishes, its "
            "total investment charge, the minimum term, its size and how it "
            "distributes, with the date of the fact sheet the figures come "
            "from. Funds are listed alphabetically, never ranked by "
            "returns, and AlphaSwarm doesn't pick a fund for you."
        ),
        triggers=("funds page", "fund catalogue", "the funds section"),
        enabled=lambda: _env_true("FUNDS_ENABLED"),
    ),
)


def enabled_features() -> tuple[Feature, ...]:
    """The features this deployment can honestly describe and link to."""
    return tuple(f for f in FEATURES if f.is_enabled())


def match_feature(query: str) -> Optional[Feature]:
    """The enabled feature a question is about, if any.

    Longest trigger wins, so "financial tools" is not shadowed by a shorter
    phrase belonging to another feature. A DISABLED feature never matches:
    the caller falls through to its normal handling instead of describing a
    page the user cannot reach.
    """
    q = (query or "").lower()
    best: Optional[Feature] = None
    best_len = 0
    for feature in enabled_features():
        for trigger in feature.triggers:
            if trigger in q and len(trigger) > best_len:
                best, best_len = feature, len(trigger)
    return best


def disabled_feature_named(query: str) -> Optional[Feature]:
    """A switched-off feature the question names, for an honest answer.

    "Where is the Compare page?" on a deployment without it should not be
    answered as though the page exists, and should not fall through to a
    generic "I'm not sure what you mean". Returns the feature so the caller
    can say it is not available here."""
    q = (query or "").lower()
    for feature in FEATURES:
        if feature.is_enabled():
            continue
        if any(t in q for t in feature.triggers):
            return feature
    return None
