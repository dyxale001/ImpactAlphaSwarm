"""Every user-facing string the funds catalogue can emit, in one file.

Two reasons it is one file rather than strings at their point of use.

The first is review. The product is not a licensed financial services provider,
so a fund match has to read as a filter over published labels and never as a
proposal. That distinction lives entirely in wording, and wording can only be
reviewed if a reviewer can see all of it at once.

The second is enforcement. ``FORBIDDEN_TERMS`` is scanned over every string here
by a test, and the same scan runs over generated prose at request time. Keeping
the vocabulary and the strings together means the test that guards the line and
the text it guards cannot drift apart.

Some phrasing here is deliberately awkward for that reason. "Available on" rather
than "where to buy". "Are medium- to long-term investments" rather than the
industry's usual "should be considered". Each avoids a term on the list, and the
list wins.

Constants and two pure functions, no class: this is a catalogue and a regex, and
a class around it would add a name without adding a seam.
"""

from __future__ import annotations

import re
from typing import Iterator

# ── the line, as a word list ────────────────────────────────────────────────
# Every one of these turns information into a proposal, a ranking or a promise.
# "for you" is on the list as a predicate ("this fund is for you"), which is why
# the pattern below anchors it as a phrase rather than banning the word "you".
FORBIDDEN_TERMS: tuple[str, ...] = (
    "recommend",
    "suitable",
    "should",
    "best",
    "top pick",
    "ideal",
    "outperform",
    "buy",
    "safe",
    "guaranteed",
    "for you",
)

# Word-boundary patterns, so "safety" and "buyer's guide" are not false hits
# while "safest" and "buying" are. Ordered to match FORBIDDEN_TERMS.
_FORBIDDEN_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("recommend", re.compile(r"\brecommend\w*", re.I)),
    ("suitable", re.compile(r"\bsuitab\w*", re.I)),
    ("should", re.compile(r"\bshould\b", re.I)),
    ("best", re.compile(r"\bbest\b", re.I)),
    ("top pick", re.compile(r"\btop\s+picks?\b", re.I)),
    # "ideal" and "ideally", but not "idealism" — the noun is not a claim about
    # a fund.
    ("ideal", re.compile(r"\bideal(?:ly)?\b", re.I)),
    ("outperform", re.compile(r"\boutperform\w*", re.I)),
    # The verb in every form, but not "buyer": telling someone to buy is the
    # problem, describing a buyer is not.
    ("buy", re.compile(r"\bbuy(?:s|ing)?\b|\bbought\b", re.I)),
    ("safe", re.compile(r"\bsafe(?:r|st)?\b", re.I)),
    ("guaranteed", re.compile(r"\bguarantee\w*", re.I)),
    ("for you", re.compile(r"\bfor\s+you\b", re.I)),
)


def find_forbidden_terms(text: str) -> list[str]:
    """Which forbidden terms appear in this text, in list order.

    Returns the canonical term rather than the matched substring, so a failure
    message names the rule that was broken instead of the inflection that broke
    it.
    """
    return [term for term, pattern in _FORBIDDEN_PATTERNS if pattern.search(text)]


# ── the match, and why it appears ──────────────────────────────────────────
# The sentence that does the most work in the product. It names who classified
# the fund, what they classified it as, when they said so, and which of the
# user's own answers the filter used — then says plainly what it is not.
MATCH_REASON = (
    "This fund appears because {manco} classifies it as {risk_label} in the ASISA "
    "category {category} (fact sheet as at {as_of}), and you told us your risk "
    "profile is {risk_tolerance}{goals_clause}. This is information, not advice. "
    "Read the fact sheet before deciding."
)

GOALS_CLAUSE_HORIZON = ", with money you expect to keep invested until {target_year}"

GOALS_CLAUSE_PURPOSE: dict[str, str] = {
    "emergency_fund": ", and that this is money you may need at short notice",
    "goal": ", and that you are putting money aside for a particular goal",
    "growth": ", and that you are investing for long-term growth",
    "income": ", and that you are looking for funds that pay an income",
}

# ── page furniture ─────────────────────────────────────────────────────────
SECTION_MATCHED = "Funds whose published risk label matches your profile"

SECTION_BROWSE = "Browse every category we cover"

HEADER_EYEBROW = "South African funds"

HEADER_TITLE = "Funds"

# Answers the question a reader of an asset page could not answer: which market,
# which currency, and whether the rand figure is a conversion.
HEADER_STRIP = (
    "South African funds, JSE-listed where they are exchange traded. Priced in "
    "rand, not converted from another currency."
)

FOOTER_NOT_LICENSED = (
    "AlphaSwarm is not a licensed financial services provider and does not give "
    "advice. Fund categories, risk labels, costs and performance figures on this "
    "page are the fund managers' own, taken from the Minimum Disclosure Document "
    "each fund is required to publish."
)

# The industry's standard wording says schemes "should be considered" a medium to
# long-term investment. Reworded to state the same fact without the word.
CIS_DISCLAIMER = (
    "Collective investment schemes are medium- to long-term investments. Past "
    "performance does not predict future returns. Fund values move with the "
    "markets and with exchange rates, and charges reduce what you earn."
)

# The last step of onboarding, once the answers exist but before they are saved.
#
# Wording is the reviewed one. An earlier draft headed this "Where someone like
# you might start", which was dropped: "might start" is a soft proposal, and a
# proposal is the one thing this product is not licensed to make. What is left
# describes a filter over labels other people published — which is all it is.
ONBOARDING_PANEL = (
    "Based on your answers, these ASISA fund categories carry a published risk "
    "label at or below yours. Explore them in Funds."
)

# Attached to the price chart. It exists to stop the line being read as a return:
# a chart of closes looks exactly like a performance chart, and the two mean
# different things on a page whose other figures are the manager's own.
PRICE_NOTE = (
    "The price this fund closed at on the JSE each day, in rand. It is not a "
    "return and is not the manager's published performance, which is on the "
    "fact sheet and is measured to the sheet's own date."
)

INCLUSION_RULE = (
    "How this list is chosen: for each category below we include the largest "
    "funds by fund size that are available on EasyEquities, using the fund size "
    "each manager publishes on its own fact sheet. Ordering is alphabetical. No "
    "fund is placed above another by its past returns."
)

NOT_COVERED = (
    "Not covered here: retirement annuities, tax-free and offshore product "
    "wrappers, the tax treatment of any of them, and funds not available on "
    "EasyEquities. Where a fund can be held in a tax-free account we say so, and "
    "nothing further."
)

# ── states other than "here are your matches" ──────────────────────────────
RISK_ONLY_NOTICE = (
    "These matches use your risk profile only. Add your time horizon and what "
    "the money is for, and the list narrows to the categories that fit those "
    "answers too."
)

PROFILE_MISSING = (
    "Complete the investor profile and this page will show the fund categories "
    "your answers map to. Until then, every category we cover is listed below."
)

EMPTY_BRACKET = (
    "No fund in our catalogue currently carries a published risk label at or "
    "below your profile in these categories. Every category we cover is listed "
    "below, with each fund's own label shown."
)

NO_PUBLISHED_RISK_LABEL = (
    "This fund's manager does not publish a risk profile indicator on its fact "
    "sheet, so it is not matched to any profile. It is listed here with "
    "everything its manager does publish."
)

EXPLANATION_UNAVAILABLE = (
    "We could not assemble this explanation from the fund's fact sheet. The "
    "figures above and the fact sheet itself are unaffected."
)

# ── "Why this appears" sections ────────────────────────────────────────────
# Each renders from its own fact-sheet fields and is skipped when those fields
# are absent, so a thin sheet produces a shorter paragraph rather than one
# padded with blanks.
WHY_WHAT = "What it is: {objective}"

WHY_HOLDS = "What it holds, as at {as_of}: {allocation}."

WHY_COSTS = (
    "What it costs: a total investment charge of {tic}% a year, of which {ter}% "
    "is the total expense ratio."
)

WHY_COSTS_TER_ONLY = "What it costs: a total expense ratio of {ter}% a year."

WHY_PERFORMANCE = (
    "How it has done: {performance}, against its benchmark of {benchmark}, as "
    "reported on the fact sheet dated {as_of}."
)

WHY_RULE = "Why you are seeing it: {rules}."

WHY_DISTRIBUTION = "It distributes income {frequency}."

# One plain sentence per rule, used to explain a match in the user's terms
# rather than by rule name.
RULE_NOTES: dict[str, str] = {
    "risk_ceiling": (
        "your risk answers set the highest risk level a fund may carry, and this "
        "fund's own label is at or below it"
    ),
    "category": "your risk profile covers this fund's category",
    # Says "stated on its fact sheet" rather than naming the manager's verb.
    # The database column is `recommended_min_term_years` because that is the
    # field's own name on the document; the sentence a user reads describes
    # where the number comes from instead.
    "horizon": (
        "your time horizon is at least as long as the minimum investment term "
        "stated on this fund's fact sheet"
    ),
    "purpose": (
        "what you said the money is for limited the categories to the ones that "
        "match it"
    ),
    "eligibility": "it is available in the account type you chose",
    "skipped_no_goals": (
        "your time horizon and purpose are not on file yet, so only your risk "
        "profile was used"
    ),
}

# Vehicle explainer, shown once on a fund page. The single genuine difference to
# a reader is how a fund is priced and where it is held.
VEHICLE_NOTE: dict[str, str] = {
    "unit_trust": (
        "A unit trust is priced once a day by its manager and held through a "
        "platform or the manager directly."
    ),
    "etf": (
        "An exchange traded fund is listed on the JSE and priced continuously "
        "while the market is open, like a share."
    ),
}

AVAILABLE_ON = "Available on {platforms}."

FACT_SHEET_LINK = "Read the fact sheet (as at {as_of})"


def all_strings() -> Iterator[str]:
    """Every string this module can put in front of a user, ready to scan.

    Templates are rendered with neutral placeholder values, because the test has
    to see the finished sentence: a forbidden word could just as easily arrive
    through a template's fixed text as through a constant.
    """
    literals = (
        SECTION_MATCHED,
        SECTION_BROWSE,
        HEADER_EYEBROW,
        HEADER_TITLE,
        HEADER_STRIP,
        FOOTER_NOT_LICENSED,
        CIS_DISCLAIMER,
        PRICE_NOTE,
        ONBOARDING_PANEL,
        INCLUSION_RULE,
        NOT_COVERED,
        RISK_ONLY_NOTICE,
        PROFILE_MISSING,
        EMPTY_BRACKET,
        NO_PUBLISHED_RISK_LABEL,
        EXPLANATION_UNAVAILABLE,
    )
    yield from literals
    yield from GOALS_CLAUSE_PURPOSE.values()
    yield from RULE_NOTES.values()
    yield from VEHICLE_NOTE.values()

    yield MATCH_REASON.format(
        manco="Example Collective Investments",
        risk_label="Low to Moderate",
        category="South African - Multi Asset - Low Equity",
        as_of="31 July 2026",
        risk_tolerance="Conservative",
        goals_clause="",
    )
    yield GOALS_CLAUSE_HORIZON.format(target_year="2031")
    yield WHY_WHAT.format(objective="an example objective")
    yield WHY_HOLDS.format(as_of="31 July 2026", allocation="40% equities, 60% bonds")
    yield WHY_COSTS.format(tic="1.51", ter="1.46")
    yield WHY_COSTS_TER_ONLY.format(ter="1.46")
    yield WHY_PERFORMANCE.format(
        performance="8.1% a year over three years",
        benchmark="an example benchmark",
        as_of="31 July 2026",
    )
    yield WHY_RULE.format(rules="an example reason")
    yield WHY_DISTRIBUTION.format(frequency="quarterly")
    yield AVAILABLE_ON.format(platforms="EasyEquities")
    yield FACT_SHEET_LINK.format(as_of="31 July 2026")
