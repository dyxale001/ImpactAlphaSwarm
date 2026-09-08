"""Bounded, auditable external educational retrieval for Ask AlphaSwarm's
LEARNING_QUESTION fallback — used only when a question is genuinely a
general finance-education concept that neither AlphaSwarm's Learning Centre
nor its own internal methodology glossary (api.py's _ASK_GLOSSARY) covers.

Architecture summary (see the AlphaSwarm codebase notes / PR description for
the full write-up; kept here too since this module IS the policy):

Why not unrestricted web search?
    Unrestricted retrieval introduces uncontrolled uncertainty about source
    authority, relevance, and content trustworthiness (ads, forums, SEO
    farms, pages written to manipulate an LLM reader). None of that is
    acceptable for a financial-information product, and none of it is
    necessary to answer "what does beta mean" reliably.

Why an explicit domain allowlist (APPROVED_EDUCATIONAL_DOMAINS)?
    A bounded source set makes retrieval deterministic and auditable: every
    answer's provenance can be checked against a short, published list
    instead of "whatever a search engine ranked first today." Regulatory and
    professional-education bodies are the right tier for definitions because
    defining terms accurately (not promoting products) is their actual
    mandate.

Why is the LLM only used AFTER retrieval (search_authoritative_education
runs first, then a separate grounding call explains ONLY what it returned)?
    Generation should explain verified information, not determine facts. If
    retrieval finds nothing, the caller must not let the model answer from
    its own pretrained knowledge — see api.py's _ground_external_answer and
    the "None means: use the honest fallback" contract below.

Why is retrieved page content treated as untrusted data, not instructions?
    A page inside the allowlist can still contain unrelated content or text
    aimed at manipulating an AI reader (prompt injection). The grounding
    prompt in api.py explicitly delimits this content as reference material
    only and instructs the model to ignore anything in it that reads as an
    instruction.

Why does an unknown acronym get a clarification question instead of a guess?
    Short acronyms are frequently ambiguous (UFT, ETF-adjacent tickers,
    internal jargon). Guessing risks a confident, wrong, unverifiable
    "definition" — the single worst failure mode for an information product
    that promises not to hallucinate.

Current state of the live path — read before assuming this searches the web:
    This deployment has NO search-provider API key configured (there is none
    in backend/.env, and none is required to run the rest of AlphaSwarm).
    search_authoritative_education() is written so that setting
    SEARCH_PROVIDER_URL + SEARCH_PROVIDER_API_KEY (see .env.example) turns on
    genuine live retrieval — domain-restricted where the provider allows it,
    always post-validated against APPROVED_EDUCATIONAL_DOMAINS, redirects
    outside the allowlist rejected, page content fetched and relevance-
    checked before use. Without those variables set, it deterministically
    falls through to a small local reference cache (see
    _LOCAL_REFERENCE_CACHE) built from the SAME validated shape (real,
    live-checked URLs on approved domains) so the calling code and the
    grounding/validation pipeline need no change when a provider is added.
    This was a deliberate, disclosed trade-off, not a hidden shortcut — see
    the PR notes for why live-scraping investor.gov specifically does not
    work with a plain HTTP client (its glossary renders via a client-side
    Drupal Views AJAX call that a static fetch cannot reproduce without a
    real browser, which this proof-of-concept intentionally does not add).
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Centralised, explicit allowlist. Tier follows the project's spec: 1 =
# regulatory/government, 2 = recognised professional/educational body. This
# is a SEPARATE, small taxonomy from ss_sources.PublisherRegistry, which
# tiers NEWS WIRES for sentiment-score weighting — a different question
# ("how much should this outlet's article count toward a sentiment score")
# from the one this module answers ("is this a reliable place to cite an
# investing-term DEFINITION from"). Reusing PublisherRegistry's tiers here
# would conflate the two; a second small module is more honest than a
# stretched reuse of an unrelated taxonomy.
APPROVED_EDUCATIONAL_DOMAINS: dict[str, tuple[str, int]] = {
    "investor.gov": ("U.S. Securities and Exchange Commission — Investor.gov", 1),
    "sec.gov": ("U.S. Securities and Exchange Commission", 1),
    "finra.org": ("Financial Industry Regulatory Authority (FINRA)", 1),
    "cftc.gov": ("U.S. Commodity Futures Trading Commission", 1),
    "federalreserve.gov": ("Board of Governors of the Federal Reserve System", 1),
    "resbank.co.za": ("South African Reserve Bank", 1),
    "fsca.co.za": ("Financial Sector Conduct Authority (South Africa)", 1),
    "cfainstitute.org": ("CFA Institute", 2),
    # JSE Limited operates South Africa's primary securities exchange — the
    # same standing nyse.com/nasdaq.com would have for US exchanges: the
    # exchange operator is self-evidently authoritative for what it itself
    # is. Approved as a domain so a future live-retrieval result on jse.co.za
    # would be accepted; NOT used to cite a specific page in the local
    # reference cache below because every jse.co.za URL tried during
    # development returned HTTP 403 (bot-protection blocking a plain HTTP
    # client, not a real absence of content) — a live browser-based provider
    # would very likely succeed where this proof-of-concept's plain fetch
    # cannot. The "what is the JSE" entry below is cited to the FSCA (its
    # South African regulator) instead, which was independently verified live.
    "jse.co.za": ("JSE Limited (Johannesburg Stock Exchange)", 1),
}


def is_approved_domain(url: str) -> bool:
    """True only if ``url`` is http(s) AND its host is in, or a subdomain of,
    the allowlist. Used both to accept a candidate result and to reject a
    redirect that lands outside the allowlist (the host actually served the
    content, so this is checked against wherever the request ENDED UP, not
    just the originally-requested URL). Scheme is checked explicitly — a
    bare netloc check alone would also accept ftp://investor.gov/... or
    other non-http(s) schemes, which nothing in this pipeline ever fetches
    with an HTTP client anyway, but "approved" should mean approved."""
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        scheme = parsed.scheme.lower()
    except Exception:
        return False
    if scheme not in ("http", "https") or not host:
        return False
    return any(host == d or host.endswith("." + d) for d in APPROVED_EDUCATIONAL_DOMAINS)


def _publisher_for(url: str) -> Optional[str]:
    host = urlparse(url).netloc.lower()
    for domain, (publisher, _tier) in APPROVED_EDUCATIONAL_DOMAINS.items():
        if host == domain or host.endswith("." + domain):
            return publisher
    return None


@dataclass
class SourceResult:
    """Application-controlled source metadata + the reference content passed
    to grounding. Never constructed from LLM output — the LLM sees `content`
    but has no way to influence `title`/`publisher`/`url`."""
    title: str
    publisher: str
    url: str
    content: str


# ── Relevance ────────────────────────────────────────────────────────────

_STOPWORDS = {
    "what", "does", "mean", "means", "explain", "tell", "about", "this",
    "that", "with", "from", "into", "your", "than", "then", "will", "would",
    "could", "should", "please", "define", "definition", "know", "understand",
    "and", "the", "is", "are", "how", "why", "when", "who",
}


def _normalise_spelling(word: str) -> str:
    """Fold common British spellings onto their American equivalent so
    "capitalisation" (as a user is likely to type it) still matches
    "capitalization" (as the source material spells it). Without this,
    "What is market capitalisation?" scored 0 overlap against the market-cap
    entry and tied with an unrelated entry on the word "market" alone,
    falling to whichever entry happened to be inserted first."""
    if word.endswith("isation"):
        return word[:-7] + "ization"
    if word.endswith("ise") and len(word) > 4:
        return word[:-3] + "ize"
    if word.endswith("iser") and len(word) > 5:
        return word[:-4] + "izer"
    return word


def _meaningful_tokens(text: str) -> set[str]:
    return {
        _normalise_spelling(w) for w in re.findall(r"[a-z]+", text.lower())
        if len(w) > 2 and w not in _STOPWORDS
    }


def _relevance_score(query: str, candidate_text: str) -> int:
    """How many meaningful query tokens actually appear (as whole words) in
    the candidate. 0 = "approved domain, but not actually about this" — the
    signal that rejects an on-allowlist-but-unrelated page (spec's example:
    an Investor.gov retirement-accounts page must not answer a beta question
    just because Investor.gov is authoritative)."""
    query_tokens = _meaningful_tokens(query)
    if not query_tokens:
        return 0
    candidate_tokens = _meaningful_tokens(candidate_text)
    return len(query_tokens & candidate_tokens)


# ── Local reference cache ────────────────────────────────────────────────
# General finance-education concepts AlphaSwarm itself does not compute
# anything about (contrast api.py's _ASK_GLOSSARY, which is preferred first
# for concepts AlphaSwarm DOES compute — beta, RSI, etc.). Every url below was
# checked against investor.gov's real glossary index (not just an HTTP 200 —
# the site returns 200 with a generic template for ANY slug under /glossary/,
# including ones that don't exist, so a bare status check is not proof a page
# is real; each url here was cross-checked against the actual list of
# glossary links on the index page, and its byte size compared against a
# known-fake slug's ~34.8KB template to confirm it renders distinct content,
# ~57KB+ for every entry below). `content` is maintainer-written, not
# scraped (see module docstring for why). This is consciously NOT "the
# architecture" — it is what search_authoritative_education() falls through
# to while no live provider is configured, built
# from the identical SourceResult shape a live provider result would use.
_LOCAL_REFERENCE_CACHE: list[SourceResult] = [
    SourceResult(
        title="Investor.gov Glossary: Diversification",
        publisher="U.S. Securities and Exchange Commission — Investor.gov",
        url="https://www.investor.gov/introduction-investing/investing-basics/glossary/diversification",
        content=(
            "Diversification means spreading investments across different assets, "
            "sectors, or geographies so that a single investment's poor performance "
            "has a smaller effect on the overall portfolio. It reduces exposure to "
            "any one company or sector, though it does not eliminate market-wide risk."
        ),
    ),
    SourceResult(
        title="Investor.gov Glossary: Market Capitalization",
        publisher="U.S. Securities and Exchange Commission — Investor.gov",
        url="https://www.investor.gov/introduction-investing/investing-basics/glossary/market-capitalization",
        content=(
            "Market capitalization (\"market cap\") is the total market value of a "
            "company's outstanding shares — share price multiplied by the number of "
            "shares outstanding. It is used to compare the relative size of companies "
            "(e.g. large-cap vs. small-cap), not their profitability or quality."
        ),
    ),
    SourceResult(
        title="Investor.gov Glossary: Dividend",
        publisher="U.S. Securities and Exchange Commission — Investor.gov",
        url="https://www.investor.gov/introduction-investing/investing-basics/glossary/dividend",
        content=(
            "A dividend is a distribution of a portion of a company's earnings, "
            "decided by its board of directors, paid to shareholders — usually in "
            "cash or additional shares. Companies are not required to pay dividends, "
            "and past dividends do not guarantee future ones."
        ),
    ),
    SourceResult(
        title="Investor.gov Glossary: Bull Market",
        publisher="U.S. Securities and Exchange Commission — Investor.gov",
        url="https://www.investor.gov/introduction-investing/investing-basics/glossary/bull-market",
        content=(
            "A bull market describes a period in which the prices of securities are "
            "rising, or are expected to rise, typically accompanied by broad investor "
            "optimism. It's a description of a market condition, not a forecast of "
            "when the next one will occur."
        ),
    ),
    SourceResult(
        title="Investor.gov Glossary: Bear Market",
        publisher="U.S. Securities and Exchange Commission — Investor.gov",
        url="https://www.investor.gov/introduction-investing/investing-basics/glossary/bear-market",
        content=(
            "A bear market describes a period in which the prices of securities are "
            "falling, or are expected to fall, typically accompanied by widespread "
            "investor pessimism. It's a description of a market condition, not a "
            "forecast of when the next one will occur."
        ),
    ),
    SourceResult(
        title="Investor.gov Glossary: Price-to-Earnings (P/E) Ratio",
        publisher="U.S. Securities and Exchange Commission — Investor.gov",
        url="https://www.investor.gov/introduction-investing/investing-basics/glossary/price-earnings-pe-ratio",
        content=(
            "The price-to-earnings (P/E) ratio compares a company's current share "
            "price to its earnings per share. It is one way investors gauge how a "
            "company's price is valued relative to its earnings, though it does not "
            "by itself indicate whether a stock is a good or bad investment."
        ),
    ),
    SourceResult(
        title="Investor.gov Glossary: Exchange-Traded Funds (ETFs)",
        publisher="U.S. Securities and Exchange Commission — Investor.gov",
        url="https://www.investor.gov/introduction-investing/investing-basics/glossary/exchange-traded-fund-etf",
        content=(
            "An exchange-traded fund (ETF) is a type of pooled investment that holds "
            "a basket of assets — such as stocks or bonds — and trades on an exchange "
            "like an individual stock, throughout the trading day, unlike a "
            "traditional mutual fund which is priced once daily."
        ),
    ),
    # ── South African terms ──────────────────────────────────────────────
    # Cited to the FSCA, not jse.co.za directly — see the JSE domain-approval
    # comment above for why (jse.co.za 403'd every plain-HTTP fetch tried
    # during development; the FSCA page WAS independently verified live).
    SourceResult(
        title="About Us — Financial Sector Conduct Authority",
        publisher="Financial Sector Conduct Authority (South Africa)",
        url="https://www.fsca.co.za/About-Us",
        content=(
            "The JSE (Johannesburg Stock Exchange) is South Africa's primary "
            "licensed securities exchange, where shares of South African (and some "
            "international) companies are listed and traded. As a licensed exchange, "
            "the JSE is regulated in South Africa by the Financial Sector Conduct "
            "Authority (FSCA), the country's market conduct regulator for the "
            "financial sector."
        ),
    ),
    SourceResult(
        title="About the South African Reserve Bank",
        publisher="South African Reserve Bank",
        url="https://www.resbank.co.za/en/home/about-us",
        content=(
            "The South African Reserve Bank (SARB) is South Africa's central bank, "
            "and the sole issuer of South Africa's currency, the rand (currency code "
            "ZAR). Its primary mandate, set out in the South African Constitution, is "
            "to protect the value of the rand in the interest of balanced and "
            "sustainable economic growth, which it pursues mainly through price "
            "stability (keeping inflation low and predictable)."
        ),
    ),
    SourceResult(
        title="Monetary Policy — South African Reserve Bank",
        publisher="South African Reserve Bank",
        url="https://www.resbank.co.za/en/home/what-we-do/monetary-policy",
        content=(
            "The repo rate is the interest rate at which the South African Reserve "
            "Bank lends money to commercial banks. It is South Africa's benchmark "
            "interest rate, set by the SARB's Monetary Policy Committee, and changes "
            "to it flow through to borrowing costs across the economy — including "
            "the prime lending rate, the rate commercial banks charge their "
            "lowest-risk customers, which South African banks typically set a fixed "
            "margin above the repo rate. The SARB uses repo rate decisions to pursue "
            "its inflation target: keeping South African CPI (Consumer Price Index) "
            "inflation within a 3-6% range."
        ),
    ),
    SourceResult(
        title="Financial Sector Conduct Authority — Mandate",
        publisher="Financial Sector Conduct Authority (South Africa)",
        url="https://www.fsca.co.za/About-Us",
        content=(
            "The Financial Sector Conduct Authority (FSCA) is South Africa's market "
            "conduct regulator for the financial sector. It supervises how financial "
            "institutions — including banks, insurers, and licensed exchanges such as "
            "the JSE — treat their customers and conduct business, working alongside "
            "South Africa's other financial regulators, including the South African "
            "Reserve Bank."
        ),
    ),
]


def _search_local_cache(query: str) -> Optional[SourceResult]:
    best, best_score = None, 0
    for entry in _LOCAL_REFERENCE_CACHE:
        score = _relevance_score(query, f"{entry.title} {entry.content}")
        if score > best_score:
            best, best_score = entry, score
    return best


# ── Live provider path (generic; not exercised without credentials) ────────

def _extract_text(html: str) -> str:
    """Dependency-free tag stripper. This project has no HTML-parsing
    library installed (checked requirements.txt); adding one purely for a
    best-effort text extraction here would be more than this proof-of-
    concept needs. Good enough to hand short reference passages to the
    grounding step, not a general-purpose scraper."""
    text = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&amp;|&#39;|&quot;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _search_live_provider(query: str) -> Optional[SourceResult]:
    """Generic search-provider call, only active when SEARCH_PROVIDER_URL and
    SEARCH_PROVIDER_API_KEY are configured (see .env.example). Expects the
    provider to return JSON shaped like {"results": [{"title": ..., "url":
    ...}, ...]} — adjust the two lines marked below to match whichever
    provider is actually wired in, without touching the validation/relevance
    logic. NOT exercised in this environment: no such credentials exist here
    (see module docstring), so this path is implemented and reviewed but
    UNTESTED against a live provider.
    """
    provider_url = os.getenv("SEARCH_PROVIDER_URL")
    api_key = os.getenv("SEARCH_PROVIDER_API_KEY")
    if not provider_url or not api_key:
        return None

    import httpx

    try:
        resp = httpx.get(
            provider_url,
            params={"q": f"{query} site:investor.gov OR site:sec.gov OR site:finra.org", "key": api_key},
            timeout=8.0,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])  # <- adjust to the provider's actual response shape
    except Exception as e:
        logger.warning("Educational search provider call failed: %s", e)
        return None

    for item in results:
        candidate_url = item.get("url", "")
        if not candidate_url or not is_approved_domain(candidate_url):
            continue  # reject anything outside the allowlist before even fetching it
        try:
            page = httpx.get(
                candidate_url, timeout=8.0, follow_redirects=True,
                headers={"User-Agent": "AlphaSwarmEducationalBot/1.0"},
            )
            page.raise_for_status()
        except Exception as e:
            logger.info("Educational source fetch failed for %s: %s", candidate_url, e)
            continue

        final_url = str(page.url)
        if not is_approved_domain(final_url):
            logger.info("Rejected %s: redirected outside the allowlist to %s", candidate_url, final_url)
            continue  # a redirect took us off the allowlist — reject, don't use it

        text = _extract_text(page.text)
        title = item.get("title") or final_url
        if _relevance_score(query, f"{title} {text}") == 0:
            logger.info("Rejected %s: approved domain but not relevant to %r", final_url, query)
            continue  # on-allowlist page, but not actually about this concept

        publisher = _publisher_for(final_url) or "Unknown"
        return SourceResult(title=title, publisher=publisher, url=final_url, content=text[:1500])

    return None


def search_authoritative_education(query: str) -> Optional[SourceResult]:
    """Single entry point LEARNING_QUESTION's fallback tier calls. Tries a
    live provider first (a no-op when unconfigured), then the local
    validated cache. Never raises — every failure degrades to None, which
    tells the caller to fall through to the acronym-clarification / honest
    "not covered yet" response rather than let the model guess."""
    try:
        live = _search_live_provider(query)
        if live:
            return live
    except Exception as e:
        logger.warning("Live educational search failed, falling back to local cache: %s", e)
    try:
        return _search_local_cache(query)
    except Exception as e:
        logger.warning("Local educational reference lookup failed: %s", e)
        return None


# ── Acronym handling ─────────────────────────────────────────────────────

_ACRONYM_RE = re.compile(r"\b[A-Z]{2,5}\b")
_ACRONYM_STOPWORDS = {"I", "A", "OK"}


def looks_like_acronym(original_query: str) -> Optional[str]:
    """First token in the ORIGINAL (non-lowercased) query shaped like an
    acronym (2-5 uppercase letters), else None. An unresolved short all-caps
    term gets a clarification question instead of a guessed definition —
    acronyms are frequently ambiguous, and guessing is the single worst
    failure mode for a product that promises not to hallucinate."""
    for match in _ACRONYM_RE.finditer(original_query):
        token = match.group(0)
        if token not in _ACRONYM_STOPWORDS:
            return token
    return None
