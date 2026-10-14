"""Ask AlphaSwarm — frozen offline routing/resolution eval.

WHY THIS EXISTS, and why it is a fixture rather than the live table.

Every routing bug found in this feature so far has been the same shape: a
string match standing in for a semantic decision. An ordinary English word
collided with a company name ("information" -> Fidelity National
Information Services), a sector word collided with a product line
("technology" -> Micron Technology), a preposition collided with a short
ticker ("assets ON my watchlist" -> ON Semiconductor), an index name
tokenised down to one letter ("S&P 500" -> SentinelOne, ticker "S"), a
fund family tied with itself (two Coronation funds), a numeric
distinguisher was invisible to a letters-only regex ("Satrix 40").

Each of those was found one user report at a time. This file is the
alternative: one run that exercises the whole deterministic layer against
a FIXED universe, so a collision is caught by CI instead of by a user.

The universe below is deliberately collision-heavy — it is not a sample of
the real table, it is a trap set. Every ticker and name in it exists to
provoke one of the failure modes above.

Fixtured, not live, for two reasons:
  1. The live table changes. A test asserting "ABCD resolves to nothing"
     silently became wrong the day ABCL was added — the test was right
     when written and the universe moved under it. A frozen universe
     cannot drift.
  2. These assertions are about the MATCHING RULES, not about today's
     inventory. Pinning the inventory is what makes the rules testable.

Scope: the deterministic layer only — entity resolution, the safety and
shape gates, and the glossary. Intent classification is one Groq call and
is deliberately out of scope here (it cannot be asserted offline without
pinning model output); it is covered by the live-path tests elsewhere.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.api as api  # noqa: E402


# ── The trap set ─────────────────────────────────────────────────────────
# Each entry is here because some ordinary word in it has collided, or
# plausibly could collide, with ordinary question vocabulary.

FIXTURE_ASSETS = [
    # Plain, well-known names — the cases that MUST keep resolving.
    {"id": "a1", "ticker": "AAPL", "name": "Apple Inc.", "universe": "Technology", "current_price": 5554.12},
    {"id": "a2", "ticker": "GOOGL", "name": "Alphabet Inc.", "universe": "Media & Communications", "current_price": 5677.96},
    {"id": "a3", "ticker": "AMZN", "name": "Amazon.com, Inc.", "universe": "Technology", "current_price": 4329.75},
    {"id": "a4", "ticker": "MSFT", "name": "Microsoft Corporation", "universe": "Technology", "current_price": 8613.0},
    {"id": "a5", "ticker": "TSLA", "name": "Tesla, Inc.", "universe": "AI & Robotics", "current_price": 5838.19},
    # Single/short tickers that are ordinary words or fragments.
    {"id": "b1", "ticker": "ON", "name": "ON Semiconductor Corp", "universe": "Technology", "current_price": 1200.0},
    {"id": "b2", "ticker": "S", "name": "SentinelOne Inc", "universe": "Technology", "current_price": 400.0},
    {"id": "b3", "ticker": "ALL", "name": "Allstate Corp", "universe": "Finance", "current_price": 3700.0},
    {"id": "b4", "ticker": "NOW", "name": "ServiceNow Inc", "universe": "Technology", "current_price": 16000.0},
    {"id": "b5", "ticker": "IT", "name": "Gartner Inc", "universe": "Technology", "current_price": 7000.0},
    {"id": "b6", "ticker": "RUN", "name": "Sunrun Inc", "universe": "Green Energy", "current_price": 200.0},
    # Sector words living inside real product names.
    {"id": "c1", "ticker": "MU", "name": "Micron Technology Inc", "universe": "Technology", "current_price": 3000.0},
    {"id": "c2", "ticker": "MRVL", "name": "Marvell Technology Inc", "universe": "Technology", "current_price": 1800.0},
    {"id": "c3", "ticker": "MP", "name": "MP Materials Corp", "universe": "Green Energy", "current_price": 900.0},
    {"id": "c4", "ticker": "WTRG", "name": "Essential Utilities Inc", "universe": "Green Energy", "current_price": 700.0},
    # Ordinary English words that are the ONE distinguishing word in a name
    # (the dangerous case: no tie to fall back on).
    {"id": "d1", "ticker": "FIS", "name": "Fidelity National Information Services Inc", "universe": "Finance", "current_price": 1500.0},
    {"id": "d2", "ticker": "FSLR", "name": "First Solar Inc", "universe": "Green Energy", "current_price": 3400.0},
    {"id": "d3", "ticker": "COF", "name": "Capital One Financial Corp", "universe": "Finance", "current_price": 3300.0},
    {"id": "d4", "ticker": "MWA", "name": "Mueller Water Products Inc", "universe": "Green Energy", "current_price": 450.0},
    {"id": "d5", "ticker": "KTOS", "name": "Kratos Defense & Security Solutions", "universe": "AI & Robotics", "current_price": 800.0},
    {"id": "d6", "ticker": "PNW", "name": "Pinnacle West Capital Corp", "universe": "Green Energy", "current_price": 1600.0},
    {"id": "d7", "ticker": "AWR", "name": "American States Water Co", "universe": "Green Energy", "current_price": 1400.0},
    {"id": "d8", "ticker": "GIS", "name": "General Mills Inc", "universe": "Finance", "current_price": 1300.0},
    # Edit-distance-1 neighbours, to pin the typo matcher's behaviour.
    {"id": "e1", "ticker": "NVDA", "name": "NVIDIA Corporation", "universe": "AI & Robotics", "current_price": 3200.0},
    {"id": "e2", "ticker": "META", "name": "Meta Platforms Inc", "universe": "Media & Communications", "current_price": 10000.0},
]

FIXTURE_FUNDS = [
    # Two same-family funds: neither may win on the shared family word alone.
    {"id": "f1", "name": "Coronation Balanced Plus Fund (A)", "jse_code": None, "manco": "Coronation", "asisa_category": "Multi Asset - High Equity", "tfsa_eligible": False},
    {"id": "f2", "name": "Coronation Strategic Income Fund (P)", "jse_code": None, "manco": "Coronation", "asisa_category": "Multi Asset - Income", "tfsa_eligible": False},
    # Three same-family funds, distinguished only by one ordinary word each.
    {"id": "f3", "name": "Ninety One Diversified Income Fund (A)", "jse_code": None, "manco": "Ninety One", "asisa_category": "Multi Asset - Income", "tfsa_eligible": False},
    {"id": "f4", "name": "Ninety One Equity Fund (A)", "jse_code": None, "manco": "Ninety One", "asisa_category": "Equity - SA General", "tfsa_eligible": False},
    {"id": "f5", "name": "Ninety One Opportunity Fund (A)", "jse_code": None, "manco": "Ninety One", "asisa_category": "Multi Asset - High Equity", "tfsa_eligible": False},
    # Numeric distinguishers — invisible to a letters-only matcher.
    {"id": "f6", "name": "Satrix 40 ETF", "jse_code": "STX40", "manco": "Satrix", "asisa_category": "Equity - SA General", "tfsa_eligible": True},
    {"id": "f7", "name": "Satrix MSCI World Feeder ETF", "jse_code": "STXWDM", "manco": "Satrix", "asisa_category": "Equity - General", "tfsa_eligible": True},
    {"id": "f8", "name": "Sygnia Itrix Top 40 ETF", "jse_code": "SYG40", "manco": "Sygnia", "asisa_category": "Equity - SA General", "tfsa_eligible": True},
    {"id": "f9", "name": "Sygnia Itrix MSCI World Index ETF", "jse_code": "SYGWD", "manco": "Sygnia", "asisa_category": "Equity - General", "tfsa_eligible": True},
]


class _FixtureTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_kw):
        return self

    # Filters are accepted and ignored: these tests exercise the MATCHING
    # rules, which run in Python over the full returned set. A filter that
    # mattered to a rule under test would be asserted on directly instead.
    def eq(self, *_a, **_kw):
        return self

    def in_(self, *_a, **_kw):
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, *_a, **_kw):
        return self

    def execute(self):
        return type("Resp", (), {"data": list(self._rows)})()


class _FixtureSupabase:
    def table(self, name):
        if name == "assets":
            return _FixtureTable(FIXTURE_ASSETS)
        return _FixtureTable([])


@pytest.fixture(autouse=True)
def _frozen_universe(monkeypatch):
    """Every test in this module sees the trap set, never the live table."""
    monkeypatch.setattr(api, "supabase", _FixtureSupabase())


class _FixtureFundRepository:
    def list_active(self, *_a, **_kw):
        return list(FIXTURE_FUNDS)

    def latest_snapshots(self, fund_ids):
        return {}


@pytest.fixture
def _frozen_funds(monkeypatch):
    import src.funds.repository as fund_repo
    monkeypatch.setattr(fund_repo, "FundRepository", _FixtureFundRepository)
    monkeypatch.setattr("src.funds.config.FUNDS_ENABLED", True)


# ── 1. Entity resolution: what must resolve ──────────────────────────────

RESOLVES_TO = [
    # (query, expected ticker)
    ("tell me about AAPL", "AAPL"),
    ("tell me about apple", "AAPL"),
    ("how is Apple doing", "AAPL"),
    ("what about google", "GOOGL"),          # alias: Google -> Alphabet
    ("how is alphabet doing", "GOOGL"),
    ("tell me about amazon", "AMZN"),
    ("what is microsoft's RSI", "MSFT"),
    ("tell me about NVIDIA", "NVDA"),
    ("tell me about tesla", "TSLA"),
    # Explicit short tickers, typed in caps, must still work.
    ("tell me about ON", "ON"),
    ("what is S doing", "S"),
    # Possessive typo with no apostrophe, typed in caps.
    ("GOOGLS rsi", "GOOGL"),
    # One-edit ticker typo, typed in caps.
    ("tell me about NDVA", "NVDA"),
]


def test_lowercase_possessive_typo_is_deliberately_not_resolved():
    """A deliberate, documented trade, not an oversight.

    The possessive-S rule used to accept any case, which meant any ordinary
    word ending in "s" whose stem is a real ticker resolved to that ticker.
    The worst case was "its" -> IT: the single commonest word in this
    product's own follow-up vocabulary ("what does ITS RSI mean?") silently
    resolved to a company the user never named.

    No vocabulary list fixes that — "runs"/RUN, "keys"/KEY, "lows"/LOW,
    "news"/NEW and "funds"/FUND are all ordinary words with real or
    plausible ticker stems. Requiring caps-as-typed is a signal FROM the
    user that they meant a symbol, which is the same answer the
    edit-distance matcher already settled on after "tell"/DELL,
    "beta"/META and "buy"/BMY. The cost is this: a lowercase typo'd
    possessive gets a clarification instead of an answer."""
    assert api._resolve_asset("googls rsi") is None
    assert api._resolve_asset("GOOGLS rsi") is not None


@pytest.mark.parametrize("query,expected", RESOLVES_TO)
def test_named_asset_resolves(query, expected):
    resolved = api._resolve_asset(query)
    assert resolved is not None, f"{query!r} resolved to nothing; expected {expected}"
    assert resolved["ticker"] == expected, f"{query!r} -> {resolved['ticker']}, expected {expected}"


# ── 2. Entity resolution: what must NOT resolve ──────────────────────────
# Every one of these is a real collision that reached a user, or the same
# shape as one that did. A regression here is a fabricated answer about a
# company the user never mentioned.

RESOLVES_TO_NOTHING = [
    # Prepositions / short words vs short tickers (lowercase as typed).
    ("compare the assets on my watchlist", "'on' vs ON Semiconductor"),
    ("what is on my watchlist", "'on' vs ON Semiconductor"),
    ("show me all my stocks", "'all' vs Allstate"),
    ("what should i do now", "'now' vs ServiceNow"),
    ("is it worth tracking", "'it' vs Gartner"),
    ("let's run the numbers", "'run' vs Sunrun"),
    # Index names that tokenise down to a one-letter ticker.
    ("what is the S&P 500 doing", "'S&P 500' vs SentinelOne (ticker S)"),
    ("how did the S&P 500 close", "'S&P 500' vs SentinelOne"),
    # Sector words inside product names.
    ("show me technology assets in my universe", "'technology' vs Micron/Marvell Technology"),
    ("which materials stocks do you cover", "'materials' vs MP Materials"),
    ("what about utilities", "'utilities' vs Essential Utilities"),
    # Ordinary English words that distinguish exactly one company.
    ("give me information please", "'information' vs Fidelity National Information Services"),
    ("this is my first stock purchase", "'first' vs First Solar"),
    ("i need financial advice", "'financial' vs Capital One Financial"),
    ("what products do you offer", "'products' vs Mueller Water Products"),
    ("i have security concerns", "'security' vs Kratos ... Security Solutions"),
    ("the national economy is slowing", "'national' vs Fidelity National"),
    ("prices out west are higher", "'west' vs Pinnacle West"),
    ("the united states market", "'states' vs American States Water"),
    # Generic openers with no asset in them at all.
    ("tell me about the weather", "no asset named"),
    ("can you explain this to me", "no asset named"),
    ("what does this mean", "no asset named"),
    ("how does this work", "no asset named"),
    # Product vocabulary one edit from a real ticker.
    ("what does its beta mean", "'beta' vs META"),
]


@pytest.mark.parametrize("query,why", RESOLVES_TO_NOTHING)
def test_ordinary_words_never_resolve_to_a_company(query, why):
    resolved = api._resolve_asset(query)
    assert resolved is None, (
        f"{query!r} fabricated a match to {resolved['ticker'] if resolved else None} "
        f"({resolved['name'] if resolved else ''}) — collision: {why}"
    )


@pytest.mark.parametrize("query,why", RESOLVES_TO_NOTHING)
def test_ordinary_words_never_resolve_in_the_multi_asset_path(query, why):
    """_resolve_multiple_assets is the more dangerous of the two: it has no
    ambiguity check (returning several assets is its purpose), so a
    collision there is returned rather than refused. This is the path
    _ask_asset_search calls first."""
    resolved = api._resolve_multiple_assets(query, limit=5)
    assert resolved == [], (
        f"{query!r} fabricated matches to {[a['ticker'] for a in resolved]} — collision: {why}"
    )


# ── 3. Ambiguity must refuse, not guess ──────────────────────────────────

def test_a_word_shared_by_two_companies_refuses_rather_than_picking_one():
    """'technology' is in both Micron Technology and Marvell Technology. Even
    with the sector-word exclusion removed this must refuse — two equally
    good matches is not a resolution."""
    assert api._resolve_asset("I work in technology") is None


def test_an_unrelated_ticker_shaped_token_refuses():
    """A ticker-shaped token with no close real neighbour must refuse. In
    this frozen universe nothing is within one edit of ZZZZ."""
    assert api._resolve_asset("Tell me about ZZZZ") is None


# ── 4. Safety and shape gates ────────────────────────────────────────────
# These are pure regex and must hold regardless of the asset universe.

BLOCKED_AS_ADVICE = [
    "Should I buy NVDA?",
    "Should I sell my Apple shares?",
    "Which stock should I buy?",
    "What should I invest in?",
    "Is AAPL a good investment?",
    "Will NVDA go up next week?",
    "What is your price target for Tesla?",
]


@pytest.mark.parametrize("query", BLOCKED_AS_ADVICE)
def test_advice_questions_are_blocked_before_any_model_call(query):
    assert api._ask_blocklist_hit(query), f"{query!r} was not caught as advice"


PERSONAL_FINANCE = [
    "How should I structure my Roth IRA withdrawal?",
    "Which fund should I put in my TFSA?",
    "How do I pay off my debt faster?",
    "What should my portfolio allocation be?",
    "How much tax on my ETF gains?",
]


@pytest.mark.parametrize("query", PERSONAL_FINANCE)
def test_personal_finance_questions_hit_the_boundary(query):
    assert api._ASK_PERSONAL_FINANCE_PATTERN.search(query), f"{query!r} missed the boundary"


GENERAL_CONCEPT_NOT_PERSONAL = [
    # The other side of the same line: a factual definition must stay
    # answerable. "What is a TFSA?" used to be refused as personal advice.
    "What is a TFSA?",
    "What is capital gains tax?",
    "What is a tax-free savings account?",
]


@pytest.mark.parametrize("query", GENERAL_CONCEPT_NOT_PERSONAL)
def test_general_concept_questions_are_not_treated_as_personal_advice(query):
    assert not api._ASK_PERSONAL_FINANCE_PATTERN.search(query), (
        f"{query!r} was wrongly refused as personalised advice"
    )


OUT_OF_SCOPE = [
    "What's my bank account balance?",
    "Compare the Basic Checking and Premium Checking account",
    "What's the interest rate on a car loan?",
    "How much is my insurance premium?",
]


@pytest.mark.parametrize("query", OUT_OF_SCOPE)
def test_unrelated_consumer_banking_is_out_of_scope(query):
    assert api._ASK_OUT_OF_SCOPE_PATTERN.search(query), f"{query!r} was not flagged out of scope"


COLLECTION_SHAPED = [
    "compare the assets on my watchlist",
    "what's on my watchlist",
    "show me technology assets in my universe",
    "how is my portfolio doing",
    "rank my stocks",
]


@pytest.mark.parametrize("query", COLLECTION_SHAPED)
def test_collection_phrasing_is_recognised(query):
    """A query possessive about a collection must be recognised as such, so
    company-name matching is skipped for it entirely."""
    assert api._ASK_COLLECTION_PHRASING_PATTERN.search(query), (
        f"{query!r} was not recognised as a collection question"
    )


def test_singular_other_one_is_not_treated_as_the_whole_group():
    """'the other one' means a different single asset; 'the other 4' means
    the rest of a list. Conflating them answered a group question about one
    asset."""
    assert not api._ASK_OTHER_RANKED_PATTERN.search("what about the other one")
    assert api._ASK_OTHER_RANKED_PATTERN.search("and the other 4?")
    assert api._ASK_OTHER_RANKED_PATTERN.search("what about the rest?")


def test_probing_followups_are_recognised_as_interpretation():
    """'why is that?' after an answer is a request to explain the reasoning,
    not to re-state the same metrics."""
    for q in ("why is that?", "why's that", "is that concerning?"):
        assert api._ASK_QUALITATIVE_PERFORMANCE_PATTERN.search(q), f"{q!r} missed"


# ── 5. Glossary coverage ─────────────────────────────────────────────────
# Terms the product itself puts on screen must be explainable locally,
# without a live search that can fail or return an off-allowlist page.

MUST_BE_IN_GLOSSARY = [
    "beta", "rsi", "sharpe ratio", "volatility", "macd",
    "signal strength", "convergence", "data sufficiency", "profile fit",
    "sentiment score", "quant score", "rank", "confidence score",
    "institutional ownership", "institutional owners", "13f",
    "insider dealings", "insider trading", "form 4",
    "whale watching", "etf", "asset", "spy", "s&p 500",
    "tfsa", "mdd", "isin", "asisa", "reg 28",
]


@pytest.mark.parametrize("term", MUST_BE_IN_GLOSSARY)
def test_onscreen_term_has_a_local_definition(term):
    assert term in api._ASK_GLOSSARY, (
        f"{term!r} appears in the product but has no local definition — it will "
        f"fall through to live search, which can fail or be rejected by the allowlist"
    )


def test_no_glossary_definition_gives_advice_or_predicts():
    """A definition is reference text shown verbatim, so it must satisfy the
    same rules the narrator is held to."""
    from src.utils.ask_output_validator import validate_ask_output
    for term, definition in api._ASK_GLOSSARY.items():
        result = validate_ask_output(definition)
        assert result.valid, f"glossary[{term!r}] violates output rules: {result.violations}"


# ── 6. Fund resolution ───────────────────────────────────────────────────

FUND_RESOLVES_TO = [
    ("tell me about coronation balanced plus fund", "Coronation Balanced Plus Fund (A)"),
    ("tell me about coronation strategic income fund", "Coronation Strategic Income Fund (P)"),
    ("what is the TER on the ninety one equity fund", "Ninety One Equity Fund (A)"),
    ("tell me about ninety one opportunity fund", "Ninety One Opportunity Fund (A)"),
    ("tell me about ninety one diversified income fund", "Ninety One Diversified Income Fund (A)"),
    ("tell me about satrix 40 etf", "Satrix 40 ETF"),
    ("tell me about satrix msci world feeder etf", "Satrix MSCI World Feeder ETF"),
    ("tell me about sygnia itrix top 40 etf", "Sygnia Itrix Top 40 ETF"),
    ("tell me about sygnia itrix msci world index etf", "Sygnia Itrix MSCI World Index ETF"),
]


@pytest.mark.parametrize("query,expected", FUND_RESOLVES_TO)
def test_fund_resolves_within_its_own_family(_frozen_funds, query, expected):
    """The hard part is not finding 'Coronation' — it is choosing BETWEEN
    two Coronation funds, or between two Satrix ETFs distinguished only by
    a number."""
    resolved = api._resolve_fund(query)
    assert resolved is not None, f"{query!r} resolved to no fund; expected {expected}"
    assert resolved["name"] == expected, f"{query!r} -> {resolved['name']}, expected {expected}"


def test_a_bare_family_name_refuses_rather_than_picking_a_sibling(_frozen_funds):
    """'Coronation' alone matches two funds equally. Picking either would be
    wrong half the time."""
    assert api._resolve_fund("tell me about the coronation fund") is None


def test_fund_resolution_is_off_when_the_feature_flag_is(monkeypatch):
    monkeypatch.setattr("src.funds.config.FUNDS_ENABLED", False)
    assert api._resolve_fund("tell me about coronation balanced plus fund") is None


# ── 7. The resolution envelope ───────────────────────────────────────────
# The envelope lets a model propose POINTERS for questions the patterns
# cannot route. These tests pin the property that makes that safe: a
# proposed symbol is only ever usable if it exists in the real table.


def test_verification_keeps_real_symbols():
    verified = api._verify_envelope_tickers(["AAPL", "NVDA"])
    assert {a["ticker"] for a in verified} == {"AAPL", "NVDA"}


def test_verification_discards_invented_symbols():
    """The whole safety mechanism in one assertion: a symbol the model made
    up does not survive the lookup, so it can never reach retrieval."""
    verified = api._verify_envelope_tickers(["AAPL", "XYZQ", "NOTREAL", "FAKECO"])
    assert [a["ticker"] for a in verified] == ["AAPL"]


def test_verification_of_only_invented_symbols_yields_nothing():
    assert api._verify_envelope_tickers(["XYZQ", "ZZZZ"]) == []


def test_verification_is_case_and_separator_insensitive():
    assert [a["ticker"] for a in api._verify_envelope_tickers(["aapl"])] == ["AAPL"]


def test_envelope_cannot_recover_a_safety_label():
    """UNSUPPORTED_FINANCIAL_ADVICE and UNKNOWN are absent from the
    recoverable set on purpose: this layer exists to recover an "I don't
    know", never to revisit a refusal."""
    assert "UNSUPPORTED_FINANCIAL_ADVICE" not in api._ASK_ENVELOPE_SAFE_INTENTS
    assert "UNKNOWN" not in api._ASK_ENVELOPE_SAFE_INTENTS


def test_envelope_returns_nothing_when_the_model_proposes_a_refusal(monkeypatch):
    """A model reply labelling the question as advice must not be turned
    into a recovery — _resolve_ask_envelope drops it entirely."""
    class _AdviceClient:
        def complete(self, _prompt):
            return '{"intent": "UNSUPPORTED_FINANCIAL_ADVICE", "tickers": ["NVDA"], "funds": [], "metric": null}'

    monkeypatch.setattr(api, "_get_ask_intent_client", lambda: _AdviceClient())
    assert api._resolve_ask_envelope("should i buy nvda") is None


def test_envelope_survives_unparseable_model_output(monkeypatch):
    class _JunkClient:
        def complete(self, _prompt):
            return "I think you mean Apple, probably?"

    monkeypatch.setattr(api, "_get_ask_intent_client", lambda: _JunkClient())
    assert api._resolve_ask_envelope("the iphone company") is None


def test_envelope_tolerates_json_wrapped_in_prose(monkeypatch):
    """Models fence or preface JSON often enough that requiring a bare
    object would throw away usable output."""
    class _FencedClient:
        def complete(self, _prompt):
            return 'Sure!\n```json\n{"intent":"ANALYSIS_EXPLANATION","tickers":["AAPL"],"funds":[],"metric":null}\n```'

    monkeypatch.setattr(api, "_get_ask_intent_client", lambda: _FencedClient())
    env = api._resolve_ask_envelope("the iphone company")
    assert env is not None and env["tickers"] == ["AAPL"]


def test_envelope_is_off_when_its_client_is_unavailable(monkeypatch):
    monkeypatch.setattr(api, "_get_ask_intent_client", lambda: None)
    assert api._resolve_ask_envelope("the iphone company") is None


# ── 8. A boundary refusal is final ───────────────────────────────────────

def test_a_scope_refusal_is_never_re_answered_from_user_data():
    """Regression: the sense-check treated a scope-boundary refusal as a
    generic answer worth retrying, so "what's my bank account balance?" —
    correctly refused — got re-answered out of the user's watchlist because
    the question contains "my"."""
    assert "scope_boundary" not in api._ASK_GENERIC_SOURCES


def test_prediction_questions_naming_the_asset_are_blocked():
    """The substring blocklist only held the pronoun form ("will it go
    up"), so the natural named form slipped the deterministic gate and was
    left to the classifier."""
    for q in ("Will NVDA go up next week?", "Will Apple go down?",
              "Is Tesla going to rise?", "where will AAPL be in a year",
              "how high will NVDA go", "what's your price target for Tesla"):
        assert api._ask_blocklist_hit(q), f"{q!r} slipped the prediction gate"


def test_the_prediction_gate_does_not_catch_legitimate_questions():
    for q in ("What is RSI?", "Tell me about NVDA", "what is a bull market",
              "Why does AAPL rank above MSFT?", "how does the ranking work",
              "what is my watchlist"):
        assert not api._ask_blocklist_hit(q), f"{q!r} was wrongly blocked"


# ── 9. The user's own data: right list, right question ───────────────────
# The watchlist and the latest run's top picks are different lists that
# overlap. Handing the narrator both lets an answer about one describe the
# other, which is true about the wrong thing.

WATCHLIST_SCOPED = [
    "what is on my watchlist",
    "tell me about the assets on my watchlist",
    "which stocks am I tracking",
    "compare the assets on my watchlist",
]


@pytest.mark.parametrize("query", WATCHLIST_SCOPED)
def test_watchlist_questions_are_scoped_to_the_watchlist(query):
    assert api._ASK_WATCHLIST_SCOPE_PATTERN.search(query), f"{query!r} not read as a watchlist question"
    assert not api._ASK_RUN_SCOPE_PATTERN.search(query), f"{query!r} wrongly also read as a run question"


RUN_SCOPED = [
    "what are my top picks",
    "what are my top recommended assets",
    "show me my shortlist",
    "what did my latest run rank highest",
]


@pytest.mark.parametrize("query", RUN_SCOPED)
def test_top_pick_questions_are_scoped_to_the_run(query):
    assert api._ASK_RUN_SCOPE_PATTERN.search(query), f"{query!r} not read as a run question"
    assert not api._ASK_WATCHLIST_SCOPE_PATTERN.search(query), f"{query!r} wrongly also read as a watchlist question"


OWN_RESULTS = [
    "what are my top picks",
    "what are my top recommended assets",
    "show me my shortlist",
    "what are my rankings",
    "what did my latest run recommend",
]


@pytest.mark.parametrize("query", OWN_RESULTS)
def test_asking_for_your_own_results_is_not_treated_as_asking_for_advice(query):
    """Regression: the classifier refused "what are my top picks" as
    investment advice, so a user asking to see the output of a run they had
    already done was told AlphaSwarm doesn't give advice. Settled
    deterministically now — "my" means an existing list, not a request for
    a new recommendation."""
    assert api._ASK_OWN_RESULTS_PATTERN.search(query), f"{query!r} not recognised as the user's own results"
    assert not api._ask_blocklist_hit(query), f"{query!r} was blocked as advice"


def test_asking_to_be_told_what_to_buy_is_still_advice():
    """The other side of the line: without the possessive, it is a request
    for a recommendation and must stay refused."""
    for q in ("recommend me a stock", "what should I buy", "which stock should i buy",
              "what's the best stock for me"):
        assert not api._ASK_OWN_RESULTS_PATTERN.search(q), f"{q!r} wrongly read as the user's own data"


# ── 10. Rank claims written in words ─────────────────────────────────────

def test_a_wrong_rank_stated_in_words_is_caught():
    """Regression: every numeric check in the validator matches digits, so
    "It ranks first" was unverified. A narration claimed AAPL ranked first
    while MA was rank 1 and passed validation cleanly."""
    from src.utils.ask_output_validator import validate_ask_output
    assets = [
        {"ticker": "MA", "rank": 1},
        {"ticker": "AAPL", "rank": 2},
    ]
    result = validate_ask_output(
        "The top pick is Apple (AAPL). It ranks first in AlphaSwarm's run.",
        comparison_assets=assets,
    )
    assert not result.valid
    assert any("UNSUPPORTED_RANK_CLAIM" in v for v in result.violations)


def test_a_correct_rank_stated_in_words_passes():
    from src.utils.ask_output_validator import validate_ask_output
    assets = [{"ticker": "MA", "rank": 1}, {"ticker": "AAPL", "rank": 2}]
    result = validate_ask_output(
        "Mastercard (MA) is the top pick. Apple (AAPL) ranks second.",
        comparison_assets=assets,
    )
    assert result.valid, result.violations


def test_rank_one_claims_made_in_prose_are_caught():
    """The observed failure said "Apple leads with a strong quant score"
    while Apple was rank 2 — a rank-1 claim with no ordinal and no digit
    in it."""
    from src.utils.ask_output_validator import validate_ask_output
    assets = [{"ticker": "MA", "rank": 1}, {"ticker": "AAPL", "rank": 2}]
    for wrong in ("Apple (AAPL) leads the list with a strong quant score.",
                  "Apple (AAPL) is the highest-ranked name this run.",
                  "Apple (AAPL) is the top pick."):
        result = validate_ask_output(wrong, comparison_assets=assets)
        assert not result.valid, f"missed a false rank-1 claim: {wrong!r}"

    right = validate_ask_output(
        "Mastercard (MA) leads the list. Apple (AAPL) follows.", comparison_assets=assets,
    )
    assert right.valid, right.violations


def test_an_unattributable_rank_claim_is_skipped_not_guessed():
    """A sentence naming two assets does not let either own the claim."""
    from src.utils.ask_output_validator import validate_ask_output
    assets = [{"ticker": "MA", "rank": 1}, {"ticker": "AAPL", "rank": 2}]
    result = validate_ask_output(
        "AAPL and MA both rank in the top five.", comparison_assets=assets,
    )
    assert result.valid, result.violations


# ── 11. Provenance ───────────────────────────────────────────────────────

def test_verified_figures_are_reported_not_discarded():
    """The validator already resolves claim -> field -> trusted value to
    check a figure; that mapping IS the provenance and is now returned."""
    from src.utils.ask_output_validator import validate_ask_output
    result = validate_ask_output(
        "AAPL's RSI is about 56.1 and its beta is 0.64.",
        data={"ticker": "AAPL", "rsi": 56.14, "beta": 0.6413},
    )
    assert result.valid, result.violations
    reported = {(c.ticker, c.field) for c in result.verified_claims}
    assert ("AAPL", "rsi") in reported
    assert ("AAPL", "beta") in reported


def test_an_answer_with_no_figures_reports_no_provenance():
    """Empty means "stated no checkable figure", not "unverified"."""
    from src.utils.ask_output_validator import validate_ask_output
    result = validate_ask_output(
        "Beta measures how much an asset moves relative to the market.",
        data={"ticker": "AAPL", "beta": 0.64},
    )
    assert result.valid
    assert result.verified_claims == []


def test_a_rejected_answer_reports_no_provenance():
    """A figure that failed verification must never be reported as if it
    had passed."""
    from src.utils.ask_output_validator import validate_ask_output
    result = validate_ask_output(
        "AAPL's RSI is about 91.", data={"ticker": "AAPL", "rsi": 56.14},
    )
    assert not result.valid
    assert result.verified_claims == []


# ── 12. A decline never carries a citation ───────────────────────────────

def test_source_declines_are_recognised():
    """Regression: an approved page that turned out not to cover the term
    produced "the information you provided doesn't cover X" — shipped as
    the answer, with that regulator cited underneath it. Recognising the
    decline is what lets the question fall through to a better source and
    keeps the citation off a non-answer."""
    declines = [
        "I'm sorry, but the information you provided doesn't cover dollar cost averaging.",
        "I'm sorry, but the source material doesn't provide information about stop-loss orders.",
        "I don't have enough information to answer that.",
        "The source does not mention this term.",
        "I can't give an answer based on that source.",
        api._ASK_LEARNING_NOT_COVERED_MESSAGE,
    ]
    for text in declines:
        assert api._ask_learning_answer_declined(text), f"not recognised as a decline: {text!r}"


def test_real_answers_are_not_mistaken_for_declines():
    answers = [
        "Dollar-cost averaging means investing the same amount at regular intervals.",
        "Beta is a measure of how much an asset's price moves relative to the market.",
        "An index fund aims to track the performance of a specific market index.",
        "A stop-loss order tells your broker to sell once a price level is reached.",
    ]
    for text in answers:
        assert not api._ask_learning_answer_declined(text), f"real answer read as a decline: {text!r}"


# ── 13. Links point where the answer actually went ───────────────────────

def test_a_refusal_carries_no_link():
    resp = api.AskResponse(
        intent="UNSUPPORTED_FINANCIAL_ADVICE", narration="no", data={},
        source="blocklist", is_blocked=True,
    )
    assert api._ask_response_link(resp) is None


def test_a_single_asset_answer_links_to_that_asset():
    resp = api.AskResponse(
        intent="ANALYSIS_EXPLANATION", narration="ok", data={"ticker": "AAPL"},
        source="ai_recommendation",
    )
    link = api._ask_response_link(resp)
    assert link is not None and link.path == "/asset/AAPL"


def test_a_watchlist_answer_links_to_the_watchlist_not_the_rankings():
    resp = api.AskResponse(
        intent="USER_DATA_SEARCH", narration="ok",
        data={"watchlist": [{"ticker": "TSLA"}, {"ticker": "AMD"}]},
        source="user_data",
    )
    link = api._ask_response_link(resp)
    assert link is not None and link.path == "/watchlist"


def test_a_top_picks_answer_links_to_the_ranked_stocks():
    resp = api.AskResponse(
        intent="USER_DATA_SEARCH", narration="ok",
        data={"top_picks": [{"ticker": "MA"}, {"ticker": "AAPL"}]},
        source="user_data",
    )
    link = api._ask_response_link(resp)
    assert link is not None and link.path == "/assets"
