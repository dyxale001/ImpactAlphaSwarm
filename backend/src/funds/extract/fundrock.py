"""FundRock Collective Investments, which issues for many boutique managers.

One template covers around 580 fund classes from roughly thirty brands, which is
what makes a per-ManCo reader worth writing at all: resolve the layout once and
most of the catalogue is readable.

FundRock **prints its risk rating as text** ("Low Risk", "Moderate - High Risk")
as well as drawing it, so this template reads it — unlike Satrix, which only
draws it. That difference is the single thing deciding whether a manager's funds
can be pre-filled completely, so it is stated here rather than inferred.

Two traps this encodes, both learned from real sheets:

*A JSE code does not mean listed.* FundRock prints one on unit trusts, where it
identifies the fund for dealing. The vehicle is decided by the Yahoo `.JO`
symbol instead, which is not on the sheet at all — so it is refused here.

*Not every fund on FundRock's index uses FundRock's template.* Anchor issues its
own, and its sheet carries no ISIN anywhere. Those come back with almost
everything unresolved, which is the correct answer: the form then falls back to
manual entry rather than showing a page of confident nonsense.
"""

from __future__ import annotations

from .base import FactsheetTemplate


class FundRockTemplate(FactsheetTemplate):
    name = "fundrock"
    hosts = ("www.bcis.co.za", "bcis.co.za")

    patterns = {
        "as_of": r"MINIMUM DISCLOSURE DOCUMENT \| (\d{1,2} [A-Z]+ 20\d\d)",
        "isin": r"ISIN Number:\s*([A-Z]{2}[A-Z0-9]{9}\d)",
        "jse_code": r"JSE Code:\s*([A-Z0-9]+)",
        "asisa_category": r"ASISA Category:\s*([^\n]{4,60})",
        "benchmark": r"Fund Benchmark:\s*([^\n]{2,70})",
        "ter": r"Total Expense Ratio \(TER\):[^\n]*?:\s*([\d.]+)%",
        "tc": r"Portfolio Transaction Cost:[^\n]*?:\s*([\d.]+)%",
        "tic": r"Total Investment Charge:[^\n]*?:\s*([\d.]+)%",
        "fund_size_zar": r"Portfolio Value:\s*R\s*([\d  ]+)",
        "distribution_frequency": r"Date of Income Declaration:\s*([^\n]{2,60})",
        # The rating is printed under the RISK PROFILE heading. The scale is also
        # abbreviated elsewhere on the sheet ("Low-Mod / Mod / Mod-High"), which
        # is why this anchors on the heading rather than matching the words.
        # The whole line is captured, not a truncation of it, so `ambiguous`
        # below can see a sheet that prints two ratings.
        "risk_indicator_raw": r"RISK PROFILE\s*\n([^\n]{3,80})",
        "objective": (
            r"INVESTMENT OBJECTIVE\s*\n(.{20,400}?)\n(?:INVESTMENT POLICY|INVESTMENT STRATEGY)"
        ),
    }

    numeric = frozenset({"ter", "tc", "tic", "fund_size_zar"})

    dates = frozenset({"as_of"})

    ambiguous = {
        # A property fund prints "Moderate Risk / Moderate- High Risk (Property
        # Funds)": two ratings, because property funds carry their own scale.
        # They are a whole step apart on the ceiling that decides who sees this
        # fund, so neither may be pre-filled.
        "risk_indicator_raw": (
            r"/",
            "this sheet prints more than one risk rating on the same line — read which one "
            "applies to this fund and enter it",
        ),
    }

    refuses = {
        "asset_allocation": (
            "published as a chart on this sheet — read the breakdown and type it in"
        ),
        "performance": (
            "printed as a table this template does not parse — copy the annualised row"
        ),
        "recommended_min_term_years": (
            "this sheet states a horizon in words rather than years — leave empty unless "
            "the document gives a number"
        ),
        "yahoo_symbol": (
            "not on the fact sheet. Only an ETF has one, and a JSE code here does not mean "
            "the fund is listed — FundRock prints one on unit trusts too"
        ),
    }
