"""Tests for reading a fact sheet.

The claim that matters is **the extractor refuses rather than guesses**.

A pre-filled form is reviewed less carefully than an empty one — that is just
how people work — so a field the template cannot read confidently has to arrive
blank, with a reason, rather than filled with a plausible value. This is not a
hypothetical risk. Satrix draws its risk rating as a filled step on a five-word
scale, and the PDF's text layer lists all five words whatever the rating; a text
match returned a confident wrong answer, and the AGGRESSIVE-rated Satrix 40 ETF
went into this catalogue as "publishes no risk indicator" and stayed wrong in
two documents until somebody rendered the page and looked.

The second claim is that the fetcher is bounded: it downloads only from hosts a
template can actually read, only over https, and only accepts something whose
bytes say PDF — these sites answer a wrong path with 200 and a web page.

No network anywhere in this file.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds.extract import readable_hosts, template_for  # noqa: E402
from src.funds.extract.base import Extraction, FactsheetTemplate, Reading  # noqa: E402
from src.funds.extract.fetch import FetchError, check_allowed, normalise  # noqa: E402
from src.funds.extract.fundrock import FundRockTemplate  # noqa: E402
from src.funds.extract.satrix import SatrixTemplate  # noqa: E402

# Trimmed from the real sheets, keeping the layout that matters.
FUNDROCK_TEXT = """
3B FR INCOME FUND (A)
MINIMUM DISCLOSURE DOCUMENT | 31 JULY 2026
ISIN Number: ZAE000309852
JSE Code: BCIIFA
ASISA Category: SA Multi Asset Income
Fund Benchmark: SteFI Composite Index
Portfolio Value: R 527 491 584
Total Expense Ratio (TER): Mar 26 : 0.71%
Portfolio Transaction Cost: Mar 26 : 0.00%
Total Investment Charge: Mar 26 : 0.71%
Date of Income Declaration: 31 Mar/30 Jun/30 Sep/31 Dec
RISK PROFILE
Low Risk
INVESTMENT OBJECTIVE
The objective is to achieve a high level of sustainable income.
INVESTMENT POLICY
"""

SATRIX_TEXT = """
Satrix ILBI Portfolio ETF
Minimum Disclosure Document
31 July 2026
This fund is designed to track the bond
benchmark and has a medium-term investment horizon.
RISK PROFILE
CONSERVATIVE CAUTIOUS MODERATE MODERATE-AGGRESSIVE AGGRESSIVE
Total Expense Ratio (TER) 0.25 0.25
Transaction Cost (TC) 0.00 0.00
Total Investment Charge (TIC) 0.25 0.25
Inception Date 24 February 2017
JSE Code STXILB
ISIN Code ZAE000240123
Benchmark FTSE/JSE Inflation-Linked Government Index
ASISA Classification South African - Interest Bearing - Variable Term
Distribution Frequency Monthly
"""


class TestItRefusesRatherThanGuesses:
    """INVARIANT: an unreadable field arrives blank, with a reason."""

    def test_satrix_never_returns_a_risk_rating(self):
        extraction = SatrixTemplate().extract(SATRIX_TEXT, "https://satrix.co.za/fund/mdd/STXILB")
        assert "risk_indicator_raw" not in extraction.fields
        assert "risk_indicator_1to5" not in extraction.fields

    def test_and_says_why_so_the_reviewer_knows_what_to_do(self):
        extraction = SatrixTemplate().extract(SATRIX_TEXT, "https://satrix.co.za/fund/mdd/STXILB")
        reason = next(u.reason for u in extraction.unresolved if u.field == "risk_indicator_raw")
        assert "read which step" in reason.lower()

    def test_even_though_every_scale_word_is_in_the_text(self):
        # The exact trap: all five words are present, so a naive match finds one.
        for word in ("CONSERVATIVE", "CAUTIOUS", "MODERATE", "AGGRESSIVE"):
            assert word in SATRIX_TEXT
        extraction = SatrixTemplate().extract(SATRIX_TEXT, "https://satrix.co.za/fund/mdd/STXILB")
        assert not any("AGGRESSIVE" in str(v) for v in extraction.fields.values())

    def test_a_manager_that_prints_the_rating_has_it_read(self):
        # FundRock prints it as text as well as drawing it, so it is readable —
        # the difference between the two managers, and why templates are per
        # manager rather than one clever reader.
        extraction = FundRockTemplate().extract(FUNDROCK_TEXT, "https://www.bcis.co.za/x.pdf")
        assert extraction.fields["risk_indicator_raw"] == "Low Risk"

    def test_a_field_the_pattern_misses_is_unresolved_not_absent(self):
        # Silence would look identical to a field the template does not know
        # about; the reviewer needs to be told to go and read it.
        extraction = FundRockTemplate().extract("nothing useful here", "https://www.bcis.co.za/x.pdf")
        assert {u.field for u in extraction.unresolved} >= {"isin", "ter", "as_of"}
        assert extraction.fields == {}


class TestEvidence:
    """INVARIANT: every value carries the text it was read from."""

    def test_each_reading_quotes_its_source(self):
        extraction = FundRockTemplate().extract(FUNDROCK_TEXT, "https://www.bcis.co.za/x.pdf")
        assert "ZAE000309852" in extraction.evidence["isin"]
        assert "0.71" in extraction.evidence["ter"]

    def test_evidence_covers_every_field_that_was_read(self):
        extraction = FundRockTemplate().extract(FUNDROCK_TEXT, "https://www.bcis.co.za/x.pdf")
        assert set(extraction.evidence) == set(extraction.fields)


class TestReadingRealLayouts:
    """The two traps that produced wrong values on real sheets."""

    def test_prose_does_not_win_over_the_labelled_benchmark(self):
        # Satrix says "...track the bond benchmark and has a medium-term
        # investment horizon" in a sentence before the labelled field. Matched
        # case-insensitively, the sentence wins and the form pre-fills a
        # benchmark of "and has a medium-term investment horizon."
        extraction = SatrixTemplate().extract(SATRIX_TEXT, "https://satrix.co.za/fund/mdd/STXILB")
        assert extraction.fields["benchmark"] == "FTSE/JSE Inflation-Linked Government Index"

    def test_the_effective_fee_beats_the_historic_one(self):
        # Where a fee was cut the sheet prints both. The TIC row reflects the
        # effective TER, so taking the historic one makes the row internally
        # inconsistent — and regex alternation cannot express the preference,
        # because it matches whichever appears first in the document.
        text = SATRIX_TEXT.replace(
            "Total Expense Ratio (TER) 0.25 0.25",
            "Total Expense Ratio (TER) 0.27 0.32\nEffective 01 Oct 2025\n0.25 0.25",
        )
        extraction = SatrixTemplate().extract(text, "https://satrix.co.za/fund/mdd/STXWDM")
        assert extraction.fields["ter"] == 0.25

    def test_a_jse_code_on_a_unit_trust_does_not_imply_listing(self):
        # FundRock prints one on unit trusts, where it identifies the fund for
        # dealing. The vehicle is decided by the Yahoo symbol, which is not on
        # the sheet at all — so the template refuses to supply it.
        extraction = FundRockTemplate().extract(FUNDROCK_TEXT, "https://www.bcis.co.za/x.pdf")
        assert extraction.fields["jse_code"] == "BCIIFA"
        assert "yahoo_symbol" in {u.field for u in extraction.unresolved}

    def test_a_sheet_on_another_managers_template_yields_almost_nothing(self):
        # Anchor issues its own sheet from FundRock's index, and it carries no
        # ISIN anywhere. The right outcome is an empty form, not a full one.
        extraction = FundRockTemplate().extract(
            "Anchor Capital\nIssue Date: 11 August 2026\nThis portfolio has no equity exposure.",
            "https://www.bcis.co.za/anchor.pdf",
        )
        assert "isin" not in extraction.fields


class TestChoosingATemplate:
    @pytest.mark.parametrize(
        "url,expected",
        [
            ("https://satrix.co.za/fund/mdd/STX40", "satrix"),
            ("https://www.satrix.co.za/fund/mdd/STX40", "satrix"),
            ("https://www.bcis.co.za/upload/x.pdf", "fundrock"),
            ("https://bcis.co.za/upload/x.pdf", "fundrock"),
        ],
    )
    def test_a_url_finds_its_manager(self, url, expected):
        assert template_for(url).name == expected

    def test_an_unknown_manager_has_no_template(self):
        assert template_for("https://coronation.com/fund.pdf") is None


class TestFetchingIsBounded:
    """INVARIANT: the backend only fetches what a template can read."""

    def test_only_hosts_a_template_claims(self):
        # The allowlist and the useful set are the same list, so they cannot
        # drift apart into "allowed but unreadable".
        with pytest.raises(FetchError, match="not a fund manager"):
            check_allowed("https://example.invalid/fund.pdf")

    def test_http_is_refused(self):
        with pytest.raises(FetchError, match="https"):
            check_allowed("http://satrix.co.za/fund/mdd/STX40")

    def test_a_claimed_host_passes(self):
        check_allowed("https://satrix.co.za/fund/mdd/STX40")

    def test_the_allowlist_is_the_readers_own_hosts(self):
        """The allowlist and the readable set are one list, so they cannot drift.

        Asserted against whichever readers are configured rather than a
        hard-coded pair: the model reader claims a host the templates do not
        (`resources.easyequities.co.za`), and the invariant is that the server
        will fetch from exactly the hosts something can read — not that the set
        never changes.
        """
        from src.funds.extract.registry import TEMPLATES

        assert set(readable_hosts()) == {host for r in TEMPLATES for host in r.hosts}
        assert set(readable_hosts()), "an empty allowlist would fetch nothing at all"

    def test_spaces_in_a_path_are_encoded(self):
        # An unencoded space is what makes these hosts answer 200 with an HTML
        # page instead of the document — the soft 404 the PDF check catches.
        encoded = normalise("https://www.bcis.co.za/funds/FR Best Blend Cautious (C).pdf")
        assert " " not in encoded
        assert encoded.startswith("https://www.bcis.co.za/")


class TestTheResultShape:
    def test_it_serialises_for_the_form(self):
        extraction = Extraction(
            template="t",
            url="https://x",
            readings=(Reading("isin", "ZAE000000001", "ISIN Number: ZAE000000001"),),
        )
        body = extraction.as_dict()
        assert body["fields"] == {"isin": "ZAE000000001"}
        assert body["evidence"]["isin"].startswith("ISIN")
        assert body["unresolved"] == []

    def test_a_reader_must_say_which_hosts_it_reads(self):
        """`matches` is shared now, so the declaration is the `hosts` tuple.

        It used to be an abstract method each reader implemented with
        `any(host in url.lower() ...)` — a substring test over the whole address,
        which matched `evil.example.com/satrix.co.za/x.pdf`. Since this list is
        also the fetch allowlist, that was worth removing from every reader at
        once rather than trusting three copies to stay right.

        What has to hold now is that a registered reader declares hosts: one
        with an empty tuple matches nothing and would be dead code sitting in
        the allowlist's way.
        """
        from src.funds.extract.registry import build_readers

        for enabled in (False, True):
            for reader in build_readers(llm_enabled=enabled):
                assert reader.hosts, f"{reader.name} declares no hosts"
                assert all(h and "/" not in h for h in reader.hosts), reader.name

    def test_a_bare_reader_claims_nothing(self):
        """The base class is safe by default: no hosts, no claims."""
        assert FactsheetTemplate.hosts == ()
        assert not FactsheetTemplate().matches("https://satrix.co.za/x")

class TestTrackingParametersAreDropped:
    """INVARIANT: the same document has the same address every time.

    A fact-sheet URL copied out of a browser carries Google Analytics
    parameters: `…/AGTBC.pdf?_ga=2.135063031.70250128.1788764106-1291023247…`.
    The URL is STORED, on a row whose identity is a hash of everything
    transcribed — `mdd_url` included — so keeping the parameter would make one
    sheet look like a new reading every time somebody recorded it, and would put
    a session identifier on a public page.
    """

    def test_a_google_analytics_parameter_is_removed(self):
        from src.funds.extract.fetch import normalise

        assert normalise(
            "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf"
            "?_ga=2.135063031.70250128.1788764106-1291023247.1788631183"
        ) == "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf"

    def test_the_same_sheet_pasted_twice_normalises_the_same_way(self):
        from src.funds.extract.fetch import normalise

        base = "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf"
        assert normalise(f"{base}?_ga=1.1.1") == normalise(f"{base}?_ga=9.9.9")

    def test_a_parameter_that_selects_a_document_is_kept(self):
        """Only visitor identifiers go. A query that picks the file stays."""
        from src.funds.extract.fetch import normalise

        assert normalise("https://satrix.co.za/mdd?code=STX40&_ga=1.2.3") == (
            "https://satrix.co.za/mdd?code=STX40"
        )

    def test_a_space_in_the_path_is_still_encoded(self):
        """The original reason this function exists: an unencoded space makes
        these hosts answer 200 with an HTML page instead of 404."""
        from src.funds.extract.fetch import normalise

        assert "%20" in normalise("https://resources.easyequities.co.za/Unit Trusts/A.pdf")
