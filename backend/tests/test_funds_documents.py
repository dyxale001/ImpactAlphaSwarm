"""Tests for fetching a manager's fact sheet and taking its text.

These are what survived `test_funds_extract.py`. The readers it covered were
removed — funds are entered by hand — but the fetch underneath them stayed,
because `archive_fund_documents.py` still downloads each seeded fund's document
to keep a copy the figures can be re-checked against.

**The guard matters more now, not less.** It used to be impossible to get wrong
by construction: a URL was fetchable if some `FactsheetTemplate` claimed its
host, so "hosts we can read" and "hosts we will download from" were one derived
list. With the readers gone the list is written out by hand in
`documents.ALLOWED_HOSTS`, and what stops this from becoming a
fetch-anything-an-admin-types endpoint is these tests.

Two of them assert something the deleted suite only described in a docstring:
that a host is matched on its parsed hostname and never as a substring of the
URL. That was a real defect once — every reader did
`any(host in url.lower() ...)` — and the note about it would have been deleted
along with the code that explained it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from src.funds.documents import (  # noqa: E402
    ALLOWED_HOSTS,
    FetchError,
    check_allowed,
    extract_text,
    fetch,
    host_allowed,
    normalise,
)


class TestFetchingIsBounded:
    """INVARIANT: the backend downloads only from hosts named in one list."""

    def test_a_host_that_is_not_listed_is_refused(self):
        with pytest.raises(FetchError, match="not a fund manager"):
            check_allowed("https://example.invalid/fund.pdf")

    def test_http_is_refused(self):
        with pytest.raises(FetchError, match="https"):
            check_allowed("http://satrix.co.za/fund/mdd/STX40")

    def test_a_listed_host_passes(self):
        check_allowed("https://satrix.co.za/fund/mdd/STX40")

    def test_something_that_is_not_an_address_is_refused(self):
        with pytest.raises(FetchError):
            check_allowed("https:///fund.pdf")

    def test_the_allowlist_is_not_empty(self):
        """An empty list would archive nothing at all, silently."""
        assert ALLOWED_HOSTS
        assert all(host and "/" not in host for host in ALLOWED_HOSTS)

    def test_every_seeded_sheet_is_still_reachable(self):
        """The list has to cover the catalogue it exists to archive.

        Derived from the seed rather than restated, so adding a fund on a new
        manager's host fails here instead of failing halfway through an archive
        run with eleven documents already stored.
        """
        import csv

        snapshots = BACKEND_ROOT / "data" / "funds" / "snapshots.csv"
        with snapshots.open(encoding="utf-8") as handle:
            urls = [row["mdd_url"] for row in csv.DictReader(handle) if row.get("mdd_url")]

        assert urls, "the seed has no fact-sheet URLs to check"
        unreachable = [url for url in urls if not host_allowed(url)]
        assert not unreachable, unreachable


class TestAHostIsMatchedOnItsHostname:
    """INVARIANT: the allowlist is a hostname test, never a substring test.

    Every reader once did `any(host in url.lower() ...)`, which is a substring
    match over the whole address. Both cases below passed it. The deleted suite
    explained the bug in a docstring and asserted neither, so they are asserted
    here — this is the check that decides what the server will fetch.
    """

    def test_a_listed_host_in_the_path_does_not_count(self):
        assert not host_allowed(
            "https://evil.example.com/resources.easyequities.co.za/x.pdf"
        )

    def test_a_listed_host_as_a_prefix_of_another_domain_does_not_count(self):
        assert not host_allowed("https://satrix.co.za.attacker.net/x.pdf")

    def test_a_subdomain_of_a_listed_host_does_count(self):
        assert host_allowed("https://www.satrix.co.za/fund/mdd/STX40")

    def test_a_lookalike_suffix_does_not_count(self):
        """`notsatrix.co.za` ends with the listed string but is another domain."""
        assert not host_allowed("https://notsatrix.co.za/x.pdf")

    def test_case_and_a_trailing_dot_are_normalised(self):
        assert host_allowed("https://WWW.Satrix.CO.ZA./x.pdf")

    def test_nothing_matches_an_address_with_no_host(self):
        assert not host_allowed("not-a-url")
        assert not host_allowed("")


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
        assert normalise(
            "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf"
            "?_ga=2.135063031.70250128.1788764106-1291023247.1788631183"
        ) == "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf"

    def test_the_same_sheet_pasted_twice_normalises_the_same_way(self):
        base = "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf"
        assert normalise(f"{base}?_ga=1.1.1") == normalise(f"{base}?_ga=9.9.9")

    def test_a_parameter_that_selects_a_document_is_kept(self):
        """Only visitor identifiers go. A query that picks the file stays."""
        assert normalise("https://satrix.co.za/mdd?code=STX40&_ga=1.2.3") == (
            "https://satrix.co.za/mdd?code=STX40"
        )

    def test_a_space_in_the_path_is_encoded(self):
        """The original reason this function exists: an unencoded space makes
        these hosts answer 200 with an HTML page instead of 404."""
        assert "%20" in normalise("https://resources.easyequities.co.za/Unit Trusts/A.pdf")

    def test_spaces_in_a_real_fundrock_link(self):
        encoded = normalise("https://www.bcis.co.za/funds/FR Best Blend Cautious (C).pdf")
        assert " " not in encoded
        assert encoded.startswith("https://www.bcis.co.za/")


class _Response:
    """The parts of an httpx response `fetch` actually looks at.

    A response carrying a `location` defaults to `302`, because that is what a
    real redirect carries and `fetch` reads the status code after the hop loop.
    Giving a redirect a `200` here made the loop's exit look like a successful
    download, which is a property of the stub and not of the code.
    """

    def __init__(self, content=b"%PDF-1.7 ok", status_code=None, location=None):
        self.content = content
        self.headers = {"location": location} if location else {}
        self.is_redirect = location is not None
        if status_code is None:
            status_code = 302 if location else 200
        self.status_code = status_code


class _Client:
    def __init__(self, *responses):
        self._responses = list(responses)
        self.requested = []

    def get(self, url, headers=None):
        self.requested.append(url)
        return self._responses.pop(0)


class TestTheBytesDecideNotTheStatusCode:
    """INVARIANT: a download is a fact sheet only if it starts with %PDF.

    These hosts answer a wrong path with `200` and an HTML error page rather
    than a 404 — an unencoded space in a FundRock URL does exactly that. Storing
    one of those as an archived document would put an error page in the audit
    trail under a real fund's ISIN.
    """

    def test_a_pdf_comes_back(self):
        client = _Client(_Response(b"%PDF-1.7 real document"))
        got = fetch("https://satrix.co.za/x.pdf", client=client)
        assert got.content.startswith(b"%PDF")

    def test_an_html_page_answered_with_200_is_refused(self):
        client = _Client(_Response(b"<!DOCTYPE html><title>Not found</title>"))
        with pytest.raises(FetchError, match="did not return a PDF"):
            fetch("https://satrix.co.za/x.pdf", client=client)

    def test_a_non_200_says_what_the_site_returned(self):
        client = _Client(_Response(b"", status_code=503))
        with pytest.raises(FetchError, match="503"):
            fetch("https://satrix.co.za/x.pdf", client=client)

    def test_a_file_too_large_to_be_a_fact_sheet_is_refused(self):
        from src.funds import documents

        client = _Client(_Response(b"%PDF" + b"x" * (documents.MAX_BYTES + 1)))
        with pytest.raises(FetchError, match="too large"):
            fetch("https://satrix.co.za/x.pdf", client=client)


class TestRedirectsCannotLeaveTheAllowlist:
    """INVARIANT: a manager's site cannot bounce this onto another host.

    Redirects are followed by hand for exactly this reason, so the allowlist is
    re-checked at every hop rather than only on the address that was typed.
    """

    def test_a_redirect_within_the_allowlist_is_followed(self):
        client = _Client(
            _Response(location="https://www.satrix.co.za/final.pdf"),
            _Response(b"%PDF-1.7 arrived"),
        )
        got = fetch("https://satrix.co.za/x.pdf", client=client)
        assert got.url == "https://www.satrix.co.za/final.pdf"
        assert got.content.startswith(b"%PDF")

    def test_a_redirect_off_the_allowlist_is_refused(self):
        client = _Client(_Response(location="https://evil.example.com/x.pdf"))
        with pytest.raises(FetchError, match="not a fund manager"):
            fetch("https://satrix.co.za/x.pdf", client=client)

    def test_a_chain_longer_than_the_hop_cap_is_refused(self):
        """Three hops, then the redirect itself fails the status check.

        The cap does not raise on its own — it stops following, and the 302 it
        stopped on is what `fetch` then refuses. So the message names the status
        rather than the looping, which is worth knowing when reading a log, and
        the outcome that matters is that it never returns a redirect as a
        document.
        """
        client = _Client(*[_Response(location="https://satrix.co.za/x.pdf")] * 5)
        with pytest.raises(FetchError, match="302"):
            fetch("https://satrix.co.za/x.pdf", client=client)
        assert len(client.requested) == 4, "followed more hops than the cap allows"


class TestTakingTheText:
    """The text layer is archived beside the PDF, and nothing parses it.

    It exists so that re-checking a figure a person typed is a search rather
    than a page-by-page read.
    """

    def _one_page_pdf(self, text: str) -> bytes:
        pymupdf = pytest.importorskip("pymupdf")
        document = pymupdf.open()
        page = document.new_page()
        if text:
            page.insert_text((72, 72), text, fontsize=11)
        out = document.tobytes()
        document.close()
        return out

    def test_it_returns_what_the_document_says(self):
        pdf = self._one_page_pdf("Total Expense Ratio (TER) 1.26")
        assert "Total Expense Ratio" in extract_text(pdf)

    def test_a_document_with_no_text_layer_comes_back_empty_not_broken(self):
        """A scanned sheet still has to archive; the PDF is the record."""
        assert extract_text(self._one_page_pdf("")).strip() == ""
