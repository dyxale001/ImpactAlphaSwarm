"""The Insider trading tab's AI summary: a short, technical note on a ticker's insider
dealings, naming the biggest ones and saying how the market usually reads them.

Built on the Big investors summary (ww_trace.py) and the same length as it: four or
five sentences, no more than 110 words. Unlike it, there is no "So this means" closing:
the user had it taken out of this note. The generator, guard,
cache and service are the Big investors classes, subclassed; only what is about insiders
is new.

What the code decides, never the model:

  * the highlights: the biggest dealings by value, an open-market purchase first, each
    with the insider's name, role, amount and date;
  * how each kind of dealing is read: an open-market purchase (code P) as a vote of
    confidence, a sale (code S) as weaker, everything else (grants, options, tax) as
    compensation mechanics;
  * clusters, judged between the dealings' own dates and never against today;
  * the share price move since the main dealing, stated as a fact. Whether the dealing
    caused it is unknowable, so the guard refuses any paragraph that says it did.

Caching: the fingerprint is the filings alone. The price move is looked up only when a
summary is about to be written, frozen with its date, and kept out of the fingerprint,
so a summary is rewritten when a new filing arrives and not every time the price moves.

Saying an insider bought or sold shares is describing them, and is allowed. Telling the
reader to buy, sell or hold anything is advice, and the guard refuses those phrasings
anywhere in the note.
"""

from __future__ import annotations

import dataclasses
import datetime
import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from .ww_config import WhaleConfig
from .ww_trace import (
    FORBIDDEN_PATTERNS,
    InstitutionalTraceGenerator,
    InstitutionalTraceGuard,
    InstitutionalTraceRepository,
    InstitutionalTraceService,
    spell_date,
)

logger = logging.getLogger("alpha-api")

#: Bumped whenever the prompt or the facts change shape, so stored summaries are
#: rewritten once.
INSIDER_TRACE_VERSION = 4

#: Several insiders dealing within this many days of each other is a cluster.
CLUSTER_WINDOW_DAYS = 30
CLUSTER_MIN_PURCHASERS = 2
#: Selling is common, so it takes more insiders selling together to be worth noting.
CLUSTER_MIN_SELLERS = 3
#: How many dealings the note names. The pattern sentence covers the rest; naming two
#: ran the note to 150 words.
MAX_HIGHLIGHTS = 1
#: An open-market purchase this large gets "of this size" in how the market reads it.
LARGE_PURCHASE_USD = 1_000_000

OPEN_PURCHASE = "P"
OPEN_SALE = "S"

#: What each routine SEC code is, as the note says it. Mirrors TXN_NATURE in
#: frontend/src/components/research/whaleFormat.ts.
ROUTINE_ACTIONS: dict[str, str] = {
    "A": "received shares as a grant",
    "M": "exercised options",
    "X": "exercised options",
    "F": "had shares withheld for tax",
    "G": "gave or received shares as a gift",
    "D": "returned shares to the company",
    "C": "converted another security into shares",
}

_CEO = re.compile(r"\b(chief executive|ceo)\b", re.IGNORECASE)
_CFO = re.compile(r"\b(chief financial|cfo)\b", re.IGNORECASE)
_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _parse_day(value: Optional[str]) -> Optional[datetime.date]:
    m = _DATE.match(value or "")
    if not m:
        return None
    try:
        return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _chief(role: Optional[str]) -> str:
    """'the chief executive', 'the finance chief', or '' for anyone else."""
    if _CEO.search(role or ""):
        return "the chief executive"
    if _CFO.search(role or ""):
        return "the finance chief"
    return ""


def _clustered(dealings: list[tuple[datetime.date, str]], minimum: int) -> bool:
    """Whether `minimum` different insiders dealt within the window of each other."""
    dealings = sorted(dealings)
    for i, (start, _) in enumerate(dealings):
        names = {name for day, name in dealings[i:] if (day - start).days <= CLUSTER_WINDOW_DAYS}
        if len(names) >= minimum:
            return True
    return False


_SUFFIXES = {"jr": "Jr.", "jr.": "Jr.", "sr": "Sr.", "sr.": "Sr.", "ii": "II", "iii": "III", "iv": "IV"}


def _title(word: str) -> str:
    if len(word.replace(".", "")) == 1:
        return f"{word[0].upper()}."
    return "-".join(part[:1].upper() + part[1:] for part in word.split("-"))


def format_name(raw: str) -> str:
    """Finnhub's "COHEN RYAN" as prose reads it: "Ryan Cohen".

    Finnhub lists the surname first, then the given names and any initials. In a
    sentence that reads backwards ("Cohen Ryan made a purchase"), so the first word moves
    to the end, before any suffix. "LEVINSON ARTHUR D" becomes "Arthur D. Levinson" and
    "WILSON-THOMPSON KATHLEEN" becomes "Kathleen Wilson-Thompson". The tab's list keeps
    Finnhub's order; only the note reorders.
    """
    words = (raw or "").strip().lower().split()
    if not words:
        return "an insider"
    suffix = [_SUFFIXES[w] for w in words[1:] if w in _SUFFIXES]
    given = [w for w in words[1:] if w not in _SUFFIXES]
    ordered = [_title(w) for w in given] + [_title(words[0])] + suffix
    return " ".join(ordered)


def money(value: float) -> str:
    """A dollar amount as the note prints it: "$10.6 million", "$450,000"."""
    for size, word in ((1e9, "billion"), (1e6, "million")):
        if value >= size:
            text = f"{value / size:.1f}".rstrip("0").rstrip(".")
            return f"${text} {word}"
    return f"${value:,.0f}"


# ── evidence ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Highlight:
    """One dealing the note names."""

    name: str
    role: str
    code: str
    day: Optional[str]
    value: Optional[float]
    shares: Optional[int]

    @property
    def is_purchase(self) -> bool:
        return self.code == OPEN_PURCHASE

    @property
    def is_sale(self) -> bool:
        return self.code == OPEN_SALE

    @property
    def who(self) -> str:
        return f"{self.name}, {self.role}," if self.role else self.name

    @property
    def amount(self) -> str:
        if self.value:
            return money(self.value)
        if self.shares:
            return f"{self.shares:,} shares"
        return "shares"

    def as_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass(frozen=True)
class PriceMove:
    """The share price on the main dealing's day against a later close. A fact about the
    price, frozen when the note is written; never a claim about why it moved."""

    change_pct: float
    since: str
    as_of: str


@dataclass(frozen=True)
class InsiderEvidence:
    """One ticker's insider dealings, as the note is allowed to see them."""

    ticker: str
    total: int
    purchasers: int
    sellers: int
    routine: int
    purchase_cluster: bool
    sale_cluster: bool
    #: "the chief executive", "the finance chief", or "" when neither purchased.
    chief_purchased: str
    as_of: Optional[str]
    highlights: tuple[Highlight, ...] = field(default_factory=tuple)
    price: Optional[PriceMove] = None

    @classmethod
    def from_payload(cls, ticker: str, payload: dict) -> "InsiderEvidence":
        transactions = [t for t in (payload.get("transactions") or []) if t]
        purchases: list[tuple[datetime.date, str]] = []
        sales: list[tuple[datetime.date, str]] = []
        purchaser_names: set[str] = set()
        seller_names: set[str] = set()
        chief_purchased = ""
        routine = 0

        for t in transactions:
            code = (t.get("transaction_code") or "").strip().upper()
            name = (t.get("name") or "").strip().upper()
            day = _parse_day(t.get("transaction_date")) or _parse_day(t.get("filing_date"))
            if code == OPEN_PURCHASE:
                purchaser_names.add(name)
                chief_purchased = chief_purchased or _chief(t.get("role"))
                if day:
                    purchases.append((day, name))
            elif code == OPEN_SALE:
                seller_names.add(name)
                if day:
                    sales.append((day, name))
            else:
                routine += 1

        filed = sorted((t.get("filing_date") or "")[:10] for t in transactions if t.get("filing_date"))
        return cls(
            ticker=ticker.upper(),
            total=len(transactions),
            purchasers=len(purchaser_names),
            sellers=len(seller_names),
            routine=routine,
            purchase_cluster=_clustered(purchases, CLUSTER_MIN_PURCHASERS),
            sale_cluster=_clustered(sales, CLUSTER_MIN_SELLERS),
            chief_purchased=chief_purchased,
            as_of=filed[-1] if filed else None,
            highlights=cls._pick_highlights(transactions),
        )

    @staticmethod
    def _pick_highlights(transactions: list[dict]) -> tuple[Highlight, ...]:
        """The biggest dealings by value, an open-market purchase first.

        Open-market dealings are the ones with a decision behind them, so the note names
        those. Only when there are none does it fall back to the biggest entry of any
        kind, so a ticker with nothing but grants still gets one concrete example.
        """
        def as_highlight(t: dict) -> Highlight:
            shares = t.get("shares")
            return Highlight(
                name=format_name(t.get("name") or "an insider"),
                role=(t.get("role") or "").strip(),
                code=(t.get("transaction_code") or "").strip().upper(),
                day=(t.get("transaction_date") or t.get("filing_date") or "")[:10] or None,
                value=float(t["value"]) if t.get("value") else None,
                shares=int(shares) if shares else None,
            )

        def size(t: dict) -> float:
            return float(t.get("value") or 0)

        def code(t: dict) -> str:
            return (t.get("transaction_code") or "").strip().upper()

        purchases = sorted((t for t in transactions if code(t) == OPEN_PURCHASE), key=size, reverse=True)
        open_market = sorted(
            (t for t in transactions if code(t) in (OPEN_PURCHASE, OPEN_SALE)), key=size, reverse=True
        )
        picked: list[dict] = purchases[:1]
        for t in open_market:
            if len(picked) >= MAX_HIGHLIGHTS:
                break
            if not any(t is p for p in picked):
                picked.append(t)
        if not picked and transactions:
            picked = [max(transactions, key=lambda t: (size(t), float(t.get("shares") or 0)))]
        return tuple(as_highlight(t) for t in picked)

    @property
    def has_evidence(self) -> bool:
        return self.total > 0

    @property
    def mostly_routine(self) -> bool:
        return self.total > 0 and self.routine * 2 >= self.total

    @property
    def main(self) -> Optional[Highlight]:
        return self.highlights[0] if self.highlights else None

    def numbers(self) -> set[float]:
        """Figures the note may quote: the highlights' amounts and dates, the price move,
        small counts, and the terms it explains ("10b5-1")."""
        allowed = {float(n) for n in range(0, 13)}
        allowed |= {float(self.total), float(self.purchasers), float(self.sellers), float(self.routine)}
        allowed |= {float(CLUSTER_WINDOW_DAYS)}
        days = [self.as_of] + [h.day for h in self.highlights]
        for h in self.highlights:
            allowed |= {float(n.replace(",", "")) for n in _NUMBER.findall(h.amount)}
        if self.price:
            allowed.add(float(abs(round(self.price.change_pct))))
            allowed.add(abs(round(self.price.change_pct, 1)))
            days += [self.price.since, self.price.as_of]
        for value in days:
            day = _parse_day(value)
            if day:
                allowed |= {float(day.year), float(day.month), float(day.day)}
        return allowed

    def facts(self) -> dict:
        """What the note was written from, stored beside it. Includes the price move."""
        facts = self._filing_facts()
        facts["price"] = dataclasses.asdict(self.price) if self.price else None
        return facts

    def _filing_facts(self) -> dict:
        return {
            "version": INSIDER_TRACE_VERSION,
            "total": self.total,
            "purchasers": self.purchasers,
            "sellers": self.sellers,
            "routine": self.routine,
            "purchase_cluster": self.purchase_cluster,
            "sale_cluster": self.sale_cluster,
            "chief_purchased": self.chief_purchased,
            "as_of": self.as_of,
            "highlights": [h.as_dict() for h in self.highlights],
        }

    def fingerprint(self) -> str:
        """The filings only: a price move alone never rewrites the note."""
        canonical = json.dumps(self._filing_facts(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ── the price move ───────────────────────────────────────────────────────────

class InsiderPriceMove:
    """The share price on the main dealing's day against the latest close.

    One yfinance request, made only when a note is about to be written. The change is a
    percentage, so it is the same in any currency and needs no conversion.
    """

    def __init__(self, data_source: Any = None, today: Any = None):
        self._data_source = data_source
        self._today = today or (lambda: datetime.datetime.now(datetime.timezone.utc).date())

    @property
    def data_source(self):
        if self._data_source is None:
            from src.agents.quant_analyst import MarketDataSource

            self._data_source = MarketDataSource()
        return self._data_source

    def since(self, ticker: str, day: Optional[str]) -> Optional[PriceMove]:
        start = _parse_day(day)
        if start is None:
            return None
        today = self._today()
        if (today - start).days < 1:
            return None
        try:
            frame = self.data_source.history_between(ticker, start, today + datetime.timedelta(days=1))
            closes = self._closes(frame)
        except Exception as e:
            logger.info("Insider price move lookup failed for %s: %s", ticker, e)
            return None
        if len(closes) < 2:
            return None
        (first_day, first), (last_day, last) = closes[0], closes[-1]
        if not first or last_day <= first_day:
            return None
        return PriceMove(change_pct=round((last / first - 1) * 100, 1), since=first_day, as_of=last_day)

    @staticmethod
    def _closes(frame) -> list[tuple[str, float]]:
        if frame is None or len(frame) == 0 or "Close" not in frame:
            return []
        close = frame["Close"]
        # yfinance returns a one-column frame for a single ticker; take the column.
        if hasattr(close, "columns"):
            close = close.iloc[:, 0]
        close = close.dropna()
        return [(str(idx)[:10], float(value)) for idx, value in close.items()]


# ── what it means ────────────────────────────────────────────────────────────

class InsiderMeaning:
    """What the dealings mean, in market language explained for a beginner. Shared by
    the prompt and the template, so both say the same things the same way."""

    CAVEAT = "Filings arrive after the trade, so the signal is late and noisy."

    def lines(self, evidence: InsiderEvidence) -> list[str]:
        labelled = [("The main dealing", self.dealing(evidence.main))]
        if len(evidence.highlights) > 1:
            labelled.append(("Also", self.dealing(evidence.highlights[1], short=True)))
        labelled += [
            ("The pattern", self.pattern(evidence)),
            ("Routine entries", self.routine(evidence)),
            ("The share price since", self.price(evidence)),
            ("The catch", self.CAVEAT),
        ]
        return [f"{label}: {text}" for label, text in labelled if text]

    @staticmethod
    def dealing(h: Optional[Highlight], short: bool = False) -> str:
        if h is None:
            return ""
        when = f" on {spell_date(h.day)}" if h.day else ""
        if h.is_purchase:
            # "Personal funds", not "their own money": the model turned "their" into "his".
            what = f"{h.who} bought {h.amount} of shares on the open market with personal funds{when}."
            if short:
                return what
            sized = " of this size" if (h.value or 0) >= LARGE_PURCHASE_USD else ""
            return f"{what} Markets often read a purchase{sized} as a vote of confidence."
        if h.is_sale:
            what = f"{h.who} sold {h.amount} of shares on the open market{when}."
            if short:
                return what
            return (
                f"{what} Sales are a weaker signal, often made for tax, diversification or under a"
                " 10b5-1 plan, a trading schedule set in advance."
            )
        action = ROUTINE_ACTIONS.get(h.code, "had shares change hands")
        worth = f" worth {h.amount}" if h.value else ""
        return (
            f"The largest entry was {h.who} who {action}{worth}{when}, which is compensation"
            " mechanics rather than a decision about the company."
        )

    @staticmethod
    def pattern(evidence: InsiderEvidence) -> str:
        if evidence.purchase_cluster:
            chief = f", including {evidence.chief_purchased}" if evidence.chief_purchased else ""
            return (
                f"Several insiders made purchases within weeks of each other{chief}, a cluster"
                " markets treat as stronger than one purchase."
            )
        if evidence.sale_cluster and evidence.purchasers == 0:
            return "Several insiders sold within weeks of each other and none made a purchase, though such sales are often pre-scheduled."
        if evidence.purchasers == 0 and evidence.main is not None and not evidence.main.is_purchase:
            return "No insider made an open-market purchase, the strongest kind of signal."
        return ""

    @staticmethod
    def routine(evidence: InsiderEvidence) -> str:
        main = evidence.main
        if not evidence.mostly_routine or (main and main.code not in (OPEN_PURCHASE, OPEN_SALE)):
            return ""
        return "Most other entries are grants or tax withholding, compensation mechanics rather than decisions."

    @staticmethod
    def price(evidence: InsiderEvidence) -> str:
        p, h = evidence.price, evidence.main
        if p is None or h is None:
            return ""
        size = abs(round(p.change_pct))
        if size == 0:
            move = "about the same as"
        else:
            move = f"{size} percent {'higher' if p.change_pct > 0 else 'lower'} than"
        kind = "purchase" if h.is_purchase else "sale" if h.is_sale else "dealing"
        return f"By {spell_date(p.as_of)} the share price was {move} on the day of the {kind}."


# ── prompt, template, guard ──────────────────────────────────────────────────

class InsiderTracePromptBuilder:
    """The Big investors prompt's shape and length, in market language."""

    def __init__(self, meaning: Optional[InsiderMeaning] = None):
        self.meaning = meaning or InsiderMeaning()

    def build(self, evidence: InsiderEvidence) -> str:
        meaning_block = "\n".join(f"- {line}" for line in self.meaning.lines(evidence))
        return f"""You are writing a short note for an investing app in South Africa about the insider dealings listed on the "Insider trading" tab for {evidence.ticker}. Insiders are the company's own executives, directors and large shareholders. Write in the language a market analyst would use, but explain each market term briefly the first time, because many readers are new to investing.

The facts and what they mean, already worked out for you:
{meaning_block}

Write four or five sentences, no more than 110 words in total, as one paragraph with no headings, no bullet points and no title.

Cover, in whatever order reads best:
- The named dealing or dealings: who, what kind, how much and when, and how the market usually reads that kind of dealing.
- The pattern and the routine entries, if given above, in one short sentence.
- The share price fact, if one is given, stated as a plain fact.
- The catch, in one short clause, as the last sentence.

Rules you must follow:
- Use the names, amounts and dates exactly as given above. Do not add any other numbers.
- Use ONLY what is given above. You know nothing else about {evidence.ticker} or its insiders. Refer to the company only as {evidence.ticker}.
- Keep each meaning exactly as given. Never call a signal strong, weak or unusual unless the meaning above says so.
- Never say or suggest that a dealing caused, drove or explains a move in the share price.
- You may say an insider bought or sold shares. Never tell the reader to buy, sell or hold anything.
- Refer to each insider by name or role, never as he, she, his or her.
- This is not financial advice. Never tell the reader what to do, judge whether the stock is worth owning, or say what the price will do next. Do not use the words should, must, expect, recommend, undervalued, overvalued, opportunity, outlook, bullish, bearish, cheap, expensive or good investment.
- Write British English in a clear, level voice, with no filler openers like "Overall".
- Never use a dash of any kind as punctuation. Use a comma, a full stop or a rewrite.
- Plain prose only, no markdown.

Write only the paragraph itself."""


class InsiderTraceTemplate:
    """The deterministic note, from the same meanings. Stands in when the model cannot
    be used."""

    def render(self, evidence: InsiderEvidence) -> str:
        meaning = InsiderMeaning()
        parts = [
            meaning.dealing(evidence.main),
            meaning.pattern(evidence),
            meaning.routine(evidence),
            meaning.price(evidence),
            meaning.CAVEAT,
        ]
        return " ".join(p for p in parts if p)


#: A dealing named as the cause of a price move. The cause is unknowable, so the note
#: may state the move and the dealing side by side but never join them.
_CAUSAL = re.compile(
    r"\b(because of|due to|caused|causing|drove|driven by|sent the (share )?price|on the back of|thanks to|explains? the)\b",
    re.IGNORECASE,
)
#: "$10.6 million" is a figure, not a spelled-out count, so the word after the digits is
#: dropped before the Big investors guard reads it.
_SCALE = re.compile(r"(\d)\s+(million|billion)\b", re.IGNORECASE)
#: Insiders buying and selling is the subject, so the words are allowed when they
#: describe insiders, and refused when they address the reader.
_DESCRIBES_INSIDERS = {"buy(s|ing)?", "sell(s|ing)?"}
_ADVICE = (
    re.compile(r"\b(you|investors|readers|one)\s+(could|might|may|can|would)\s+(buy|sell|hold)\b", re.IGNORECASE),
    re.compile(r"\btime to (buy|sell)\b", re.IGNORECASE),
    re.compile(r"\b(buy|sell)(ing)?\s+(the|this|these)\s+(stock|shares)\b", re.IGNORECASE),
    re.compile(r"\b(he|she|his|her|him)\b", re.IGNORECASE),
)


class InsiderTraceGuard(InstitutionalTraceGuard):
    """The Big investors guard, plus: no causal claims about the price, and amounts like
    "$10.6 million" read as the figure they are."""

    FORBIDDEN = tuple(
        p for p in FORBIDDEN_PATTERNS if not any(word in p.pattern for word in _DESCRIBES_INSIDERS)
    ) + _ADVICE
    REQUIRE_CLOSING = False

    def check(self, text: str, evidence) -> Optional[str]:
        causal = _CAUSAL.search(text)
        if causal:
            return f"claims a cause for the price move ('{causal.group(0)}')"
        return super().check(_SCALE.sub(r"\1", text), evidence)

    def guessed_style(self, text, evidence) -> Optional[str]:
        return None

    @staticmethod
    def without_names(text, evidence) -> str:
        """Insiders' names are data, not the model's words, and may contain anything."""
        for h in sorted(getattr(evidence, "highlights", ()), key=lambda h: len(h.name), reverse=True):
            text = re.sub(re.escape(h.name), "the insider", text, flags=re.IGNORECASE)
        return text


# ── generator, store, service ────────────────────────────────────────────────

class InsiderTraceGenerator(InstitutionalTraceGenerator):
    PURPOSE = "insider_trace"
    LABEL = "Insider trace"

    def __init__(self, config: Optional[WhaleConfig] = None, client=None, guard=None, builder=None):
        config = config or WhaleConfig.from_env()
        super().__init__(
            config,
            client=client,
            guard=guard or InsiderTraceGuard(config),
            builder=builder or InsiderTracePromptBuilder(),
        )


class InsiderTraceRepository(InstitutionalTraceRepository):
    """The same trace columns, on the insider cache row (migrations/029)."""

    TABLE = "insider_transactions_cache"


class InsiderTraceService(InstitutionalTraceService):
    """Serves a ticker's insider note, rewriting it only when new filings arrive."""

    def __init__(
        self,
        config: Optional[WhaleConfig] = None,
        repository=None,
        generator=None,
        template=None,
        now=None,
        prices: Optional[InsiderPriceMove] = None,
    ):
        config = config or WhaleConfig.from_env()
        super().__init__(
            config=config,
            repository=repository or InsiderTraceRepository(),
            generator=generator or InsiderTraceGenerator(config),
            template=template or InsiderTraceTemplate(),
            now=now,
        )
        self.prices = prices or InsiderPriceMove()

    @property
    def enabled(self) -> bool:
        return self.config.insider_trace_enabled

    def evidence_for(self, ticker: str, payload: dict) -> InsiderEvidence:
        return InsiderEvidence.from_payload(ticker, payload or {})

    def enrich(self, evidence: InsiderEvidence) -> InsiderEvidence:
        """The price move since the main open-market dealing, fetched only now."""
        main = evidence.main
        if main is None or main.code not in (OPEN_PURCHASE, OPEN_SALE):
            return evidence
        move = self.prices.since(evidence.ticker, main.day)
        return dataclasses.replace(evidence, price=move) if move else evidence
