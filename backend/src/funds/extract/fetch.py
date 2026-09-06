"""Fetching a fact sheet the admin asked for, safely.

The backend downloads a URL a person typed. That is a request made from inside
the network on someone else's say-so, so it is bounded rather than trusted:

* **Only hosts a template claims.** Not a general fetcher with a blocklist —
  every host here is one whose layout we can actually read, so the allowlist and
  the useful set are the same list and cannot drift apart.
* **https only**, no redirects followed to another host, and a short timeout.
* **The bytes decide, not the status code.** These hosts answer a bad path with
  `200` and an HTML error page: an unencoded space in a FundRock URL does
  exactly that. A download is a fact sheet only if it starts with `%PDF`.
* **A size cap**, so a mistyped URL pointing at something enormous cannot fill
  memory.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote, urlparse, urlunparse

import httpx

from .registry import template_for

# Generous for a fact sheet (they run 100KB-1MB) and far below anything that
# would hurt.
MAX_BYTES = 25 * 1024 * 1024
TIMEOUT_SECONDS = 45


class FetchError(Exception):
    """The document could not be fetched, with a reason worth showing an admin."""


@dataclass(frozen=True)
class Fetched:
    url: str
    content: bytes


def normalise(url: str) -> str:
    """Percent-encode the path, leaving scheme and host alone.

    Manager index pages carry literal spaces in their links, and an unencoded
    space is what makes these hosts answer 200 with HTML instead of 404.
    """
    parts = urlparse(url.strip())
    return urlunparse(parts._replace(path=quote(parts.path, safe="/%")))


def check_allowed(url: str) -> None:
    """Raise unless this is an https URL on a host some template reads."""
    parts = urlparse(url)
    if parts.scheme != "https":
        raise FetchError("Only https addresses can be fetched.")
    if not parts.hostname:
        raise FetchError("That does not look like a web address.")
    if template_for(url) is None:
        raise FetchError(
            f"{parts.hostname} is not a fund manager this can read yet. "
            "Enter the figures by hand, or add a template for this manager."
        )


def fetch(url: str, client: Optional[httpx.Client] = None) -> Fetched:
    """Download one fact sheet. Raises FetchError with something an admin can act on."""
    target = normalise(url)
    check_allowed(target)

    owned = client is None
    client = client or httpx.Client(timeout=TIMEOUT_SECONDS, follow_redirects=False)
    try:
        response = client.get(target, headers={"User-Agent": "AlphaSwarm/fund-catalogue"})

        # Redirects are followed by hand so a manager cannot bounce this request
        # onto a host no template claims.
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
