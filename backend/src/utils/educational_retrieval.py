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
    setting SERPAPI_API_KEY (see .env.example) turns on genuine live
    retrieval — but only as a FALLBACK for terms the local cache below has
    nothing on (see search_authoritative_education's own docstring for why
    it's cache-first, not live-first: a free-tier search quota gets spent
    fast if it fires on every query, including ones the cache already
    answers correctly for free). When it does fire, it's query-time
    restricted to APPROVED_EDUCATIONAL_DOMAINS via a `site:` clause, and
    every result re-checked against that same allowlist after the fact (the
    check that actually enforces it — see _search_live_provider's own
    docstring for why a query-time `site:` clause alone isn't trusted), plus
    a relevance check before use. Without that variable set, or for any
    query the cache already answers, this deterministically uses the small
    local reference cache (see _LOCAL_REFERENCE_CACHE) instead — built from
    real, live-checked URLs on approved domains, each fetched and confirmed
    live at the time it was added, so the calling code and the
    grounding/validation pipeline need no change whether a query resolves
    from the cache or a live call. This was a deliberate, disclosed
    trade-off, not a hidden shortcut. (Tavily was evaluated first and would
    have been a stronger fit — its include_domains parameter enforces the
    allowlist at the engine itself,
    and it returns full extracted page content rather than a short snippet
    — but its signup requires payment-card details even on the nominally
    free tier, so SerpApi was used instead; revisit Tavily if that project
    constraint changes.)
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
    # UK regulator, added as a moneyhelper.org.uk substitute — moneyhelper.org.uk
    # 403's every plain-HTTP fetch tried (same bot-protection pattern as
    # investor.gov/jse.co.za above), but fca.org.uk/consumers was independently
    # verified live and reachable (real content: scams, pension transfers,
    # compensation claims, not a blank shell) — the UK's actual financial
    # conduct regulator, the same tier as the SEC/FSCA/FINRA entries above.
    "fca.org.uk": ("Financial Conduct Authority (United Kingdom)", 1),
    # OCC (Options Clearing Corporation) — the central clearinghouse for all
    # US-listed options, regulated by the SEC and CFTC. Its glossary index
    # page is real and reachable, though its letter-filter navigation is
    # client-side JS (a query-string letter param didn't change what
    # rendered), so only the "A" section's terms were actually confirmed
    # live; the two cache entries below are drawn from exactly those
    # confirmed terms, not guessed at from elsewhere on the site.
    "optionseducation.org": ("OCC (Options Clearing Corporation)", 1),
    # SA Revenue Service — the national tax authority. Its capital-gains-tax
    # page (cited in the cache entry below) was independently verified live;
    # its own homepage's navigation is JS-heavy so a specific page URL was
    # needed rather than guessing a path from its nav menu (several guessed
    # SARS/other-site paths in this same batch 404'd before this one was
    # found to work).
    "sars.gov.za": ("South African Revenue Service (SARS)", 1),
    # Cboe Global Markets — operator of the world's largest US options
    # exchange, since 1973. Its options glossary (at /optionsinstitute/glossary
    # — NOT /education/options-definitions-glossary/, which 404'd on an
    # earlier attempt in this same session) is genuinely static, plain-text
    # content: Call, Put, Strike Price, In/Out-of-the-money, and Expiration
    # Date were all independently confirmed live and quoted directly below.
    "cboe.com": ("Cboe Global Markets — Options Institute", 1),
    # CME Group's public-facing futures-education site, run on separate
    # infrastructure from cmegroup.com/education (which returned a connection
    # reset on direct fetch) — confirmed independently reachable with real
    # content, including a direct quotable definition of a futures contract
    # (cited below).
    "futuresfundamentals.org": ("CME Group — Futures Fundamentals", 1),
    # OpenStax (Rice University) — nonprofit publisher of free, peer-reviewed,
    # openly-licensed textbooks. Tier 2 (like CFA Institute), not tier 1 —
    # it's an academic publisher, not a regulator or exchange. Its book pages
    # ARE genuinely static and fetchable (openstax.org/books/{slug}/pages/
    # {section-slug} — confirmed live), but the slug/section structure isn't
    # discoverable by guessing: several plausible paths (principles-finance's
    # own chapter pages, principles-economics-3e's later macro chapters) 404'd
    # before "principles-economics-3e"'s early sections were found to work.
    # Only cite pages actually walked to and confirmed, the same rule as
    # every other source in this cache — do not extrapolate that the rest of
    # OpenStax's catalog (including its dedicated Principles of Finance book,
    # whose landing page loads but whose own section URLs were not found
    # this pass) works the same way without checking each one.
    "openstax.org": ("OpenStax (Rice University)", 2),
}

# ── GOVERNMENT_FINANCIAL_EDUCATION ──────────────────────────────────────
# A dedicated, deliberately SMALL category (not a general "government
# domains are trusted" rule) covering public-sector financial-EDUCATION
# publishers across several jurisdictions, each mapped to the jurisdiction
# its guidance actually applies to. This is a static, deterministic
# reference/labeling mechanism — no new LLM call is used to decide which
# source applies (that would add a Groq call the ask pipeline's budget does
# not allow; see api.py's Groq call-count notes).
#
# CRITICAL RULE, enforced by callers (api.py), not by this dict: an approved
# educational source authorises general/factual educational retrieval ONLY.
# It never authorises personalised financial advice, and it never overrides
# AlphaSwarm's advice boundary — "According to Investor.gov, should I put my
# R50,000 into an S&P 500 ETF?" must still be refused/bounded as personalised
# advice regardless of the source named. Jurisdiction must also be preserved:
# a US-specific IRA/tax answer must never be silently presented as South
# African guidance, and vice versa.
GOVERNMENT_FINANCIAL_EDUCATION: dict[str, tuple[str, str]] = {
    # domain -> (publisher, jurisdiction)
    "fscamymoney.co.za": ("Financial Sector Conduct Authority — MyMoney (South Africa)", "South Africa"),
    "fsca.co.za": ("Financial Sector Conduct Authority (South Africa)", "South Africa"),
    "investor.gov": ("U.S. Securities and Exchange Commission — Investor.gov", "United States"),
    "consumerfinance.gov": ("Consumer Financial Protection Bureau (United States)", "United States"),
    "moneyhelper.org.uk": ("MoneyHelper — Money and Pensions Service (United Kingdom)", "United Kingdom"),
    "fca.org.uk": ("Financial Conduct Authority (United Kingdom)", "United Kingdom"),
    "moneysmart.gov.au": ("Moneysmart — Australian Securities and Investments Commission (Australia)", "Australia"),
    "sars.gov.za": ("South African Revenue Service (SARS)", "South Africa"),
}

# Fold the government-financial-education domains into the general approved
# allowlist too, so a live-retrieval result on one of them (once a search
# provider is configured — see module docstring) is accepted the same way
# any other approved domain is. Tier 1 (regulatory/government), matching the
# existing tiering convention above.
for _domain, (_publisher, _jurisdiction) in GOVERNMENT_FINANCIAL_EDUCATION.items():
    APPROVED_EDUCATIONAL_DOMAINS.setdefault(_domain, (_publisher, 1))


def government_education_jurisdiction(url_or_domain: str) -> Optional[str]:
    """The jurisdiction a GOVERNMENT_FINANCIAL_EDUCATION source's guidance
    applies to (e.g. "United States", "South Africa"), or None if the domain
    isn't in that category. Used so a general-education answer sourced from
    one jurisdiction's regulator is never silently presented as another
    jurisdiction's guidance (e.g. a US IRA rule shown as if it were South
    African)."""
    host = urlparse(url_or_domain).netloc.lower() or url_or_domain.lower()
    for domain, (_publisher, jurisdiction) in GOVERNMENT_FINANCIAL_EDUCATION.items():
        if host == domain or host.endswith("." + domain):
            return jurisdiction
    return None


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
    # 2-letter filler words, added alongside lowering _meaningful_tokens'
    # length cutoff from >2 to >=2 (see that function's docstring for why
    # the cutoff had to drop) — these stay excluded because they carry no
    # topic-distinguishing meaning, unlike "in"/"at"/"on", which the cutoff
    # change was specifically made to let through. The first attempt at this
    # list missed "do" — "What does SARB do?" started spuriously matching
    # the Dividend entry, because "do" is common ordinary filler text
    # ("dividends do not guarantee...") that has nothing to do with the
    # query's actual subject, while the real SARB entry's title doesn't
    # literally contain the word "SARB" so gets no compensating title bonus.
    # Caught by re-running the full existing test suite, not just the new
    # entries' own spot-checks — this list is now every common short English
    # function word that could otherwise leak through as a false "topic"
    # match, not just the ones the CBOE/OCC addition happened to trip over.
    "to", "of", "or", "if", "be", "as", "an", "so", "no", "up", "my", "me",
    "do", "did", "he", "it", "we", "us", "go", "am", "his", "her", "its",
    "him", "our", "you", "yes",
    # Brought in from api.py's PARALLEL Learning Centre stopword list after
    # the identical false-positive pattern showed up here too: "What does
    # all this mean?" (a vague CONTEXT_SYNTHESIS-shaped question with no
    # real topic) matched "Investor.gov: Introduction to Investing" purely
    # because "all" — a generic quantifier, not a topic word — happens to
    # appear somewhere in that entry's long content. Two independently
    # maintained stopword lists (this one and _ASK_LEARNING_STOPWORDS in
    # api.py) drifting out of sync is exactly how a fix applied to one and
    # not the other keeps recurring; kept as two lists (different modules,
    # different call sites) but the actual WORDS are meant to stay identical.
    "all", "any", "not", "one", "can", "has", "had", "but", "was", "were",
    "use", "let",
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
    """Length cutoff is >=2, not >2 (the original cutoff): with >2, "in" and
    "at" were both dropped, so "In-the-Money" and "At-the-Money" — two
    genuinely different, real options terms this cache added in the same
    batch — reduced to the SAME single token ("money"), making them
    indistinguishable to _cache_entry_score's title-match check and causing
    one to silently shadow the other. _STOPWORDS absorbs the extra 2-letter
    noise words ("to", "of", ...) this widening would otherwise let through,
    while deliberately leaving "in"/"at"/"on" as real, meaning-carrying
    tokens.

    Also adds a naive singular fallback for a plain "-s" plural (bonds ->
    bond, stocks -> stock) — WITHOUT this, "What are bonds?" scored 0
    against the real "CFPB Financial Terms Glossary: Bond" entry (its title
    and hand-written content both use the singular "bond") while scoring 1
    against the UNRELATED ETF entry, whose content happens to mention
    "stocks or bonds" in passing as an example of what an ETF can hold —
    the plural-only query token matched an incidental aside in the wrong
    entry instead of the dedicated entry's singular title, because nothing
    connected "bonds" to "bond" as the same concept. Deliberately narrow: a
    bare trailing "s" (not "es"/"ies", not on a word already ending "ss")
    on a word long enough that losing one letter can't turn it into noise —
    the word is NORMALISED to its singular form (not kept alongside the
    plural) — keeping both forms in the query's own token set was tried
    first and made things worse: "bonds" then contributed BOTH "bonds" and
    "bond" to query_tokens, and the full-title-match bonus requires ALL
    query tokens to appear in the title — but a title only ever gets the
    singular ("Bond"), never the literal plural, so the doubled query set
    could never be a full subset and the bonus silently never applied.
    Reducing to one canonical (singular) form for both query and candidate
    text keeps the subset check meaningful either way."""
    tokens = set()
    for w in re.findall(r"[a-z]+", text.lower()):
        if len(w) < 2 or w in _STOPWORDS:
            continue
        w = _normalise_spelling(w)
        if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
            w = w[:-1]
        tokens.add(w)
    return tokens


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


def _cache_entry_score(query: str, entry: SourceResult) -> int:
    """As the local cache has grown to cover more overlapping topics (e.g.
    both a CFPB "Inflation" glossary entry AND an SARB monetary-policy entry
    that merely mentions inflation in passing while explaining the repo
    rate), plain body-text overlap alone started mis-ranking: "what is
    inflation" scored higher against SARB's longer passage than against
    CFPB's short, directly-on-topic definition, simply because the longer
    passage happened to repeat more of the query's other words too.

    Fix: a bonus applies only when the entry's title covers EVERY meaningful
    query token, not just one shared word — the title is that entry's actual
    subject, so covering the whole query means the entry is very likely
    "about" exactly what was asked, not just adjacent to it. A PARTIAL title
    match earns no bonus, specifically so a generic entry sharing one word
    with a more specific query (e.g. "interest rate"'s title token "rate"
    partially matching "what is the repo rate") can't outrank an entry whose
    BODY actually discusses the specific thing asked about (SARB's repo-rate
    explanation) — that must still be decided by body-text overlap alone."""
    query_tokens = _meaningful_tokens(query)
    title_tokens = _meaningful_tokens(entry.title)
    full_title_match = bool(query_tokens) and query_tokens.issubset(title_tokens)
    return (
        (10 if full_title_match else 0)
        + _relevance_score(query, entry.content)
    )


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
    # Broad "where do I start" overview — verified live (2026-08-31, via
    # fetch, unlike most /glossary/ slugs which render via client-side JS
    # and return a blank template to a plain fetch, see module docstring).
    # Deliberately the ONLY beginner-overview source added in this pass:
    # several other glossary slugs (e.g. /glossary/stocks) were checked and
    # found to be blank templates, so no content was fabricated for them —
    # they simply aren't cited here. Content below mirrors what the live
    # page actually said (investing definition, saving-vs-investing,
    # risk/return, diversification, asset allocation), not invented.
    SourceResult(
        title="Investor.gov: Introduction to Investing",
        publisher="U.S. Securities and Exchange Commission — Investor.gov",
        url="https://www.investor.gov/introduction-investing",
        content=(
            "Investing means putting your money into assets such as stocks or "
            "bonds, with the expectation of a return over time through value "
            "appreciation or dividend payments. Investing is different from "
            "saving: a savings account suits short-term goals and preserves "
            "the money you put in, while investing targets longer-term wealth "
            "building and carries the risk that value can go down as well as up "
            "— all investments carry some degree of risk because markets "
            "fluctuate, so understanding personal risk tolerance and time "
            "horizon matters before investing. Diversification — spreading "
            "money across different assets and sectors rather than one company "
            "— and asset allocation — dividing money among stocks, bonds, and "
            "cash according to risk tolerance — are two of the basic tools "
            "investors use to manage that risk. Investing regularly over long "
            "periods lets returns compound over time."
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
    # ── CFPB glossary (consumerfinance.gov) ──────────────────────────────
    # Verified live 2026-09-08 (fetched, content confirmed present and not a
    # blank/JS-only template — unlike investor.gov's /glossary/ slugs and
    # moneysmart.gov.au / moneyhelper.org.uk, which returned HTTP 403 to a
    # plain fetch when the same check was attempted for this batch). Content
    # below quotes the CFPB Financial Terms Glossary directly, not invented.
    SourceResult(
        title="CFPB Financial Terms Glossary: Credit Score",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A credit score is a number created from a scoring model that uses "
            "information from your credit history to predict how likely you are to "
            "repay borrowed money. Lenders use it, along with other factors, to help "
            "decide whether to extend credit and on what terms."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Compound Interest",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "Compound interest is interest calculated on both the money you originally "
            "saved or invested and the interest that money has already earned — so "
            "your balance can grow faster over time than with simple interest, which "
            "is only calculated on the original amount."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Debt",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "Debt is money you owe another person or a business, typically because "
            "you borrowed it and agreed to pay it back, often with interest, "
            "according to agreed terms."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Interest Rate",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "An interest rate is a percentage of a sum borrowed that a lender or "
            "merchant charges for letting you use its money, or that a saver earns "
            "for letting a bank use theirs."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Mutual Fund",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A mutual fund is a company that pools money from many investors and "
            "invests it in securities such as stocks, bonds, and short-term debt. "
            "Investors buy shares of the fund itself, giving them a stake in its "
            "whole pooled portfolio rather than any single underlying holding."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Bond",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A bond is a type of debt. When you buy a bond, you are lending money to "
            "the issuer — which may be a government, municipality, or corporation — "
            "which agrees to pay it back, usually with interest, by a set date."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Inflation",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "Inflation occurs when the prices of goods and services increase over "
            "time, which reduces how much a given amount of money can buy."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Investment Fees",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "Investment fees are what you pay to use investment products and "
            "services — for example, charges a fund or broker deducts for managing "
            "or facilitating your investment. Fees reduce net returns over time, so "
            "understanding them is part of evaluating any investment product."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Credit Report",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A credit report is a summary of your credit activity and current credit "
            "situation, such as loan payment history and the status of your credit "
            "accounts. Lenders use credit reports to help decide on lending and "
            "interest rates; other businesses may use them for insurance, rental, "
            "utility, or employment-related decisions."
        ),
    ),
    # Second verification pass, same day (2026-09-08), same page and same
    # method: fetched live, content confirmed present and quoted directly,
    # not invented. Coverage driven by a broader "500 investing concepts"
    # priority list — these are the Tier-1/beginner terms from that list that
    # (a) aren't already computed by AlphaSwarm itself (contrast api.py's
    # _ASK_GLOSSARY, which already covers "asset" as a computed concept —
    # this entry is kept anyway as a harmless safety net, since _ASK_GLOSSARY
    # is checked first and wins whenever it applies) and (b) had a real,
    # confirmed definition on an already-approved domain. The remaining
    # Tier-1 terms from that list (return on investment, net worth, yield)
    # were checked against this same page and are NOT present here — not
    # added, rather than guessed.
    SourceResult(
        title="CFPB Financial Terms Glossary: Asset",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "An asset is an item with economic value, such as a stock, bond, or real "
            "estate, that a person or company owns."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Risk",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "In a financial context, risk is exposure to the possibility of loss — "
            "for example, the chance that an investment's value falls, or that a "
            "borrower is unable to repay what they owe."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Liquidity",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "Liquidity is a measure of the ability and ease with which you can access "
            "and use your money — cash is the most liquid asset, while something "
            "like real estate is far less liquid because it takes time to convert "
            "into cash."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Portfolio",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A portfolio is the combined collection of investments — such as stocks, "
            "bonds, or fund holdings — that a person or fund holds, considered "
            "together as a whole rather than as individual positions."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Capital Gain",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A capital gain is the profit that comes from selling an investment for "
            "more than you paid for it. Selling for less than you paid is a capital "
            "loss."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Stock",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A stock is a type of investment that gives people a share of ownership "
            "in a company. Owning stock generally entitles the holder to a "
            "proportional claim on the company's assets and earnings."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Budget",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A budget is a plan that outlines what money you expect to earn or "
            "receive (your income) and how you will save it or spend it (your "
            "expenses) for a given period of time."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Savings Account",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A savings account is an account at a bank (sometimes called a share "
            "savings account at a credit union) used to set aside money, that "
            "typically pays you interest on the balance."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Emergency Fund",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "An emergency fund is a cash reserve that's specifically set aside for "
            "unplanned expenses or financial emergencies, kept separate from money "
            "earmarked for everyday spending or investing."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Principal",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "Principal is the amount of money originally borrowed from a lender (or "
            "originally invested), which is then paid back or grows separately from "
            "any interest charged or earned on top of it."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: Loan",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "A loan is money that needs to be repaid by the borrower, generally with "
            "interest, according to terms agreed with the lender."
        ),
    ),
    SourceResult(
        title="CFPB Financial Terms Glossary: APR (Annual Percentage Rate)",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content=(
            "APR (Annual Percentage Rate) is the cost of borrowing money on a yearly "
            "basis, expressed as a percentage rate — it is meant to make it easier "
            "to compare the cost of different loans or credit offers."
        ),
    ),
    # Verified live 2026-09-08, same page and method as the CFPB block above.
    # "Return" is the page's own term, not a perfect match for "return on
    # investment" — kept as its own short entry rather than stretched to
    # claim it defines ROI specifically, since it doesn't mention a
    # percentage or a relationship to the amount invested.
    SourceResult(
        title="CFPB Financial Terms Glossary: Return",
        publisher="Consumer Financial Protection Bureau (United States)",
        url="https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/glossary/",
        content="A return is the profit or loss on an investment.",
    ),
    # ── FINRA, OCC, SARS — verified live 2026-09-08 ─────────────────────
    SourceResult(
        title="FINRA Investor Insights: Margin Calls",
        publisher="Financial Industry Regulatory Authority (FINRA)",
        url="https://www.finra.org/investors/insights/margin-calls",
        content=(
            "A margin account lets an investor borrow cash from their brokerage "
            "firm to buy securities, using the account's assets as collateral. A "
            "margin call happens when the account's value falls (or a new trade "
            "creates a shortfall) so that equity drops below the firm's minimum "
            "requirement — the investor then has to deposit more money or "
            "securities, or the firm may sell assets in the account to cover the "
            "shortfall."
        ),
    ),
    SourceResult(
        title="OCC Options Glossary: At-the-Money",
        publisher="OCC (Options Clearing Corporation)",
        url="https://www.optionseducation.org/referencelibrary/optionsglossary",
        content=(
            "At-the-money describes an option whose strike price is equal to the "
            "current market price of the underlying stock."
        ),
    ),
    SourceResult(
        title="OCC Options Glossary: American-Style Option",
        publisher="OCC (Options Clearing Corporation)",
        url="https://www.optionseducation.org/referencelibrary/optionsglossary",
        content=(
            "An American-style option is an option that can be exercised at any "
            "time prior to its expiration date — unlike a European-style option, "
            "which can only be exercised at expiration itself."
        ),
    ),
    SourceResult(
        title="SARS: Capital Gains Tax",
        publisher="South African Revenue Service (SARS)",
        url="https://www.sars.gov.za/types-of-tax/capital-gains-tax/",
        content=(
            "In South Africa, capital gains tax (CGT) applies when you dispose of "
            "an asset (such as shares) for more than it cost you. Capital gains "
            "are taxed at a lower effective rate than ordinary income — only a "
            "portion of the gain is included in taxable income, rather than the "
            "full gain. Gains and losses from before 1 October 2001 (when CGT was "
            "introduced) are not taken into account."
        ),
    ),
    # ── Cboe Options Institute glossary — verified live 2026-09-08 ─────────
    SourceResult(
        title="Cboe Options Institute Glossary: Call",
        publisher="Cboe Global Markets — Options Institute",
        url="https://www.cboe.com/optionsinstitute/glossary",
        content=(
            "A call is an option contract which gives the holder the right, but "
            "not the obligation, to buy the underlying asset at a certain price "
            "(the strike price) within a certain timeframe."
        ),
    ),
    SourceResult(
        title="Cboe Options Institute Glossary: Put",
        publisher="Cboe Global Markets — Options Institute",
        url="https://www.cboe.com/optionsinstitute/glossary",
        content=(
            "A put is an option contract granting the holder the right, but not "
            "the obligation, to sell the underlying asset at a certain price (the "
            "strike price) for a specified period of time."
        ),
    ),
    SourceResult(
        title="Cboe Options Institute Glossary: Strike Price",
        publisher="Cboe Global Markets — Options Institute",
        url="https://www.cboe.com/optionsinstitute/glossary",
        content=(
            "The strike price is the price at which an option holder may buy or "
            "sell the underlying security, as defined in the terms of the option "
            "contract."
        ),
    ),
    SourceResult(
        title="Cboe Options Institute Glossary: In-the-Money / Out-of-the-Money",
        publisher="Cboe Global Markets — Options Institute",
        url="https://www.cboe.com/optionsinstitute/glossary",
        content=(
            "A call option is 'in-the-money' if the underlying asset's price is "
            "higher than the option's strike price, and 'out-of-the-money' if the "
            "underlying asset's price is below the strike price."
        ),
    ),
    SourceResult(
        title="Cboe Options Institute Glossary: Expiration Date",
        publisher="Cboe Global Markets — Options Institute",
        url="https://www.cboe.com/optionsinstitute/glossary",
        content="The expiration date is the day when an option contract terminates.",
    ),
    # ── CME Group Futures Fundamentals — verified live 2026-09-08 ───────────
    SourceResult(
        title="Futures Fundamentals: What Is a Futures Contract?",
        publisher="CME Group — Futures Fundamentals",
        url="https://www.futuresfundamentals.org/get-the-basics/introduction-to-derivatives/",
        content=(
            "A futures contract is a contractual agreement to buy or sell an "
            "amount of something — a commodity, a financial instrument, a "
            "currency — at a fixed price, for delivery or settlement at a fixed "
            "date in the future."
        ),
    ),
    # ── OpenStax "Principles of Economics 3e" — verified live 2026-09-08 ────
    SourceResult(
        title="OpenStax Principles of Economics 3e: Microeconomics",
        publisher="OpenStax (Rice University)",
        url="https://openstax.org/books/principles-economics-3e/pages/1-2-microeconomics-and-macroeconomics",
        content=(
            "Microeconomics focuses on the actions of individual agents within "
            "the economy, like households, workers, and businesses."
        ),
    ),
    SourceResult(
        title="OpenStax Principles of Economics 3e: Macroeconomics",
        publisher="OpenStax (Rice University)",
        url="https://openstax.org/books/principles-economics-3e/pages/1-2-microeconomics-and-macroeconomics",
        content=(
            "Macroeconomics looks at the economy as a whole. It focuses on broad "
            "issues such as growth of production, the number of unemployed "
            "people, the inflationary increase in prices, government deficits, "
            "and levels of exports and imports."
        ),
    ),
]


def _search_local_cache(query: str) -> Optional[SourceResult]:
    best, best_score = None, 0
    for entry in _LOCAL_REFERENCE_CACHE:
        score = _cache_entry_score(query, entry)
        if score > best_score:
            best, best_score = entry, score
    return best


# ── Live provider path (SerpApi; not exercised without a real API key) ─────
# SerpApi (serpapi.com) specifically — chosen over Tavily after Tavily's
# signup turned out to require card details even on its free tier; SerpApi's
# free plan (100 searches/month at time of writing) has historically been
# email-signup only. Trade-off versus the Tavily version this replaced:
# SerpApi has no `include_domains`-equivalent parameter, so domain
# restriction goes back to a `site:` clause in the query text (which a
# provider could in principle ignore) backed by the SAME post-hoc
# is_approved_domain() check every result already goes through below — still
# safe (nothing off-allowlist can reach the model), just enforced in one
# fewer place than the Tavily version was. SerpApi also only returns a short
# search-result `snippet`, not a fully-fetched page, so `content` here is
# necessarily shorter than the Tavily/local-cache versions — real text
# (SerpApi's own snippet, not fabricated), just less of it. This module does
# NOT re-fetch the page itself to get more: that was the original generic
# design (see git history), but plain HTTP fetches get HTTP 403 from
# investor.gov specifically (confirmed live during earlier work on this
# module), which is exactly the domain most queries here would resolve to —
# refetching would silently fail for the majority case, so a shorter but
# real snippet was chosen over a longer but frequently-unavailable page body.
SERPAPI_SEARCH_URL = "https://serpapi.com/search.json"

# One `site:` clause per approved domain, ORed together, so a single SerpApi
# call is restricted to results SerpApi believes are on an approved site —
# the query-text equivalent of Tavily's include_domains, weaker only in that
# it depends on the search engine actually honouring the operator rather
# than the provider enforcing it structurally.
_SITE_RESTRICTION = " OR ".join(f"site:{d}" for d in APPROVED_EDUCATIONAL_DOMAINS)


def _search_live_provider(query: str) -> Optional[SourceResult]:
    """Calls SerpApi, only active when SERPAPI_API_KEY is configured (see
    .env.example). NOT exercised in this environment: no such credential
    exists here (see module docstring), so this path is implemented and
    reviewed but UNTESTED against the real SerpApi API — verify the response
    shape against SerpApi's current docs before relying on it in production.
    """
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        return None

    import httpx

    try:
        resp = httpx.get(
            SERPAPI_SEARCH_URL,
            params={
                "engine": "google",
                "q": f"{query} ({_SITE_RESTRICTION})",
                "api_key": api_key,
                "num": 5,
            },
            timeout=8.0,
        )
        resp.raise_for_status()
        results = resp.json().get("organic_results", [])
    except Exception as e:
        logger.warning("SerpApi educational search call failed: %s", e)
        return None

    for item in results:
        url = item.get("link", "")
        # The `site:` clause above is a request to the engine, not a
        # guarantee — this check is what actually enforces the allowlist,
        # the same principle the rest of this module applies everywhere
        # else: never trust a single layer to enforce a safety boundary.
        if not url or not is_approved_domain(url):
            logger.info("Rejected %s: outside the approved-domain allowlist", url)
            continue
        content = (item.get("snippet") or "").strip()
        if not content:
            continue
        title = item.get("title") or url
        if _relevance_score(query, f"{title} {content}") == 0:
            logger.info("Rejected %s: approved domain but not relevant to %r", url, query)
            continue  # on-allowlist result, but not actually about this concept

        publisher = _publisher_for(url) or "Unknown"
        return SourceResult(title=title, publisher=publisher, url=url, content=content[:1500])

    return None


def search_local_cache_only(query: str) -> Optional[SourceResult]:
    """Public wrapper over the local cache lookup, with none of
    search_authoritative_education's live-provider fallback. Exists so a
    caller can check "does the hand-verified cache already have this" as its
    own separate step — specifically, api.py's acronym-clarification gate
    needs to allow an acronym THROUGH when the cache has a real, curated
    answer for it (e.g. "ETF") while still blocking it from ever reaching
    live web search when the cache doesn't (e.g. "RSA", "TER") — live search
    for a bare, unresolved acronym is exactly the case most likely to
    confidently answer with a real but wrong-context result (an ambiguous
    acronym has many genuine meanings; the search engine picks one without
    knowing which one this product means), so it must be gated OFF for that
    case rather than tried and hoped-to-fail. Never raises — degrades to
    None on any lookup failure, same contract as search_authoritative_education."""
    try:
        return _search_local_cache(query)
    except Exception as e:
        logger.warning("Local educational reference lookup failed: %s", e)
        return None


def search_live_provider_only(query: str) -> Optional[SourceResult]:
    """Public wrapper over the live-provider call alone, with no cache
    fallback (the caller already tried the cache itself, via
    search_local_cache_only, and is calling this only because that missed).
    Same never-raises contract as the other public search functions here."""
    try:
        return _search_live_provider(query)
    except Exception as e:
        logger.warning("Live educational search failed: %s", e)
        return None


def search_authoritative_education(query: str) -> Optional[SourceResult]:
    """Single entry point LEARNING_QUESTION's fallback tier calls. Tries the
    local validated cache FIRST, live provider only as a fallback for terms
    the cache genuinely has nothing on. Never raises — every failure
    degrades to None, which tells the caller to fall through to the
    acronym-clarification / honest "not covered yet" response rather than
    let the model guess.

    Cache-first, not live-first: a free-tier search provider (SerpApi: 100
    searches/month at time of writing) has a hard, small quota, and the
    local cache already holds a hand-verified, correctly-sourced answer for
    a meaningful chunk of what gets asked (~30 terms at time of writing).
    Trying the live provider first would spend one of those 100 searches on
    every single one of those already-answered queries, every time anyone
    asks — the quota would be gone before it ever reached a term the cache
    actually has a gap on. Checking the cache first means the live call only
    fires for genuine gaps, which is exactly where a paid/quota-limited
    search actually adds value over what's already known to be correct."""
    try:
        cached = _search_local_cache(query)
        if cached:
            return cached
    except Exception as e:
        logger.warning("Local educational reference lookup failed: %s", e)
    try:
        return _search_live_provider(query)
    except Exception as e:
        logger.warning("Live educational search failed: %s", e)
        return None


# ── Broad "I don't understand investing" style overview ────────────────────
# A single-term query ("what is diversification") is well served by
# search_authoritative_education's one-best-match scoring. A genuinely broad
# beginner question ("I don't understand investing", "give me beginner
# staple knowledge for investing") isn't ABOUT one term — it's a request for
# orientation across several — so scoring it against the user's own terse
# wording (which often shares almost no vocabulary with any single glossary
# entry) finds nothing. This is a separate RETRIEVAL SHAPE (several sources,
# not one), not a new intent or a new safety policy: still the same approved
# cache, same relevance scoring, same SourceResult shape.
_BROAD_BEGINNER_PATTERN = re.compile(
    r"\b(don'?t understand investing|new to investing|beginner|"
    r"staple knowledge|investing basics|basics of investing|"
    r"where (do|should) i start|getting started|how does investing work|"
    r"i don'?t know (anything |much )?about investing)\b",
    re.IGNORECASE,
)

# Fixed stand-in query covering the foundational concepts a beginner
# overview should be able to draw from — used to RANK the approved cache
# for a broad question, instead of the user's own (often vocabulary-thin)
# wording, which is why this is scored separately from the single-source
# path above rather than just calling _search_local_cache(query) again.
_BEGINNER_OVERVIEW_TOPICS = (
    "investing saving risk return diversification asset allocation "
    "dividend capital gains market volatility exchange traded fund"
)


def is_broad_beginner_query(query: str) -> bool:
    return bool(_BROAD_BEGINNER_PATTERN.search(query))


def search_beginner_overview(limit: int = 3) -> list[SourceResult]:
    """The `limit` most relevant approved sources for a broad beginner
    question, ranked against the fixed foundational-topics stand-in above.
    Deterministic and local only (no live-provider call — a live provider is
    built for single-term lookups, not a curated overview set); never
    invents a source, and returns [] rather than guessing when the cache
    somehow has nothing scoreable."""
    scored = [
        (entry, _relevance_score(_BEGINNER_OVERVIEW_TOPICS, f"{entry.title} {entry.content}"))
        for entry in _LOCAL_REFERENCE_CACHE
    ]
    scored = [(entry, score) for entry, score in scored if score > 0]
    scored.sort(key=lambda pair: -pair[1])
    return [entry for entry, _ in scored[:limit]]


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
