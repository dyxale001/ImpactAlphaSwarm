"""The Quant tab's own reasoning trace: one paragraph over one ticker's price window.

D-125 gives each tab of the asset page its own trace. The sentiment tab's is the day
summary; this is the quant tab's, and it follows that module class for class, because
the problem is the same: prose that is generated, and therefore constrained.

What it is written from, and nothing else:

  * the window's facts, computed by ``QuantHistoryService`` on the full daily series
    (change over the window, high and low with their dates, the worst peak to trough
    fall, days RSI spent past 70 or under 30, the latest RSI);
  * the run's own stored measurements for the ticker (RSI and its band, beta and its
    band, Sharpe, volatility), read from the most recent ``ai_recommendation`` row.

What it is NOT written from: the cross-sectional percentiles. Those are relative to one
user's run and would make the paragraph personal to that user; a window is the same for
every reader, so one paragraph per (ticker, day, horizon) can be cached and shared. The
percentiles have their own plain language on the panel (D-122).

Two guards stand between the model and the table, and both are the lesson of the
withdrawn LLM fund descriptions: stop asking a model for facts it was not given, and
check what comes back rather than trusting it.

  * Number grounding. Every number in the paragraph must be one of the figures in the
    facts (to rounding). A paragraph that mentions a figure it was not handed is
    rejected, however plausible it reads.
  * The advice list. Buy, sell, hold, should, undervalued, outlook, will rise: the
    product is legally not allowed to advise (D-081), and a paragraph that does is
    rejected rather than edited.

A rejected paragraph, a model that is down, or a deployment with no key all fall back
to a templated paragraph built from the same facts, stored with ``source='template'``
and shown with a badge saying so.
"""

from __future__ import annotations

import datetime
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from src.utils.gr_reasoningtracestyle import HOUSE_STYLE
from src.utils.llm_client import GroqClient

from .config import QuantViewConfig
from .history import HORIZONS, QuantHistoryService, RSI_OVERBOUGHT, RSI_OVERSOLD, utc_today

logger = logging.getLogger("quant-view")

RETENTION_DAYS = 30

#: The horizons as the paragraph names them. Kept in step with QUANT_HORIZON_LABELS in
#: frontend/src/data/quantExplainers.ts; the two sides cannot import from each other.
HORIZON_LABELS: dict[str, str] = {
	"1M": "the last month",
	"6M": "the last six months",
	"3Y": "the last three years",
	"5Y": "the last five years",
}

#: Words the paragraph may not contain, as word-bounded patterns. The list is the
#: reasoning trace's _ADVICE_PROHIBITION made checkable, plus the forward-looking verbs
#: a description of the past has no use for. A match rejects the paragraph outright.
FORBIDDEN_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
	re.compile(p, re.IGNORECASE)
	for p in (
		r"\bbuy(s|ing)?\b",
		r"\bsell(s|ing)?\b",
		r"\bhold(s|ing)?\b",
		r"\bshould\b",
		r"\bmust\b",
		r"\brecommend\w*\b",
		r"\badvi[cs]e\w*\b",
		r"\btarget price\b",
		r"\bunder-?valued\b",
		r"\bover-?valued\b",
		r"\bopportunit(y|ies)\b",
		r"\bbargain\b",
		r"\bavoid\w*\b",
		r"\boutlook\b",
		r"\bprospects?\b",
		r"\bpotential\b",
		r"\bpoised\b",
		r"\bset to\b",
		r"\bwill (rise|fall|climb|drop|recover|rebound|continue|likely)\b",
		r"\bpredict\w*\b",
		r"\bforecast\w*\b",
		r"\bexpect\w*\b",
		r"\blikely to\b",
		r"\bgoing to\b",
		r"\bbullish\b",
		r"\bbearish\b",
		r"\bcheap\b",
		r"\bexpensive\b",
	)
)

#: Numbers the paragraph may always use: the RSI scale and its conventional lines, and
#: the indicator's own period. These are definitions, not facts about the ticker.
ALWAYS_ALLOWED_NUMBERS: frozenset[float] = frozenset({0.0, 14.0, RSI_OVERSOLD, 50.0, RSI_OVERBOUGHT, 100.0})

_NUMBER = re.compile(r"(?<![\w.])[-−]?\d[\d,]*(?:\.\d+)?")
#: A rand prefix glued to its figure, "R3283.2". The number pattern above refuses a digit
#: that follows a letter, so a price written the way the app prints rand would slip past
#: the guard unread. Split before matching; the R stays, the figure becomes visible.
_RAND_PREFIX = re.compile(r"\bR(?=\d)")
_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")


# ── evidence ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class QuantEvidence:
	"""One window of one ticker, with the run's own measurements beside it.

	Assembled once so that the prompt, the guard and the stored fingerprint all read the
	same object. Everything the paragraph is allowed to say is in here.
	"""

	ticker: str
	horizon: str
	day: str
	#: The currency the facts are in: rand whenever the window could be converted.
	currency: str
	exchange_name: str
	#: WindowFacts.compute's output, unchanged.
	facts: dict[str, Any]
	#: The latest ai_recommendation quant columns for the ticker, or {} when none.
	run: dict[str, Any] = field(default_factory=dict)
	#: What the share actually trades in, and the rand per unit of it the facts were
	#: converted at. The paragraph says both, once, so a reader who knows the share
	#: trades in dollars is not left wondering why the numbers are so large.
	listing_currency: str = ""
	fx_rate: float | None = None

	@property
	def converted(self) -> bool:
		"""Whether the facts are in a currency other than the one the share trades in."""
		listing = (self.listing_currency or "").upper()
		return bool(self.fx_rate) and bool(listing) and listing != (self.currency or "").upper()

	@property
	def horizon_label(self) -> str:
		return HORIZON_LABELS.get(self.horizon, self.horizon.lower())

	@property
	def has_evidence(self) -> bool:
		return bool(self.facts) and self.facts.get("last_close") is not None

	def numbers(self) -> set[float]:
		"""Every figure the paragraph is allowed to quote, as magnitudes.

		Magnitudes because the guard reads the paragraph's numbers the same way: a
		drawdown stored as -18.7 is written "a fall of 18.7 percent", and the sign lives
		in the words, not the digits.
		"""
		allowed: set[float] = set(ALWAYS_ALLOWED_NUMBERS)
		for value in list(self.facts.values()) + list(self.run.values()):
			allowed.update(abs(n) for n in _numbers_in(value))
		# A horizon's own count: "six months", "5 years", "three years".
		allowed.update(_numbers_in(HORIZONS.get(self.horizon)))
		allowed.update({1.0, 6.0, 3.0, 5.0})
		# The rate the prices were converted at, which the paragraph states.
		if self.fx_rate:
			allowed.add(abs(float(self.fx_rate)))
		return allowed

	def fingerprint(self) -> dict[str, Any]:
		"""What was written from, for the facts column.

		Carries the listing currency and rate as well as the display currency, so a
		stored paragraph can be recognised as written in the currency now served.
		"""
		return {
			"window": self.facts,
			"run": self.run,
			"currency": self.currency,
			"listing_currency": self.listing_currency,
			"fx_rate": self.fx_rate,
		}


def _numbers_in(value: Any) -> set[float]:
	"""The numeric readings of one fact: the number itself, and the parts of a date."""
	out: set[float] = set()
	if value is None or isinstance(value, bool):
		return out
	if isinstance(value, (int, float)):
		out.add(float(value))
		return out
	if isinstance(value, str):
		m = _DATE.match(value)
		if m:
			out.update({float(m.group(1)), float(m.group(2)), float(m.group(3))})
			return out
		# A stored numeric string, e.g. a decimal column read back as text.
		try:
			out.add(float(value))
		except ValueError:
			pass
	return out


def spell_date(value: str | None) -> str:
	"""'2026-08-26' as '26 August 2026', so the model is not tempted by ISO order."""
	if not value:
		return "an unknown date"
	m = _DATE.match(str(value))
	if not m:
		return str(value)
	year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
	if not 1 <= month <= 12:
		return str(value)
	return f"{day} {_MONTHS[month - 1]} {year}"


def _trim(number: Any, digits: int = 2) -> str:
	"""A number as the paragraph should print it: no trailing zeros, no scientific form."""
	if number is None:
		return "unknown"
	try:
		f = float(number)
	except (TypeError, ValueError):
		return str(number)
	text = f"{f:.{digits}f}".rstrip("0").rstrip(".")
	return text if text not in ("", "-0") else "0"


def _money(number: Any, currency: str) -> str:
	"""A price as the paragraph prints it: "R3412.55" in rand, "182.4 USD" otherwise.

	Rand takes the R prefix the rest of the app uses for the headline price; any other
	code follows the number, as itself, so an unfamiliar one is never dressed as a symbol.
	"""
	code = (currency or "").upper()
	if code == "ZAR":
		return f"R{_trim(number)}"
	return f"{_trim(number)} {code}" if code else _trim(number)


def _rate_phrase(evidence: "QuantEvidence") -> str:
	"""How the prices got into rand, in words: "today's rate of R18.42 per USD"."""
	return f"today's rate of R{_trim(evidence.fx_rate)} per {evidence.listing_currency.upper()}"


# ── the guard ────────────────────────────────────────────────────────────────

class TraceGuard:
	"""Refuses a paragraph that says more than its facts, or says what to do about them."""

	#: How far a quoted number may sit from an allowed one. Half a unit, which is
	#: rounding to the nearest whole: "about 12%" for 12.4 is a fair reading, "40%" is not.
	TOLERANCE = 0.51

	def __init__(self, config: QuantViewConfig | None = None):
		self.config = config or QuantViewConfig.from_env()

	def check(self, text: str, evidence: QuantEvidence) -> str | None:
		"""The reason a paragraph fails, or None when it passes."""
		if len(text) < self.config.trace_min_chars:
			return f"too short to be a paragraph ({len(text)} chars)"
		if len(text) > self.config.trace_max_chars:
			return f"over the {self.config.trace_max_chars} char limit ({len(text)} chars)"
		for pattern in FORBIDDEN_PATTERNS:
			hit = pattern.search(text)
			if hit:
				return f"uses forbidden term '{hit.group(0)}'"
		stray = self.ungrounded_numbers(text, evidence)
		if stray:
			return f"quotes numbers not in the facts: {', '.join(stray)}"
		return None

	def ungrounded_numbers(self, text: str, evidence: QuantEvidence) -> list[str]:
		allowed = evidence.numbers()
		stray: list[str] = []
		for token in _NUMBER.findall(_RAND_PREFIX.sub("R ", text)):
			cleaned = token.replace(",", "").replace("−", "-")
			try:
				value = abs(float(cleaned))
			except ValueError:
				continue
			if not any(abs(value - a) <= self.TOLERANCE for a in allowed):
				stray.append(token)
		return stray


# ── the prompt ───────────────────────────────────────────────────────────────

class QuantTracePromptBuilder:
	"""Turns one window's evidence into the prompt. Pure, no I/O."""

	def build(self, evidence: QuantEvidence) -> str:
		unit = evidence.currency or "its listing currency"
		example = _money(evidence.facts.get("last_close"), evidence.currency)
		if evidence.converted:
			price_rule = (
				f"- Prices are in South African rand (ZAR), converted from {evidence.listing_currency.upper()} at"
				f" {_rate_phrase(evidence)}. Write them as R followed by the number, for example {example}."
			)
			conversion_point = (
				f"- Say once, plainly, that the prices are shown in rand converted from"
				f" {evidence.listing_currency.upper()} at {_rate_phrase(evidence)}, and that the share itself"
				f" trades in {evidence.listing_currency.upper()}"
				+ (f" on {evidence.exchange_name}" if evidence.exchange_name else "")
				+ ".\n"
			)
		elif (evidence.currency or "").upper() == "ZAR":
			price_rule = f"- Prices are in South African rand. Write them as R followed by the number, for example {example}."
			conversion_point = ""
		else:
			price_rule = f"- Prices are in {unit}. Write them as plain numbers with that unit, for example {example}."
			conversion_point = ""
		return f"""You are writing one short paragraph for a retail investing app, describing what {evidence.ticker}'s share price did over {evidence.horizon_label}. The reader is a beginner.

{self._window_block(evidence, unit)}

{self._run_block(evidence)}

Write three to five sentences, no more than 110 words in total, as one paragraph with no headings, no bullet points and no title.

Cover, in whatever order reads best:
- How far the price moved over the window, from its first close to its most recent close, and whether that is a rise or a fall.
- Where the high and the low fell, and how large the largest fall from a peak to a later low was. Say plainly that a fall of that size happened inside the window.
- What RSI did. Explain in a few plain words what RSI measures (how fast and how far the price has moved recently, on a 0 to 100 scale, where above 70 is conventionally called overbought and below 30 oversold), then say how many of the measured days sat past those lines and where the latest reading is. Say that these are descriptions of the move, not signals.
- If beta is given, say in plain words what it means (how much the price tends to move when the wider market moves) and which band it fell in.
{conversion_point}
Rules you must follow:
- Use ONLY the figures listed above. You know nothing else about {evidence.ticker}: not its business, not its earnings, not its sector, not the news, not what happened outside this window. If a figure is not listed, it does not go in. Do not invent, estimate or round to a different number.
- Never say or imply what the price will do next, and never tell the reader to buy, sell, hold, wait or avoid. Do not use the words buy, sell, hold, should, undervalued, overvalued, opportunity, outlook, potential, bullish or bearish.
- Describe the price, not the company. A price that rose is not a company that did well.
{price_rule}
- Call the final figure the most recent close, not today's close; the window may end on a day that is not over.
- Write British English, in a plain, level voice. No hype, no filler openers like "Overall" or "In summary".
- Never use a dash of any kind as punctuation. Use a comma, a full stop or a rewrite.
- Plain prose only. No markdown, no quotation marks around the whole paragraph.

Write only the paragraph itself."""

	@staticmethod
	def _window_block(evidence: QuantEvidence, unit: str) -> str:
		f = evidence.facts
		cur = evidence.currency
		lines = [
			f"The window: {spell_date(f.get('start'))} to {spell_date(f.get('end'))}, {f.get('trading_days')} trading days"
			+ (f", listed on {evidence.exchange_name}" if evidence.exchange_name else "")
			+ (
				f". Prices below are in rand, converted from {evidence.listing_currency.upper()} at {_rate_phrase(evidence)}"
				if evidence.converted
				else ""
			)
			+ ".",
			f"- First close: {_money(f.get('first_close'), cur)}",
			f"- Most recent close: {_money(f.get('last_close'), cur)}",
			f"- Change over the window: {_trim(f.get('change_pct'), 1)} percent"
			+ (" (a rise)" if (f.get("change_pct") or 0) > 0 else " (a fall)" if (f.get("change_pct") or 0) < 0 else " (flat)"),
			f"- Highest close: {_money(f.get('high'), cur)} on {spell_date(f.get('high_date'))}",
			f"- Lowest close: {_money(f.get('low'), cur)} on {spell_date(f.get('low_date'))}",
			f"- Largest fall from a peak to a later low inside the window: {_trim(abs(f.get('max_drawdown_pct') or 0), 1)} percent",
		]
		if f.get("volatility_pct") is not None:
			lines.append(
				f"- Volatility of the window's daily moves, annualised: {_trim(f.get('volatility_pct'), 1)} percent"
			)
		measured = f.get("rsi_days_measured") or 0
		if measured:
			lines.append(
				f"- RSI (14 day): measured on {measured} days; {f.get('days_rsi_overbought', 0)} of them above 70,"
				f" {f.get('days_rsi_oversold', 0)} below 30; latest reading {_trim(f.get('latest_rsi'), 0)}"
			)
		else:
			lines.append("- RSI: not measurable over this window")
		return "\n".join(lines)

	@staticmethod
	def _run_block(evidence: QuantEvidence) -> str:
		run = evidence.run
		if not run:
			return "From the most recent analysis run: no stored measurements for this ticker. Do not mention beta or the Sharpe ratio."
		lines = ["From the most recent analysis run, measured over roughly a year of prices:"]
		if run.get("beta") is not None:
			band = run.get("beta_band")
			lines.append(
				f"- Beta: {_trim(run.get('beta'))}"
				+ (f", in the '{band}' band ({BETA_BAND_PHRASES.get(band, band)})" if band else "")
			)
		if run.get("sharpe_ratio") is not None:
			lines.append(f"- Sharpe ratio: {_trim(run.get('sharpe_ratio'))}")
		if run.get("volatility") is not None:
			lines.append(f"- Annualised volatility over the year: {_trim(float(run['volatility']) * 100, 1)} percent")
		if run.get("rsi_band"):
			lines.append(f"- The run's own RSI band: {run.get('rsi_band')}")
		if len(lines) == 1:
			return "From the most recent analysis run: no stored measurements for this ticker. Do not mention beta or the Sharpe ratio."
		return "\n".join(lines)


#: The band wording, kept in step with BETA_BANDS in frontend/src/data/quantExplainers.ts.
BETA_BAND_PHRASES: dict[str, str] = {
	"inverse": "moved opposite to the market over the window",
	"low": "tends to move less than the market",
	"market": "moves roughly with the market",
	"high": "tends to move more sharply than the market",
}

RSI_BAND_PHRASES: dict[str, str] = {
	"oversold": "in the conventional oversold range, below 30",
	"neutral": "in the neutral range between 30 and 70",
	"overbought": "in the conventional overbought range, above 70",
}


# ── the template ─────────────────────────────────────────────────────────────

class QuantTraceTemplate:
	"""The deterministic paragraph, from the same facts. What the reader gets when the
	model cannot be used, and what proves a paragraph can be written from these facts
	without saying anything more."""

	def render(self, evidence: QuantEvidence) -> str:
		f = evidence.facts
		cur = evidence.currency or ""
		money = lambda v: _money(v, cur)  # noqa: E731
		change = f.get("change_pct")
		sentences: list[str] = []

		if change is None:
			sentences.append(
				f"Over {evidence.horizon_label} {evidence.ticker} moved from {money(f.get('first_close'))}"
				f" on {spell_date(f.get('start'))} to a most recent close of {money(f.get('last_close'))}"
				f" on {spell_date(f.get('end'))}."
			)
		else:
			direction = "up" if change > 0 else "down" if change < 0 else "flat"
			if direction == "flat":
				sentences.append(
					f"Over {evidence.horizon_label} {evidence.ticker} ended flat, closing most recently at"
					f" {money(f.get('last_close'))} on {spell_date(f.get('end'))}, the same level as its first close"
					f" on {spell_date(f.get('start'))}."
				)
			else:
				sentences.append(
					f"Over {evidence.horizon_label} {evidence.ticker} moved {direction} {_trim(abs(change), 1)} percent,"
					f" from {money(f.get('first_close'))} on {spell_date(f.get('start'))}"
					f" to a most recent close of {money(f.get('last_close'))} on {spell_date(f.get('end'))}."
				)

		if evidence.converted:
			# Appended to the opening sentence rather than given one of its own: the
			# template runs close to the guard's length cap once RSI and beta are in.
			sentences[-1] = sentences[-1].rstrip(".") + (
				f", in rand converted from {evidence.listing_currency.upper()} at {_rate_phrase(evidence)}."
			)

		sentences.append(
			f"Its highest close in the window was {money(f.get('high'))} on {spell_date(f.get('high_date'))}"
			f" and its lowest {money(f.get('low'))} on {spell_date(f.get('low_date'))};"
			f" the largest fall from a peak to a later low was {_trim(abs(f.get('max_drawdown_pct') or 0), 1)} percent."
		)

		measured = f.get("rsi_days_measured") or 0
		if measured and f.get("latest_rsi") is not None:
			sentences.append(
				"RSI, which summarises how fast and how far the price has moved recently on a 0 to 100 scale,"
				f" sat above 70 on {f.get('days_rsi_overbought', 0)} of the {measured} measured days"
				f" and below 30 on {f.get('days_rsi_oversold', 0)}, and reads {_trim(f.get('latest_rsi'), 0)} at the most recent close;"
				" above 70 is conventionally called overbought and below 30 oversold, as descriptions of the move rather than signals."
			)

		run = evidence.run
		if run.get("beta") is not None:
			band = run.get("beta_band")
			phrase = BETA_BAND_PHRASES.get(band)
			sentences.append(
				f"In the most recent analysis run its beta, a measure of how much the price tends to move when the wider market moves,"
				f" was {_trim(run.get('beta'))}"
				+ (f", meaning it {phrase}" if phrase else "")
				+ "."
			)

		sentences.append("These figures describe past price movement over the window only.")
		return " ".join(sentences)


# ── the generator ────────────────────────────────────────────────────────────

class QuantTraceGenerator:
	"""Asks the model for one paragraph, and refuses anything the facts do not support."""

	#: The lane the day summaries own. Both generate while somebody is reading a page,
	#: so they share the lane the trace pool and discovery are not on.
	KEY_ENV = "GROQ_API_KEY4"
	FALLBACK_KEY_ENV = "GROQ_API_KEY"

	MAX_TOKENS = 1200
	TEMPERATURE = 0.3
	RETRIES = 2
	BACKOFF_SECONDS = (1.0, 2.0)

	def __init__(
		self,
		config: QuantViewConfig | None = None,
		client: Any | None = None,
		guard: TraceGuard | None = None,
		builder: QuantTracePromptBuilder | None = None,
	):
		self.config = config or QuantViewConfig.from_env()
		self.builder = builder or QuantTracePromptBuilder()
		self.guard = guard or TraceGuard(self.config)
		self._client = client
		self._client_built = client is not None

	@property
	def client(self):
		"""The Groq client, built once. None when Groq is unconfigured."""
		if not self._client_built:
			self._client_built = True
			self._client = GroqClient.create(
				purpose="quant_trace",
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

	def generate(self, evidence: QuantEvidence) -> str | None:
		"""One paragraph that passed the guard, or None. Never raises."""
		client = self.client
		if client is None:
			logger.info("Quant trace skipped for %s %s: Groq unconfigured", evidence.ticker, evidence.horizon)
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
			logger.info(
				"Quant trace for %s %s rejected: %s", evidence.ticker, evidence.horizon, reason
			)
			return None
		return paragraph

	def _complete(self, client, prompt: str, evidence: QuantEvidence) -> str | None:
		for attempt in range(self.RETRIES + 1):
			try:
				return client.complete(prompt)
			except Exception as e:
				if attempt >= self.RETRIES:
					logger.warning(
						"Quant trace generation failed for %s %s after %d attempts: %s",
						evidence.ticker,
						evidence.horizon,
						attempt + 1,
						e,
					)
					return None
				wait = self.BACKOFF_SECONDS[min(attempt, len(self.BACKOFF_SECONDS) - 1)]
				time.sleep(wait)
		return None


# ── the store ────────────────────────────────────────────────────────────────

class QuantTraceRepository:
	"""Where the paragraphs live, and where the run's measurements are read from."""

	TABLE = "quant_trace_daily"
	UPSERT_RPC = "upsert_quant_traces"
	READ_COLUMNS = "ticker, as_of_day, horizon, trace, source, model, generated_at, facts"
	RUN_COLUMNS = (
		"rsi, rsi_band, beta, beta_band, sharpe_ratio, volatility, macd, macd_histogram, "
		"quant_normalisation, created_at"
	)

	def __init__(self, client: Any | None = None):
		self._client_override = client

	def _client(self):
		# Imported on call, never at module load. supabase_client raises at import when
		# its env vars are missing, and a missing database must degrade the traces
		# rather than make the module unimportable.
		if self._client_override is not None:
			return self._client_override
		from src.utils.supabase_client import supabase

		return supabase

	def read(self, ticker: str, day: str, horizon: str) -> dict[str, Any] | None:
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select(self.READ_COLUMNS)
				.eq("ticker", ticker.upper())
				.eq("as_of_day", day)
				.eq("horizon", horizon.upper())
				.limit(1)
				.execute()
			)
			rows = res.data or []
			return rows[0] if rows else None
		except Exception as e:
			logger.info("Quant trace read failed for %s %s %s: %s", ticker, day, horizon, e)
			return None

	def upsert(self, row: dict[str, Any]) -> int:
		try:
			res = self._client().rpc(self.UPSERT_RPC, {"p_rows": [row]}).execute()
			return int(res.data or 0)
		except Exception as e:
			logger.warning("Quant trace write failed for %s: %s", row.get("ticker"), e)
			return 0

	def prune(self, before: datetime.date) -> None:
		try:
			self._client().table(self.TABLE).delete().lt("as_of_day", before.isoformat()).execute()
		except Exception as e:
			logger.info("Quant trace prune failed: %s", e)

	def latest_run_metrics(self, ticker: str) -> dict[str, Any]:
		"""The quant columns of the ticker's most recent recommendation row, or {}.

		User-independent columns only. The percentiles on that same row are relative to
		one user's run and are deliberately not read.
		"""
		try:
			assets = (
				self._client()
				.table("assets")
				.select("id")
				.eq("ticker", ticker.upper())
				.limit(1)
				.execute()
				.data
				or []
			)
			if not assets:
				return {}
			rows = (
				self._client()
				.table("ai_recommendation")
				.select(self.RUN_COLUMNS)
				.eq("asset_id", assets[0]["id"])
				.order("created_at", desc=True)
				.limit(1)
				.execute()
				.data
				or []
			)
			if not rows:
				return {}
			row = rows[0]
			return {
				key: row.get(key)
				for key in ("rsi", "rsi_band", "beta", "beta_band", "sharpe_ratio", "volatility", "quant_normalisation")
				if row.get(key) is not None
			}
		except Exception as e:
			logger.info("Quant trace run metrics read failed for %s: %s", ticker, e)
			return {}


# ── the service ──────────────────────────────────────────────────────────────

class QuantTraceService:
	"""Serves a window's paragraph, generating and storing it the first time it is asked for."""

	def __init__(
		self,
		config: QuantViewConfig | None = None,
		history: QuantHistoryService | None = None,
		repository: QuantTraceRepository | None = None,
		generator: QuantTraceGenerator | None = None,
		template: QuantTraceTemplate | None = None,
		today: Any = None,
	):
		self.config = config or QuantViewConfig.from_env()
		self.history = history or QuantHistoryService(self.config)
		self.repository = repository or QuantTraceRepository()
		self.generator = generator or QuantTraceGenerator(self.config)
		self.template = template or QuantTraceTemplate()
		self._today = today or utc_today
		self._pruned = False

	@property
	def enabled(self) -> bool:
		"""The trace flag, and the history it is written from."""
		return self.config.trace_enabled and self.history.enabled

	def trace_for(self, ticker: str, horizon: str) -> dict[str, Any] | None:
		"""The stored paragraph for today's window, generating it if needed. Never raises.

		None for every quiet reason at once: traces off, no window to write from, or
		nothing usable came back and the template could not stand in. The panel renders
		one fallback for all of them.
		"""
		if not self.enabled:
			return None
		try:
			return self._trace_for(ticker.upper(), horizon.upper())
		except Exception as e:
			logger.warning("Quant trace lookup failed for %s %s: %s", ticker, horizon, e)
			return None

	def _trace_for(self, sym: str, horizon: str) -> dict[str, Any] | None:
		if horizon not in HORIZONS:
			return None
		day = self._today().isoformat()

		stored = self.repository.read(sym, day, horizon)
		if stored and not self._stale(stored):
			return self._point(stored)

		window = self.history.window(sym, horizon)
		facts = window.get("facts") if window else None
		if not facts:
			return None

		evidence = QuantEvidence(
			ticker=sym,
			horizon=horizon,
			day=day,
			currency=window.get("display_currency") or window.get("currency") or "",
			exchange_name=window.get("exchange_name") or "",
			facts=facts,
			run=self.repository.latest_run_metrics(sym),
			listing_currency=window.get("currency") or "",
			fx_rate=window.get("fx_rate"),
		)
		if not evidence.has_evidence:
			return None

		text = self.generator.generate(evidence)
		source = "model"
		if not text:
			text = self.template.render(evidence)
			source = "template"
		if not text:
			return None

		row = {
			"ticker": sym,
			"as_of_day": day,
			"horizon": horizon,
			"trace": text,
			"source": source,
			"model": self.generator.model if source == "model" else None,
			"facts": evidence.fingerprint(),
		}
		self.repository.upsert(row)
		row["generated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
		self._prune_once()
		logger.info("Generated %s quant trace for %s %s", source, sym, horizon)
		return self._point(row)

	def _prune_once(self) -> None:
		if self._pruned:
			return
		self._pruned = True
		self.repository.prune(self._today() - datetime.timedelta(days=RETENTION_DAYS))

	@staticmethod
	def _stale(row: dict[str, Any]) -> bool:
		"""A paragraph written before windows were served in rand.

		Its fingerprint names a currency but not the listing currency, so it was written
		over closes in the listing currency and would disagree with the chart now drawn
		under it. Regenerated once; a row with no fingerprint at all is served as it is.
		"""
		facts = row.get("facts")
		return isinstance(facts, dict) and "currency" in facts and "listing_currency" not in facts

	@staticmethod
	def _point(row: dict[str, Any]) -> dict[str, Any]:
		facts = row.get("facts") if isinstance(row.get("facts"), dict) else {}
		return {
			"trace": row.get("trace"),
			"source": row.get("source"),
			"model": row.get("model"),
			"generated_at": row.get("generated_at"),
			"currency": facts.get("currency"),
			"listing_currency": facts.get("listing_currency"),
			"fx_rate": facts.get("fx_rate"),
		}
