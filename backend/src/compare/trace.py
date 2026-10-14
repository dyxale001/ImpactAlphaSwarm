"""The Compare page's written comparison: one paragraph over two or three stocks, for one reader.

The page lines every measure up in rows, and each row carries a note saying what its gap
means. This paragraph is the layer above the rows, written when the reader asks for it,
and it does two things in a beginner's register:

  * what separates the price windows: where they differ most and where they are alike;
  * why the reader's own latest analysis placed them where it did. That is the sponsor's
    question of 22/09 ("Google's RSI is 37 and Apple's is 66 ... But it says that Apple
    is a better buy. I wonder why"), and only a personal paragraph can answer it.

It never says which stock to pick, and never which one suits the reader (D-081, D-082).

It is built from the Quant tab's own parts, deliberately:

  * the same windows (``QuantHistoryService``), so the paragraph and the chart under it
    read the same closes;
  * the same run measurements (``QuantTraceRepository.latest_run_metrics``): RSI, beta,
    Sharpe and volatility;
  * the same guard, made stricter. Every number must be in the facts, the advice list
    still applies, and on top of it the words that would turn a comparison into a
    verdict (better, worse, winner, prefer, outperform) or a suitability call (suits
    you, right for you) fail it, as does a paragraph that leaves a stock out.

Personal, so it is stored per reader, and on demand, so a model is called only when the
reader presses the button. A stored paragraph is served again only while it still
describes what the page shows: the same most recent close for every stock, and the same
run. When either moves on, the page offers the button again instead of an old answer.
"""

from __future__ import annotations

import datetime
import logging
import re
import threading
import math
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

from src.quant.history import HORIZONS, QuantHistoryService, utc_today
from src.quant.trace import (
	BETA_BAND_PHRASES,
	FORBIDDEN_PATTERNS,
	HORIZON_LABELS,
	QuantEvidence,
	QuantTracePromptBuilder,
	QuantTraceRepository,
	TraceGuard,
	_trim,
)
from src.utils.gr_reasoningtracestyle import HOUSE_STYLE
from src.utils.llm_client import GroqClient

from .config import CompareConfig

logger = logging.getLogger("compare")

RETENTION_DAYS = 30

#: The words that make a comparison a verdict. A description of two price windows has no
#: use for any of them: "rose more" is a fact, "did better" is a judgement. Checked as
#: word-bounded patterns on top of the quant trace's advice list; a match rejects.
COMPARATIVE_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
	re.compile(p, re.IGNORECASE)
	for p in (
		r"\bbetter\b",
		r"\bworse\b",
		r"\bbest\b",
		r"\bworst\b",
		r"\bwinners?\b",
		r"\blosers?\b",
		# Not "preference": the reader's own risk preference is a reason the run gives.
		r"\bprefer(s|red|ring|able|ably)?\b",
		r"\bpick(s|ed)?\b",
		r"\bsuperior\b",
		r"\binferior\b",
		r"\b(out|under)perform\w*\b",
		r"\bbeat(s|ing)?\b",
		r"\bsafer\b",
		r"\bsafest\b",
		r"\briskier\b",
		r"\briskiest\b",
		r"\b(stronger|weaker) (investment|choice|stock|option|bet)\b",
		r"\bthe one to\b",
		r"\bedge over\b",
		r"\bclear leader\b",
		r"\bfavou?r(ed|able)? over\b",
	)
)

#: The words that would turn an explanation of the reader's own run into a suitability
#: call (D-081, D-082). Why the run placed a stock where it did may be explained; whether
#: the stock fits the reader may not be said.
SUITABILITY_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
	re.compile(p, re.IGNORECASE)
	for p in (
		r"\bsuit(s|ed|able|ability)?\b",
		r"\bright for you\b",
		r"\b(good|right|natural|strong|poor|close) (fit|match)\b",
		r"\bfits? (you|your)\b",
		r"\b(matches|aligns with) your\b",
		r"\bfor (someone|people|investors?) like you\b",
		r"\byou (could|might|may|can) (want|consider|look|choose|go)\b",
		r"\bconsider (adding|buying|holding|switching|owning)\b",
		r"\bideal\b",
		r"\bappropriate\b",
		r"\bin your (interest|favour)\b",
	)
)

_TICKER = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,9}$")


def normalise_tickers(tickers: Iterable[str]) -> list[str]:
	"""Upper-cased, de-duplicated, in the order asked for. Junk is dropped, not raised."""
	out: list[str] = []
	for raw in tickers:
		sym = (raw or "").strip().upper()
		if sym and _TICKER.match(sym) and sym not in out:
			out.append(sym)
	return out


def set_key(tickers: Iterable[str]) -> str:
	"""The cache key for a set: sorted, so the order a reader picked them in is not a key."""
	return "|".join(sorted(normalise_tickers(tickers)))


def _join(parts: list[str]) -> str:
	"""'a', 'a and b', 'a, b and c'."""
	if len(parts) <= 1:
		return "".join(parts)
	return ", ".join(parts[:-1]) + " and " + parts[-1]


def ordinal(n: int) -> str:
	"""3 -> '3rd', 11 -> '11th'."""
	suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
	return f"{n}{suffix}"


# ── the reader's run ─────────────────────────────────────────────────────────
# Kept in step with the frontend, so this paragraph and the template under the table
# never describe the same reading two ways: LEAN_NEUTRAL_BAND, PROFILE_FIT_PENALTY and
# THIN_EVIDENCE in utils/compareStocks.ts, CONVERGENCE_HEADLINE in data/signalCopy.ts,
# SUB_DIMENSION_QUALITY and percentileReading in data/quantExplainers.ts.

LEAN_NEUTRAL_BAND = 0.15
PROFILE_FIT_PENALTY = 0.95
THIN_EVIDENCE = 0.7

CONVERGENCE_PHRASES: dict[str, str] = {
	"agree_strongly": "its signals agree strongly",
	"lean_together": "its signals lean the same way",
	"mixed": "its signals only partly agree",
	"conflict": "its signals conflict",
}

#: (column, plain name, high reading, low reading)
SUB_DIMENSIONS: tuple[tuple[str, str, str, str], ...] = (
	("momentum_pctile", "momentum", "a stronger trend", "a weaker trend"),
	(
		"risk_adj_pctile",
		"risk-adjusted return",
		"more return per unit of turbulence",
		"less return per unit of turbulence",
	),
	("stability_pctile", "stability", "a steadier price", "a jumpier price"),
)


def lean_phrase(lean: float | None) -> str:
	if lean is None:
		return "had no reading"
	if lean >= LEAN_NEUTRAL_BAND:
		return "leaned favourable"
	if lean <= -LEAN_NEUTRAL_BAND:
		return "leaned unfavourable"
	return "were close to neutral"


def _tenths(pctile: float) -> int:
	# Half up, as Math.round does on the page; Python's round() would go to even.
	return int(math.floor(pctile / 10 + 0.5))


def percentile_phrase(high: str, low: str, pctile: float) -> str:
	tenths = _tenths(pctile)
	if tenths >= 9:
		return f"{high} than nearly every other stock in the run"
	if tenths <= 1:
		return f"{low} than nearly every other stock in the run"
	if 4 <= tenths <= 6:
		return "about the middle of the run's stocks"
	if tenths >= 7:
		return f"{high} than about {tenths} in 10 stocks in the run"
	return f"{low} than about {10 - tenths} in 10 stocks in the run"


@dataclass(frozen=True)
class RunPlacing:
	"""One stock's row in the reader's latest run. Relative to that run, so personal."""

	ticker: str
	rank: int | None
	convergence_state: str | None = None
	quant_lean: float | None = None
	sent_lean: float | None = None
	profile_fit: float | None = None
	data_sufficiency: float | None = None
	momentum_pctile: float | None = None
	risk_adj_pctile: float | None = None
	stability_pctile: float | None = None

	def percentiles(self) -> list[tuple[str, str]]:
		"""(plain name, reading) for each sub-dimension the run measured."""
		out = []
		for column, name, high, low in SUB_DIMENSIONS:
			value = getattr(self, column)
			if value is not None:
				out.append((name, percentile_phrase(high, low, float(value))))
		return out


@dataclass(frozen=True)
class UserRun:
	"""The reader's latest completed run, narrowed to the stocks being compared."""

	run_id: str
	created_at: str | None
	#: How many stocks the run placed, for "3rd of 40".
	size: int | None
	placings: dict[str, RunPlacing] = field(default_factory=dict)

	def placed(self, tickers: Iterable[str]) -> list[RunPlacing]:
		"""The compared stocks the run placed, in the order the reader picked them."""
		out = []
		for t in tickers:
			p = self.placings.get(t)
			if p is not None and p.rank is not None:
				out.append(p)
		return out


# ── evidence ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ComparisonEvidence:
	"""Two or three windows over the same horizon, in the order the reader picked them.

	Each stock is a ``QuantEvidence`` exactly as the Quant tab would build it, so the
	allowed numbers, the fingerprint and the prompt blocks are the quant trace's own.
	"""

	horizon: str
	day: str
	stocks: tuple[QuantEvidence, ...]
	#: The reader's own run, or None when they have none (or it could not be read).
	yours: UserRun | None = None

	@property
	def tickers(self) -> list[str]:
		return [s.ticker for s in self.stocks]

	@property
	def key(self) -> str:
		return set_key(self.tickers)

	@property
	def horizon_label(self) -> str:
		return HORIZON_LABELS.get(self.horizon, self.horizon.lower())

	@property
	def has_evidence(self) -> bool:
		return len(self.stocks) >= 2 and all(s.has_evidence for s in self.stocks)

	@property
	def windows_key(self) -> str:
		"""Each stock's most recent close date, sorted: 'AAPL:2026-10-06|GOOGL:2026-10-06'.

		What a stored paragraph is checked against. When a new close lands for any stock,
		this changes and the stored paragraph no longer describes the page.
		"""
		return windows_key({s.ticker: s.facts.get("end") for s in self.stocks})

	def numbers(self) -> set[float]:
		"""Every figure any of the stocks may be quoted with. Read by TraceGuard."""
		allowed: set[float] = set()
		for stock in self.stocks:
			allowed |= stock.numbers()
		# "both", "all three": the count of stocks is a definition, not a fact.
		allowed.update({2.0, 3.0})
		if self.yours:
			if self.yours.size:
				allowed.add(float(self.yours.size))
			for p in self.yours.placed(self.tickers):
				allowed.add(float(p.rank))  # type: ignore[arg-type]
				for column, *_ in SUB_DIMENSIONS:
					value = getattr(p, column)
					if value is not None:
						# "about 8 in 10 stocks": the count the reading is given in.
						tenths = _tenths(float(value))
						allowed.update({10.0, float(tenths), float(10 - tenths)})
		return allowed

	def fingerprint(self) -> dict[str, Any]:
		return {
			"tickers": self.tickers,
			"stocks": {s.ticker: s.fingerprint() for s in self.stocks},
			"yours": (
				{
					"run_id": self.yours.run_id,
					"size": self.yours.size,
					"placings": {t: asdict(p) for t, p in self.yours.placings.items()},
				}
				if self.yours
				else None
			),
		}


def windows_key(ends: dict[str, Any]) -> str:
	return "|".join(f"{t}:{ends[t] or ''}" for t in sorted(ends))


# ── the guard ────────────────────────────────────────────────────────────────

class ComparisonGuard:
	"""The quant trace's guard, plus the rules that keep a comparison from ranking the
	stocks or telling the reader which one suits them."""

	def __init__(self, config: CompareConfig | None = None):
		self.config = config or CompareConfig.from_env()
		# Only its number grounding is used; the length limits are this page's own.
		self._numbers = TraceGuard()

	def check(self, text: str, evidence: ComparisonEvidence) -> str | None:
		"""The reason a paragraph fails, or None when it passes."""
		if len(text) < self.config.trace_min_chars:
			return f"too short to be a paragraph ({len(text)} chars)"
		if len(text) > self.config.trace_max_chars:
			return f"over the {self.config.trace_max_chars} char limit ({len(text)} chars)"
		for pattern in FORBIDDEN_PATTERNS + COMPARATIVE_PATTERNS + SUITABILITY_PATTERNS:
			hit = pattern.search(text)
			if hit:
				return f"uses forbidden term '{hit.group(0)}'"
		missing = [t for t in evidence.tickers if not re.search(rf"(?<![\w.]){re.escape(t)}(?![\w])", text)]
		if missing:
			return f"leaves out {', '.join(missing)}"
		stray = self._numbers.ungrounded_numbers(text, evidence)  # type: ignore[arg-type]
		if stray:
			return f"quotes numbers not in the facts: {', '.join(stray)}"
		return None


# ── the prompt ───────────────────────────────────────────────────────────────

class ComparisonPromptBuilder:
	"""Turns two or three windows, and the reader's run, into the prompt. Pure, no I/O."""

	def build(self, evidence: ComparisonEvidence) -> str:
		names = _join(evidence.tickers)
		blocks = []
		for stock in evidence.stocks:
			unit = stock.currency or "its listing currency"
			blocks.append(
				f"=== {stock.ticker} ===\n"
				+ QuantTracePromptBuilder._window_block(stock, unit)
				+ "\n"
				+ QuantTracePromptBuilder._run_block(stock)
			)
		facts = "\n\n".join(blocks)
		yours = self._yours_block(evidence)
		personal = bool(evidence.yours and evidence.yours.placed(evidence.tickers))

		if personal:
			length = "Write five to seven short sentences, no more than 150 words in total"
			cover_yours = """- Then, in two or three sentences, why the reader's own analysis placed them where it did. Give each stock's place, then only the one or two listed reasons that separate their places most. Do not read out every reading. Speak to the reader as "your analysis".
- If a stock with the larger rise or the higher RSI was placed lower, say why that can happen: RSI is not used to place stocks, and the order reads the price measurements and the news and social tone together.
- If a stock was not in the run, say so once and say nothing else about the run for it."""
			rules_yours = """- The places are the order the reader's analysis put the stocks in, from their own answers and that run's readings. They are not a judgement of the stocks. Write "placed 3rd" or "placed higher", never that a place makes a stock better or stronger.
- Never say or imply that a stock suits, fits or is right for the reader, or link a stock to the reader's goals, age or situation. The risk preference may be mentioned only as the listed reason that moved a stock down. Do not use the words suit, suitable, fit, ideal or appropriate.
- Give the readings against the run in the words listed, for example "a steadier price than about 8 in 10 stocks in the run". Do not turn them into percentiles or scores."""
		else:
			length = "Write three to five short sentences, no more than 110 words in total"
			cover_yours = ""
			rules_yours = "- Say nothing about places, ranks or an analysis run: there is none to explain."

		return f"""You are writing one short paragraph for a retail investing app that places {names} side by side for one reader. It describes how their share prices behaved over {evidence.horizon_label}{" and why the reader's own analysis placed them where it did" if personal else ""}. The reader is a beginner who is looking at a table of these same figures and wants to know what the differences mean.

{facts}

{yours}

{length}, as one paragraph with no headings, no bullet points and no title.

Cover, in this order:
- First, in two or three sentences, where the price windows differ most: pick the two or three figures with the widest gaps among the change over the window, the largest fall from a peak to a later low, how jumpy the daily moves were and the latest RSI. Do not list every figure for every stock.
- Something in common only if it is really shared: two equal figures, or two stocks in the same named band (for example both in the 'market' beta band). Never call two different numbers the same or similar.
- For RSI, say in a few plain words what it measures (how fast and how far the price has moved recently, on a 0 to 100 scale, where above 70 is conventionally called overbought and below 30 oversold), and that these are descriptions of the move, not signals.
- If beta is given, say what it means (how much the price tends to move when the wider market moves).
{cover_yours}

Rules you must follow:
- Name every one of {names} at least once, by ticker.
- Use ONLY the figures listed above. Do not work out new numbers: no differences between them, no ratios, no averages. You know nothing else about these companies: not their businesses, their earnings, their sectors or the news.
- Compare percentages, RSI, beta and volatility. Do not compare share prices with each other: a higher share price is not a bigger or a more valuable company.
- Never say or imply that one stock is better, worse, safer, riskier, stronger or preferable, or that one did better than another. Say what each figure is and what it describes. Do not use the words better, worse, best, worst, winner, pick, prefer, outperform, beat, safer or riskier.
{rules_yours}
- Never say or imply what any price will do next, and never tell the reader to buy, sell, hold, wait or avoid. Do not use the words buy, sell, hold, should, consider, undervalued, overvalued, opportunity, outlook, potential, bullish or bearish.
- Keep every sentence under 30 words. Do not join sentences with semicolons.
- Write British English, in a plain, level voice. No filler openers like "Overall" or "In summary".
- Never use a dash of any kind as punctuation. Use a comma, a full stop or a rewrite.
- Plain prose only. No markdown, no quotation marks around the whole paragraph.

Write only the paragraph itself."""

	@staticmethod
	def _yours_block(evidence: ComparisonEvidence) -> str:
		yours = evidence.yours
		if yours is None:
			return "=== The reader's own latest analysis ===\nThe reader has no completed analysis run."
		lines = [
			"=== The reader's own latest analysis ===",
			"Their analysis placed every stock it covered in one order"
			+ (f", {yours.size} stocks in all" if yours.size else "")
			+ ". A place is relative to the other stocks in that run and to the risk preference the reader set; it is not a judgement of the stock.",
			"How the order is decided: a stock is placed higher when its price measurements and its news and social tone point the same way. A stock whose price moved around more than the reader's risk preference is moved down. A thinner reading, with fewer articles, posts or days of prices, is placed lower on purpose. RSI is not used to place stocks.",
		]
		for t in evidence.tickers:
			p = yours.placings.get(t)
			if p is None or p.rank is None:
				lines.append(f"- {t}: not in this run.")
				continue
			parts = [f"placed {ordinal(p.rank)}"]
			if p.convergence_state in CONVERGENCE_PHRASES:
				parts.append(
					f"its price measurements {lean_phrase(p.quant_lean)} and its news and social tone"
					f" {lean_phrase(p.sent_lean)}, so {CONVERGENCE_PHRASES[p.convergence_state]}"
				)
			for name, reading in p.percentiles():
				parts.append(f"{name}: {reading}")
			if p.profile_fit is not None and p.profile_fit < PROFILE_FIT_PENALTY:
				parts.append("its price moved around more than the risk preference the reader set, which moved it down")
			if p.data_sufficiency is not None and p.data_sufficiency < THIN_EVIDENCE:
				parts.append("there was less to go on for it, which placed it lower on purpose")
			lines.append(f"- {t}: " + "; ".join(parts) + ".")
		return "\n".join(lines)


# ── the template ─────────────────────────────────────────────────────────────

class ComparisonTemplate:
	"""The deterministic paragraph from the same facts. What the reader gets when the model
	cannot be used, and the proof that a comparison can be written without a verdict."""

	def render(self, evidence: ComparisonEvidence) -> str:
		stocks = evidence.stocks
		sentences: list[str] = []

		moves = []
		for s in stocks:
			change = s.facts.get("change_pct")
			if change is None:
				moves.append(f"{s.ticker} has no measurable change")
			elif change > 0:
				moves.append(f"{s.ticker} rose {_trim(abs(change), 1)} percent")
			elif change < 0:
				moves.append(f"{s.ticker} fell {_trim(abs(change), 1)} percent")
			else:
				moves.append(f"{s.ticker} ended flat")
		sentences.append(f"Over {evidence.horizon_label}, {_join(moves)}.")

		falls = [f"{_trim(abs(s.facts.get('max_drawdown_pct') or 0), 1)} percent for {s.ticker}" for s in stocks]
		sentences.append(f"The largest fall from a peak to a later low was {_join(falls)}.")

		if all(s.facts.get("volatility_pct") is not None for s in stocks):
			vols = [f"{_trim(s.facts.get('volatility_pct'), 1)} percent for {s.ticker}" for s in stocks]
			sentences.append(
				f"Their daily moves, annualised, came to {_join(vols)}; a higher figure means a jumpier price."
			)

		if all(s.facts.get("latest_rsi") is not None for s in stocks):
			rsis = [f"{_trim(s.facts.get('latest_rsi'), 0)} for {s.ticker}" for s in stocks]
			sentences.append(
				"RSI, which summarises how fast and how far a price has moved recently on a 0 to 100 scale,"
				f" reads {_join(rsis)} at the most recent close; above 70 is conventionally called overbought"
				" and below 30 oversold, as descriptions of the move rather than signals."
			)

		with_beta = [s for s in stocks if s.run.get("beta") is not None]
		if with_beta:
			phrases = [BETA_BAND_PHRASES.get(s.run.get("beta_band")) for s in with_beta]
			shared = phrases[0] if len(with_beta) > 1 and phrases[0] and len(set(phrases)) == 1 else None
			if shared:
				# One band for all of them: said once, after the figures.
				betas = [f"{_trim(s.run.get('beta'))} for {s.ticker}" for s in with_beta]
				both = "both" if len(with_beta) == 2 else "all three"
				tail = f", so {both} {shared.replace('tends', 'tend').replace('moves', 'move')}"
			else:
				betas = [
					f"{_trim(s.run.get('beta'))} for {s.ticker}" + (f" ({p})" if p else "")
					for s, p in zip(with_beta, phrases)
				]
				tail = ""
			sentences.append(
				"In the most recent analysis runs, beta, which is how much a price tends to move when"
				f" the wider market moves, was {_join(betas)}{tail}."
			)

		sentences.append("These figures describe past price movement only.")
		sentences.extend(self._placement(evidence))
		return " ".join(sentences)

	@staticmethod
	def _placement(evidence: ComparisonEvidence) -> list[str]:
		"""Why the reader's run placed them where it did. The same reading as
		explainPlacement in frontend/src/utils/compareStocks.ts, said the same way."""
		yours = evidence.yours
		if yours is None:
			return []
		placed = yours.placed(evidence.tickers)
		absent = [t for t in evidence.tickers if t not in {p.ticker for p in placed}]
		if not placed:
			return [f"Your latest analysis did not include {_join(evidence.tickers)}, so it has no places to explain."]

		out = [
			f"Your latest analysis placed {_join([f'{p.ticker} {ordinal(p.rank)}' for p in placed])}"  # type: ignore[arg-type]
			+ (f" of {yours.size} stocks" if yours.size else "")
			+ "."
		]
		if absent:
			out.append(f"{_join(absent)} {'was' if len(absent) == 1 else 'were'} not in that run.")
		if len(placed) < 2:
			return out

		scored = [p for p in placed if p.convergence_state in CONVERGENCE_PHRASES]
		if len(scored) >= 2:
			out.append(
				"It reads two things for each stock, its price measurements and its news and social tone,"
				" and places a stock higher when the two point the same way."
			)
			for p in scored:
				out.append(
					f"For {p.ticker}, the price measurements {lean_phrase(p.quant_lean)} and the tone"
					f" {lean_phrase(p.sent_lean)}, so {CONVERGENCE_PHRASES[p.convergence_state]}."  # type: ignore[index]
				)
			penalised = [p.ticker for p in scored if p.profile_fit is not None and p.profile_fit < PROFILE_FIT_PENALTY]
			if penalised and len(penalised) < len(scored):
				out.append(
					f"{_join(penalised)} moved around more than the risk preference you set, which moves a stock"
					" down; this reflects your own answers, not a view on the stock."
				)
			thin = [p.ticker for p in scored if p.data_sufficiency is not None and p.data_sufficiency < THIN_EVIDENCE]
			if thin and len(thin) < len(scored):
				out.append(
					f"There was less to go on for {_join(thin)}, fewer articles, posts or days of prices,"
					" and a thinner reading is placed lower on purpose."
				)
		out.append(
			"RSI is not used to place stocks at all, because a high or a low reading is neither good nor bad"
			" in itself, which is how a stock with the higher RSI can be placed lower. None of this says which"
			" one to choose."
		)
		return out


# ── the generator ────────────────────────────────────────────────────────────

class ComparisonGenerator:
	"""Asks the model for one paragraph, and refuses anything the facts do not support."""

	#: A lane of its own: nothing on main reads key 7, and the comparison is generated
	#: while somebody is reading the page, so it should not queue behind the run's traces.
	KEY_ENV = "GROQ_API_KEY7"
	FALLBACK_KEY_ENV = "GROQ_API_KEY4"

	MAX_TOKENS = 1400
	TEMPERATURE = 0.2
	RETRIES = 2
	BACKOFF_SECONDS = (1.0, 2.0)

	def __init__(
		self,
		config: CompareConfig | None = None,
		client: Any | None = None,
		guard: ComparisonGuard | None = None,
		builder: ComparisonPromptBuilder | None = None,
	):
		self.config = config or CompareConfig.from_env()
		self.builder = builder or ComparisonPromptBuilder()
		self.guard = guard or ComparisonGuard(self.config)
		self._client = client
		self._client_built = client is not None

	@property
	def client(self):
		if not self._client_built:
			self._client_built = True
			self._client = GroqClient.create(
				purpose="comparison_trace",
				max_tokens=self.MAX_TOKENS,
				temperature=self.TEMPERATURE,
				key_env=self.KEY_ENV,
				fallback_key_env=self.FALLBACK_KEY_ENV,
			)
		return self._client

	@property
	def model(self) -> str | None:
		client = self.client
		return client.model if client else None

	def generate(self, evidence: ComparisonEvidence) -> str | None:
		"""One paragraph that passed the guard, or None. Never raises."""
		client = self.client
		if client is None:
			logger.info("Comparison trace skipped for %s: Groq unconfigured", evidence.key)
			return None
		if not evidence.has_evidence:
			return None

		prompt = self.builder.build(evidence)
		text = self._complete(client, prompt, evidence)
		if text is None:
			return None

		paragraph = HOUSE_STYLE.apply(text)
		reason = self.guard.check(paragraph, evidence)
		if reason:
			logger.info("Comparison trace for %s %s rejected: %s", evidence.key, evidence.horizon, reason)
			return None
		return paragraph

	def _complete(self, client, prompt: str, evidence: ComparisonEvidence) -> str | None:
		for attempt in range(self.RETRIES + 1):
			try:
				return client.complete(prompt)
			except Exception as e:
				if attempt >= self.RETRIES:
					logger.warning(
						"Comparison trace failed for %s %s after %d attempts: %s",
						evidence.key,
						evidence.horizon,
						attempt + 1,
						e,
					)
					return None
				time.sleep(self.BACKOFF_SECONDS[min(attempt, len(self.BACKOFF_SECONDS) - 1)])
		return None


# ── the store ────────────────────────────────────────────────────────────────

class ComparisonTraceRepository:
	"""Where the paragraphs live: one row per reader, set and horizon, the latest only."""

	TABLE = "comparison_traces"
	READ_COLUMNS = "set_key, horizon, trace, source, model, windows, run_id, run_at, generated_at"

	def __init__(self, client: Any | None = None):
		self._client_override = client

	def _client(self):
		# Imported on call, for the same reason as the quant store: supabase_client raises
		# at import when its env vars are missing, and that must degrade, not crash.
		if self._client_override is not None:
			return self._client_override
		from src.utils.supabase_client import supabase

		return supabase

	def read(self, user_id: str, key: str, horizon: str) -> dict[str, Any] | None:
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select(self.READ_COLUMNS)
				.eq("user_id", user_id)
				.eq("set_key", key)
				.eq("horizon", horizon.upper())
				.limit(1)
				.execute()
			)
			rows = res.data or []
			return rows[0] if rows else None
		except Exception as e:
			logger.info("Comparison trace read failed for %s %s: %s", key, horizon, e)
			return None

	def save(self, row: dict[str, Any]) -> bool:
		"""Replaces the reader's previous paragraph for this set and horizon."""
		try:
			self._client().table(self.TABLE).upsert(row, on_conflict="user_id,set_key,horizon").execute()
			return True
		except Exception as e:
			logger.warning("Comparison trace write failed for %s: %s", row.get("set_key"), e)
			return False

	def prune(self, before: datetime.datetime) -> None:
		try:
			self._client().table(self.TABLE).delete().lt("generated_at", before.isoformat()).execute()
		except Exception as e:
			logger.info("Comparison trace prune failed: %s", e)


class UserRunReader:
	"""The reader's latest completed run, for the stocks being compared.

	Read with the service key, which row-level security does not bind, so every query
	is filtered by the user id the route took from the reader's token, never by anything
	the request names.
	"""

	PLACING_COLUMNS = (
		"asset_id, rank, convergence_state, quant_lean, sent_lean, profile_fit, data_sufficiency, "
		"momentum_pctile, risk_adj_pctile, stability_pctile"
	)
	#: A database without the unified-ranking columns (migration 012) still has these.
	BASE_COLUMNS = "asset_id, rank, momentum_pctile, risk_adj_pctile, stability_pctile"

	def __init__(self, client: Any | None = None):
		self._client_override = client

	def _client(self):
		if self._client_override is not None:
			return self._client_override
		from src.utils.supabase_client import supabase

		return supabase

	def latest_run(self, user_id: str) -> dict[str, Any] | None:
		"""{id, created_at} of the reader's latest completed run, or None."""
		rows = (
			self._client()
			.table("ai_runs")
			.select("id, created_at")
			.eq("user_id", user_id)
			.eq("status", "complete")
			.order("created_at", desc=True)
			.limit(1)
			.execute()
			.data
			or []
		)
		return rows[0] if rows else None

	def latest(self, user_id: str, tickers: list[str]) -> UserRun | None:
		run = self.latest_run(user_id)
		if not run:
			return None
		client = self._client()
		run_id = str(run["id"])

		assets = client.table("assets").select("id, ticker").in_("ticker", tickers).execute().data or []
		ticker_by_id = {str(a["id"]): str(a["ticker"]).upper() for a in assets if a.get("id")}

		rows: list[dict[str, Any]] = []
		if ticker_by_id:
			ids = list(ticker_by_id)
			try:
				rows = (
					client.table("ai_recommendation")
					.select(self.PLACING_COLUMNS)
					.eq("run_id", run_id)
					.in_("asset_id", ids)
					.execute()
					.data
					or []
				)
			except Exception:
				rows = (
					client.table("ai_recommendation")
					.select(self.BASE_COLUMNS)
					.eq("run_id", run_id)
					.in_("asset_id", ids)
					.execute()
					.data
					or []
				)

		size_res = client.table("ai_recommendation").select("id", count="exact").eq("run_id", run_id).limit(1).execute()
		size = getattr(size_res, "count", None)

		placings: dict[str, RunPlacing] = {}
		for r in rows:
			ticker = ticker_by_id.get(str(r.get("asset_id")))
			if not ticker:
				continue
			placings[ticker] = RunPlacing(
				ticker=ticker,
				rank=_int(r.get("rank")),
				convergence_state=r.get("convergence_state"),
				quant_lean=_float(r.get("quant_lean")),
				sent_lean=_float(r.get("sent_lean")),
				profile_fit=_float(r.get("profile_fit")),
				data_sufficiency=_float(r.get("data_sufficiency")),
				momentum_pctile=_float(r.get("momentum_pctile")),
				risk_adj_pctile=_float(r.get("risk_adj_pctile")),
				stability_pctile=_float(r.get("stability_pctile")),
			)
		return UserRun(run_id=run_id, created_at=run.get("created_at"), size=size or None, placings=placings)


def _float(value: Any) -> float | None:
	try:
		return None if value is None or value == "" else float(value)
	except (TypeError, ValueError):
		return None


def _int(value: Any) -> int | None:
	f = _float(value)
	return None if f is None else int(f)


# ── the service ──────────────────────────────────────────────────────────────

class ComparisonTraceService:
	"""Writes a reader's comparison when they ask for it, and serves it back while it is current."""

	def __init__(
		self,
		config: CompareConfig | None = None,
		history: QuantHistoryService | None = None,
		repository: ComparisonTraceRepository | None = None,
		runs: UserRunReader | None = None,
		run_metrics: Any | None = None,
		generator: ComparisonGenerator | None = None,
		template: ComparisonTemplate | None = None,
		today: Any = None,
		now: Any = None,
	):
		self.config = config or CompareConfig.from_env()
		self.history = history or QuantHistoryService()
		self.repository = repository or ComparisonTraceRepository()
		self.runs = runs or UserRunReader()
		#: Anything with ``latest_run_metrics(ticker)``: the quant trace's own store.
		self.run_metrics = run_metrics or QuantTraceRepository()
		self.generator = generator or ComparisonGenerator(self.config)
		self.template = template or ComparisonTemplate()
		self._today = today or utc_today
		self._now = now or (lambda: datetime.datetime.now(datetime.timezone.utc))
		self._pruned = False
		# One lock per reader, set and horizon in flight, so a double click pays once.
		self._locks: dict[tuple[str, str, str], threading.Lock] = {}
		self._locks_guard = threading.Lock()
		# Model calls per reader today. In memory, so per instance: a ceiling on a runaway
		# loop of clicks, not an exact quota. Past it the reader gets the template.
		self._calls: dict[str, int] = {}
		self._calls_day: str | None = None

	@property
	def enabled(self) -> bool:
		"""The trace flag, and the windows it is written from."""
		return self.config.trace_enabled and self.history.enabled

	# ── reading back ─────────────────────────────────────────────────────────

	def saved(self, user_id: str, tickers: Iterable[str], horizon: str) -> dict[str, Any] | None:
		"""The reader's stored paragraph if it still describes the page, else None. Never
		writes and never calls a model, so the page can ask on every visit."""
		if not self.enabled:
			return None
		try:
			symbols = self._valid(tickers, horizon)
			if symbols is None:
				return None
			return self._current(user_id, symbols, horizon.upper())
		except Exception as e:
			logger.warning("Comparison trace lookup failed for %s %s: %s", list(tickers), horizon, e)
			return None

	def _current(self, user_id: str, symbols: list[str], horizon: str) -> dict[str, Any] | None:
		stored = self.repository.read(user_id, set_key(symbols), horizon)
		if not stored:
			return None
		ends = {}
		for sym in symbols:
			window = self.history.window(sym, horizon)
			facts = window.get("facts") if window else None
			if not facts:
				return None
			ends[sym] = facts.get("end")
		if stored.get("windows") != windows_key(ends):
			return None
		run = self._latest_run(user_id)
		if (str(run["id"]) if run else None) != (str(stored["run_id"]) if stored.get("run_id") else None):
			return None
		return self._point(stored)

	def _latest_run(self, user_id: str) -> dict[str, Any] | None:
		try:
			return self.runs.latest_run(user_id)
		except Exception as e:
			logger.info("Latest run read failed: %s", e)
			return None

	# ── writing ──────────────────────────────────────────────────────────────

	def explain(self, user_id: str, tickers: Iterable[str], horizon: str) -> dict[str, Any] | None:
		"""The reader's paragraph, written now unless a current one is stored. Never raises.

		None for every quiet reason at once: off, too few stocks, a window with nothing in
		it, or no usable paragraph. The panel renders one fallback for all of them.
		"""
		if not self.enabled:
			return None
		try:
			symbols = self._valid(tickers, horizon)
			if symbols is None:
				return None
			key = horizon.upper()
			lock_key = (user_id, set_key(symbols), key)
			try:
				with self._lock_for(lock_key):
					current = self._current(user_id, symbols, key)
					if current:
						return current
					return self._generate(user_id, symbols, key)
			finally:
				with self._locks_guard:
					self._locks.pop(lock_key, None)
		except Exception as e:
			logger.warning("Comparison trace failed for %s %s: %s", list(tickers), horizon, e)
			return None

	def _valid(self, tickers: Iterable[str], horizon: str) -> list[str] | None:
		if (horizon or "").upper() not in HORIZONS:
			return None
		symbols = normalise_tickers(tickers)
		if not self.config.min_tickers <= len(symbols) <= self.config.max_tickers:
			return None
		return symbols

	def _generate(self, user_id: str, tickers: list[str], horizon: str) -> dict[str, Any] | None:
		day = self._today().isoformat()
		stocks: list[QuantEvidence] = []
		for sym in tickers:
			window = self.history.window(sym, horizon)
			facts = window.get("facts") if window else None
			if not facts:
				logger.info("Comparison trace for %s skipped: no window for %s", set_key(tickers), sym)
				return None
			stocks.append(
				QuantEvidence(
					ticker=sym,
					horizon=horizon,
					day=day,
					currency=window.get("display_currency") or window.get("currency") or "",
					exchange_name=window.get("exchange_name") or "",
					facts=facts,
					run=self.run_metrics.latest_run_metrics(sym),
					listing_currency=window.get("currency") or "",
					fx_rate=window.get("fx_rate"),
				)
			)

		try:
			yours = self.runs.latest(user_id, tickers)
		except Exception as e:
			# Degrade to the market half rather than fail: the paragraph is still useful,
			# and it is stored against no run, so it is offered again once the run reads.
			logger.info("Run read failed for a comparison; writing without it: %s", e)
			yours = None

		evidence = ComparisonEvidence(horizon=horizon, day=day, stocks=tuple(stocks), yours=yours)
		if not evidence.has_evidence:
			return None

		text = self.generator.generate(evidence) if self._spend(user_id, day) else None
		source = "model"
		if not text:
			text = self.template.render(evidence)
			source = "template"
		if not text:
			return None

		row = {
			"user_id": user_id,
			"set_key": evidence.key,
			"horizon": horizon,
			"trace": text,
			"source": source,
			"model": self.generator.model if source == "model" else None,
			"windows": evidence.windows_key,
			"run_id": yours.run_id if yours else None,
			"run_at": yours.created_at if yours else None,
			"facts": evidence.fingerprint(),
			"generated_at": self._now().isoformat(),
		}
		self.repository.save(row)
		self._prune_once()
		logger.info("Generated %s comparison trace for %s %s", source, evidence.key, horizon)
		return self._point(row)

	def _spend(self, user_id: str, day: str) -> bool:
		"""Counts one model call against the reader's day, or refuses it past the limit."""
		with self._locks_guard:
			if self._calls_day != day:
				self._calls_day = day
				self._calls = {}
			used = self._calls.get(user_id, 0)
			if used >= self.config.trace_daily_limit:
				logger.info("Comparison trace daily limit reached for a reader; using the template")
				return False
			self._calls[user_id] = used + 1
			return True

	def _lock_for(self, key: tuple[str, str, str]) -> threading.Lock:
		with self._locks_guard:
			lock = self._locks.get(key)
			if lock is None:
				lock = self._locks[key] = threading.Lock()
			return lock

	def _prune_once(self) -> None:
		if self._pruned:
			return
		self._pruned = True
		self.repository.prune(self._now() - datetime.timedelta(days=RETENTION_DAYS))

	@staticmethod
	def _point(row: dict[str, Any]) -> dict[str, Any]:
		return {
			"trace": row.get("trace"),
			"source": row.get("source"),
			"model": row.get("model"),
			"generated_at": row.get("generated_at"),
			"personal": bool(row.get("run_id")),
			"run_at": row.get("run_at"),
		}
