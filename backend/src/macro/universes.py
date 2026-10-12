"""The questions Jev is asked about every article.

Eight yes/no questions in one call: the relevance gate, market-wide, and one per
universe. The wording is the v4 set validated on 04/10 (macro-news-plan.md §7 and
Appendix A). Change it and the validation numbers stop describing the page, so re-run
the validation, and ``question_version`` changes so ``/rescore`` re-tags what is stored.

Why the universe questions are narrow. Asked "would this reasonably bear on companies
in X?", Jev tagged a Fed headline to every universe and made Finance a catch-all for
wars and court cases. So each question lists what counts for that sector and says a
general effect on markets does not; the general effect is the separate market-wide
question instead, which is what brings indirect news (rates, tariffs, oil, major wars)
back without the catch-all.

The universe set itself is not defined here. It is ``asset_discovery.UNIVERSES``, the
same list that places stocks, and the import-time check below fails if a universe is
added or renamed there without wording here. A universe with no question would
otherwise be silently untaggable.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass

from ..agents.asset_discovery import UNIVERSES
from .config import JEV_MODEL

MARKET_WIDE = "Market-wide"

RELEVANCE_ONLY = "Answer about relevance only, not whether the effect is good or bad."

GATE_QUESTION = (
    "Is this news about economic, political, regulatory, geopolitical or market-wide events that investors "
    "would follow, as opposed to lifestyle, entertainment or personal-finance tips?"
)

MARKET_WIDE_QUESTION = (
    "Does this news affect markets broadly, across many sectors at once? Count it only if it is about "
    "interest rates or central-bank policy, inflation or other major economic data, tariffs or trade "
    "policy, oil, gas or fuel prices and supply, government budgets, debt or shutdowns, or a geopolitical "
    "event big enough to move oil prices, currencies or stock indices. A story about one company or one "
    "sector, or a local crime, court case or accident, does NOT count. " + RELEVANCE_ONLY
)


@dataclass(frozen=True)
class NewsRule:
    """One universe's question, in parts.

    ``concern`` follows ``asset_discovery.UNIVERSE_SCOPES`` so a news tag and a stock's
    placement mean the same thing. ``who`` completes "unless it names ...", the clause
    that lets a war or political story in only when it names a firm or a policy in the
    sector. ``extra`` holds a rule validation showed a need for.
    """

    concern: str
    counts: str
    who: str
    extra: str = ""

    def question(self) -> str:
        parts = [f"Does this news directly concern {self.concern}? Count it only if it is about {self.counts}."]
        if self.extra:
            parts.append(self.extra)
        parts.append(
            "A general effect on markets, the economy or investor mood does NOT count, and neither does a war, "
            f"crime or political story unless it names {self.who}. " + RELEVANCE_ONLY
        )
        return " ".join(parts)


NEWS_RULES: dict[str, NewsRule] = {
    "Technology": NewsRule(
        concern="technology companies: software, hardware, semiconductors or networking equipment",
        counts=(
            "tech products, a tech company's results or deals, chip supply or export controls, tech "
            "regulation such as antitrust or data privacy, or a named technology company"
        ),
        who="a technology firm or a technology policy",
        extra=(
            "Search engines, social media, streaming and telecoms are a separate universe and do not count "
            "here on their own."
        ),
    ),
    "Green Energy": NewsRule(
        concern=(
            "clean energy or water: solar, wind, hydrogen and other clean power, batteries and electric "
            "vehicles, or water utilities, water treatment and water infrastructure such as pipes, pumps and "
            "meters"
        ),
        counts=(
            "clean-energy or water projects, EV demand, battery supply, energy-transition or water policy "
            "(subsidies, tariffs, emissions or water-quality rules), or a named clean-energy or water company"
        ),
        who="a clean-energy or water firm, or an energy-transition or water policy",
        extra="Oil and gas news counts only if the story is about its effect on renewables or EVs.",
    ),
    "Finance": NewsRule(
        concern=(
            "the financial sector: banks, insurers, fintech, payment companies, asset managers or exchanges"
        ),
        counts=(
            "interest rates, central-bank policy, financial regulation, credit or lending conditions, "
            "capital markets activity, or a named financial company"
        ),
        who="a financial firm or a financial policy",
    ),
    "AI & Robotics": NewsRule(
        concern=(
            "artificial intelligence or robotics: AI chips and infrastructure, AI models and software, AI "
            "data centres, industrial automation or robot makers"
        ),
        counts=(
            "AI products or research, AI investment or data-centre spending, AI chips and their supply or "
            "export controls, AI regulation, automation or robotics, or a named AI or robotics company"
        ),
        who="an AI or robotics firm or an AI policy",
        extra="Military news counts only if it is specifically about AI or autonomous systems.",
    ),
    "Healthcare": NewsRule(
        concern=(
            "healthcare companies: pharmaceuticals, biotech, medical devices, health insurers, hospitals or "
            "other health services"
        ),
        counts=(
            "drug approvals or trials, drug pricing, health policy or insurance rules, a disease outbreak "
            "needing a medical response, or a named healthcare company"
        ),
        who="a healthcare firm or a health policy",
        extra="Injuries or casualties from a war, crime or accident do NOT count.",
    ),
    "Media & Communications": NewsRule(
        concern=(
            "media and communications companies: search and social media, streaming, film and TV, "
            "entertainment, video games, publishing, or telecoms carriers, cable and satellite communications"
        ),
        counts=(
            "content, audiences or advertising, a media or telecoms company's results or deals, media "
            "mergers, spectrum or telecoms regulation, social-media regulation, or a named media or telecoms "
            "company"
        ),
        who="a media or telecoms firm or a media or telecoms policy",
    ),
}


def check_rules_cover(universes: list[str], rules: dict[str, NewsRule]) -> None:
    """Raise if the universe list and the wording have drifted apart."""
    missing = [u for u in universes if u not in rules]
    extra = [u for u in rules if u not in universes]
    if missing or extra:
        raise RuntimeError(
            "macro news questions out of step with asset_discovery.UNIVERSES: "
            f"no wording for {missing or 'none'}, wording for unknown {extra or 'none'}"
        )


check_rules_cover(UNIVERSES, NEWS_RULES)


GATE_ID = "market_relevant"
MARKET_WIDE_ID = "market_wide"


def question_id(universe: str) -> str:
    """A stable identifier for a universe's question: 'AI & Robotics' -> 'u_ai_robotics'."""
    return "u_" + re.sub(r"[^a-z0-9]+", "_", universe.lower()).strip("_")


def build_questions() -> dict[str, dict[str, str]]:
    """The ``questions`` object for one Jev request."""
    questions = {
        GATE_ID: {"type": "noul", "instructions": GATE_QUESTION},
        MARKET_WIDE_ID: {"type": "noul", "instructions": MARKET_WIDE_QUESTION},
    }
    for universe in UNIVERSES:
        questions[question_id(universe)] = {"type": "noul", "instructions": NEWS_RULES[universe].question()}
    return questions


def question_version() -> str:
    """A short hash of the model and every question's wording, universe order included."""
    payload = json.dumps({"model": JEV_MODEL, "questions": build_questions()}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:12]
