"""Satrix, which issues the JSE-listed ETFs in this catalogue.

Sheets live at a stable code-keyed URL, `satrix.co.za/fund/mdd/<code>`, so a
batch needs no index page first.

**The risk rating is refused here, and that refusal is the point of this file.**
Satrix draws a five-step scale and fills in the step that applies. The PDF's
text layer contains *all five* step labels whatever the rating, so a text match
returns either nothing or the wrong step — confidently, and in a form that looks
exactly like a correct answer. That is not hypothetical: it put AGGRESSIVE-rated
Satrix 40 into this catalogue as "publishes no risk indicator", and the claim
was repeated in two documents before anyone rendered the page and looked.

Satrix also words its scale by temperament rather than by risk — CONSERVATIVE,
CAUTIOUS, MODERATE, MODERATE-AGGRESSIVE, AGGRESSIVE — in which "conservative" is
the *lowest* step, the opposite end from what the same word means as a user's own
risk tolerance. `risk_scale.normalize` maps them, but only once a human has read
which step is filled in.
"""

from __future__ import annotations

from ..asisa import ASISA
from .base import FactsheetTemplate


class SatrixTemplate(FactsheetTemplate):
    name = "satrix"
    hosts = ("satrix.co.za", "www.satrix.co.za")

    patterns = {
        "as_of": r"Minimum Disclosure Document\s*\n\s*(\d{1,2} \w+ 20\d\d)",
        "isin": r"ISIN Code\s*([A-Z]{2}[A-Z0-9]{9}\d)",
        "jse_code": r"JSE Code\s*([A-Z0-9]+)",
        # The terminator names the labels that actually follow this line in the
        # fund-facts block. It used to stop at any newline followed by capitals,
        # which is why "…Variable Term \nILB" came back as nominal Variable Term:
        # "ILB" is itself a run of capitals. The vocabulary resolver below is the
        # second guard, so a capture that goes wrong refuses instead of lying.
        "asisa_category": (
            r"ASISA Classification\s*(.{4,80}?)"
            r"(?=\n(?:Distribution|Inception|Income|Rebalance|Scrip|Portfolio|"
            r"Securities|NAV|Modified|Yield|Highest|Lowest|Benchmark)|$)"
        ),
        "benchmark": r"\nBenchmark\s*([^\n]{2,70})",
        # Where a fee has been cut the sheet prints two TER rows: the historic
        # one and one marked effective from a date. The TIC row already reflects
        # the effective TER, so that is the internally consistent pair to take.
        "ter": (
            r"Effective \d{2} \w{3} 20\d\d\s*\n?\s*([\d.]+)",
            r"Total Expense Ratio \(TER\)\s*([\d.]+)",
        ),
        "tc": r"Transaction Cost \(TC\)\s*([\d.]+)",
        "tic": r"Total Investment Charge \(TIC\)\s*([\d.]+)",
        "distribution_frequency": r"Distribution Frequency\s*([^\n]{2,40})",
    }

    numeric = frozenset({"ter", "tc", "tic"})

    vocabulary = {"asisa_category": lambda raw: getattr(ASISA.resolve(raw), "name", None)}

    dates = frozenset({"as_of"})

    refuses = {
        "risk_indicator_raw": (
            "Satrix draws the risk profile as a filled step on a five-word scale, and every "
            "word appears in the text whatever the rating. Open the sheet and read which step "
            "is filled — CONSERVATIVE is the lowest, AGGRESSIVE the highest"
        ),
        "risk_indicator_1to5": (
            "follows from the step marked on the sheet; see the risk profile note above"
        ),
        "asset_allocation": "published as a chart — read it off the sheet if you need it",
        "performance": "printed as a table this template does not parse",
        "fund_size_zar": "not stated on every Satrix sheet — leave empty unless the document gives it",
    }

    def matches(self, url: str) -> bool:
        return any(host in url.lower() for host in self.hosts)
