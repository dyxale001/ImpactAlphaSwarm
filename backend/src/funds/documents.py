"""Fetching a manager's fact sheet and taking its text, for the audit archive.

Every figure in the catalogue is typed in by a person from the document its
manager published. Nothing here reads a figure. What this module does is keep a
copy: `archive_fund_documents.py` downloads each seeded fund's sheet and stores
it with its text layer, so that when a manager's link rots — one platform-hosted
sheet found during design was five years stale — the evidence a figure was
checked against still exists.

## The allowlist is written out here, and it used to not be

This was `funds/extract/fetch.py`, and its allowlist was *derived*: a URL was
fetchable if some `FactsheetTemplate` claimed its host, so "hosts we can read"
and "hosts we will download from" were one list and could not drift apart. That
was the better design while readers existed. They have been removed — funds are
entered by hand — and with them went the thing that computed this list.

So it is stated explicitly below, and the guard it feeds matters more now rather
than less: `fetch` downloads an address a person typed into an admin form, which
is a request made from inside the network on someone else's say-so. It stays
bounded the way it always was:

* **Only hosts on `ALLOWED_HOSTS`**, matched on parsed hostname — never as a
  substring of the URL. That distinction is not hypothetical: a substring test
  passes `https://evil.example.com/resources.easyequities.co.za/x.pdf` and
  `https://satrix.co.za.attacker.net/x`.
* **https only**, with redirects followed by hand so a manager's site cannot
  bounce the request onto a host that is not on the list.
* **The bytes decide, not the status code.** These hosts answer a bad path with
  `200` and an HTML error page — an unencoded space in a FundRock URL does
  exactly that. A download is a fact sheet only if it starts with `%PDF`.
* **A size cap**, so a mistyped URL pointing at something enormous cannot fill
  memory.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

import httpx

#: Hosts a seeded fact sheet is fetched from. Every one of these publishes the
#: documents the catalogue's funds were transcribed from: `bcis.co.za` is
#: FundRock's, which issues on one template for around thirty boutiques;
#: `satrix.co.za` is Satrix's own; `resources.easyequities.co.za` is where the
#: platform re-hosts a manager's sheet, which is the copy a user following a
#: link from the platform actually sees.
#:
#: Adding a manager is one entry, and it is a deliberate act rather than a
#: configuration detail — a host here is a host this backend will download from.
ALLOWED_HOSTS: tuple[str, ...] = (
    "bcis.co.za",
    "www.bcis.co.za",
    "satrix.co.za",
    "www.satrix.co.za",
    "resources.easyequities.co.za",
    # Added 2026-09-09 with the Coronation, Discovery and Momentum funds. The
    # list has to cover the catalogue it exists to archive, and
    # `test_every_seeded_sheet_is_still_reachable` fails when it does not —
    # which is how these three arrived rather than being noticed mid-run.
    "coronation.com",
    "www.coronation.com",
    "discovery.co.za",
    "www.discovery.co.za",
    "wealth.momentum.co.za",
    "allangray.co.za",
    "www.allangray.co.za",
)

# Generous for a fact sheet (they run 100KB-1MB) and far below anything that
# would hurt.
MAX_BYTES = 25 * 1024 * 1024
TIMEOUT_SECONDS = 45

#: Query parameters that identify a visitor rather than a document. Google
#: Analytics adds `_ga` and friends to every link copied out of a browser, and a
#: pasted fact-sheet URL usually carries one.
TRACKING_PARAMS = ("_ga", "_gl", "_gac", "gclid", "fbclid")


class FetchError(Exception):
    """The document could not be fetched, with a reason worth showing a person.

    Every message that reaches this is written for whoever is archiving, and
    says what went wrong in terms they can act on: a link to re-copy, a host to
    add, a page that answered with HTML.
    """


@dataclass(frozen=True)
class Fetched:
    url: str
    content: bytes


def normalise(url: str) -> str:
    """Canonicalise a URL: encode the path, drop tracking parameters.

    Manager index pages carry literal spaces in their links, and an unencoded
    space is what makes these hosts answer 200 with HTML instead of 404.

    Tracking parameters are stripped because the URL is STORED, and stored on a
    row whose identity is a hash of everything transcribed — `mdd_url` included.
    A sheet pasted from a browser arrives as
    `…/AGTBC.pdf?_ga=2.135063031.70250128.1788764106-1291023247.1788631183`,
    and the same document pasted tomorrow carries a different `_ga`. Kept, that
    would make one fact sheet look like a new reading every time somebody
    recorded it, and would put a session identifier on a public page.

    Only parameters that identify a visitor are dropped. A parameter that
    selects a document is part of the address and is left alone.
    """
    parts = urlparse(url.strip())
    kept = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in TRACKING_PARAMS
    ]
    return urlunparse(
        parts._replace(
            path=quote(parts.path, safe="/%"),
            query=urlencode(kept),
        )
    )


def host_allowed(url: str) -> bool:
    """Whether a URL's HOSTNAME is on the allowlist.

    Parsed, lower-cased, trailing dot stripped, and matched exactly or as a
    subdomain — `www.satrix.co.za` matches `satrix.co.za`, and
    `satrix.co.za.attacker.net` does not.

    The parsing is the point. Every reader here once did
    `any(host in url.lower() ...)`, a substring test over the whole address, so
    `https://evil.example.com/resources.easyequities.co.za/x.pdf` matched and so
    did `https://satrix.co.za.attacker.net/x`. Since this list is also what the
    server will fetch, that was the difference between "the managers we archive"
    and "anywhere, as long as the string appears somewhere in the URL".
    """
    hostname = (urlparse(url.strip()).hostname or "").lower().rstrip(".")
    if not hostname:
        return False
    return any(
        hostname == host or hostname.endswith(f".{host}")
        for host in (h.lower() for h in ALLOWED_HOSTS)
    )


def check_allowed(url: str) -> None:
    """Raise unless this is an https URL on an allowlisted host."""
    parts = urlparse(url)
    if parts.scheme != "https":
        raise FetchError("Only https addresses can be fetched.")
    if not parts.hostname:
        raise FetchError("That does not look like a web address.")
    if not host_allowed(url):
        raise FetchError(
            f"{parts.hostname} is not a fund manager this archives from yet. "
            "Add it to ALLOWED_HOSTS in src/funds/documents.py if it should be."
        )


def fetch(url: str, client: Optional[httpx.Client] = None) -> Fetched:
    """Download one fact sheet. Raises FetchError with something actionable."""
    target = normalise(url)
    check_allowed(target)

    owned = client is None
    client = client or httpx.Client(timeout=TIMEOUT_SECONDS, follow_redirects=False)
    try:
        response = client.get(target, headers={"User-Agent": "AlphaSwarm/fund-catalogue"})

        # Redirects are followed by hand so a manager cannot bounce this request
        # onto a host that is not on the allowlist.
        hops = 0
        while response.is_redirect and hops < 3:
            location = response.headers.get("location", "")
            nxt = normalise(httpx.URL(target).join(location).__str__())
            check_allowed(nxt)
            target, response, hops = nxt, client.get(nxt), hops + 1

        if response.status_code != 200:
            raise FetchError(f"The manager's site returned {response.status_code} for that address.")

        content = response.content
        if len(content) > MAX_BYTES:
            raise FetchError("That file is too large to be a fact sheet.")
        if content[:4] != b"%PDF":
            # The soft 404: 200, with an HTML page where the document should be.
            raise FetchError(
                "That address did not return a PDF. Check the link on the manager's site — "
                "these sites answer a wrong path with a web page rather than an error."
            )
        return Fetched(url=target, content=content)
    except httpx.HTTPError as e:
        raise FetchError(f"Could not reach the manager's site: {e}") from e
    finally:
        if owned:
            client.close()


def extract_text(pdf: bytes) -> str:
    """The text layer of a fact sheet, for the archive.

    This is a transcription of the document, not a reading of it: nothing
    downstream parses a figure out of this string. It is stored beside the PDF
    so that re-checking a figure a person typed is a search rather than a
    page-by-page read.

    `pypdf` is imported here rather than at module scope so the served app can
    import this module without it installed: archiving is an admin task, and the
    API that serves the catalogue never opens a PDF.
    """
    import io

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf))
    return "\n".join((page.extract_text() or "") for page in reader.pages)
