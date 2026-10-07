"""The Compare page's written comparison: one paragraph over two or three price windows.

The page lines every measure up in rows, and each row carries a note saying what its gap
means. This paragraph is the layer above the rows: where the stocks differ most and where
they are alike, in a beginner's register. It answers the question the sponsor put on
22/09 ("Google's RSI is 37 and Apple's is 66 ... I wonder why") with what the figures
describe, and never with which stock to pick.

It is built from the Quant tab's own parts, deliberately:

  * the same windows (``QuantHistoryService``), so the paragraph and the chart above it
    read the same closes;
  * the same run measurements (``QuantTraceRepository.latest_run_metrics``), which are
    user-independent: RSI, beta, Sharpe and volatility, never the run's percentiles;
  * the same guard, made stricter. Every number must be in the facts, the advice list
    still applies, and on top of it the words that would turn a comparison into a
    verdict (better, worse, winner, prefer, outperform) fail it, as does a paragraph
    that leaves one of the stocks out.

Because nothing personal goes in, one paragraph serves everyone who compares the same set
on the same day over the same horizon. The set is sorted for the key, so AAPL against
GOOGL and GOOGL against AAPL are one row and one model call.
"""

from __future__ import annotations

import datetime
import logging
import re
import threading
import time
from dataclasses import dataclass
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
		r"\bprefer\w*\b",
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

	def numbers(self) -> set[float]:
		"""Every figure any of the stocks may be quoted with. Read by TraceGuard."""
		allowed: set[float] = set()
		for stock in self.stocks:
			allowed |= stock.numbers()
		# "both", "all three": the count of stocks is a definition, not a fact.
		allowed.update({2.0, 3.0})
		return allowed

	def fingerprint(self) -> dict[str, Any]:
		return {
			"tickers": self.tickers,
			"stocks": {s.ticker: s.fingerprint() for s in self.stocks},
		}


# ── the guard ────────────────────────────────────────────────────────────────

class ComparisonGuard:
	"""The quant trace's guard, plus the rules that keep a comparison from ranking."""

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
		for pattern in FORBIDDEN_PATTERNS + COMPARATIVE_PATTERNS:
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
	"""Turns two or three windows into the prompt. Pure, no I/O."""

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
		return f"""You are writing one short paragraph for a retail investing app that places {names} side by side. It describes how their share prices behaved over {evidence.horizon_label}. The reader is a beginner who is looking at a table of these same figures and wants to know what the differences mean.

{facts}

Write three to five sentences, no more than 120 words in total, as one paragraph with no headings, no bullet points and no title.

Cover, in whatever order reads best:
- Where they differ most: the change over the window, the largest fall from a peak to a later low, how jumpy the daily moves were, or the latest RSI.
- Anything they have in common, if the figures show it.
- For RSI, say in a few plain words what it measures (how fast and how far the price has moved recently, on a 0 to 100 scale, where above 70 is conventionally called overbought and below 30 oversold), and that these are descriptions of the move, not signals.
- If beta is given, say what it means (how much the price tends to move when the wider market moves).

Rules you must follow:
- Name every one of {names} at least once, by ticker.
- Use ONLY the figures listed above. Do not work out new numbers: no differences between them, no ratios, no averages. You know nothing else about these companies: not their businesses, their earnings, their sectors or the news.
- Compare percentages, RSI, beta and volatility. Do not compare share prices with each other: a higher share price is not a bigger or a more valuable company.
- Never say or imply that one stock is better, worse, safer, riskier, stronger or preferable, or that one did better than another. Say what each figure is and what it describes. Do not use the words better, worse, best, worst, winner, prefer, outperform, beat, safer or riskier.
- Never say or imply what any price will do next, and never tell the reader to buy, sell, hold, wait or avoid. Do not use the words buy, sell, hold, should, undervalued, overvalued, opportunity, outlook, potential, bullish or bearish.
- Write British English, in a plain, level voice. No filler openers like "Overall" or "In summary".
- Never use a dash of any kind as punctuation. Use a comma, a full stop or a rewrite.
- Plain prose only. No markdown, no quotation marks around the whole paragraph.

Write only the paragraph itself."""


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

		sentences.append("These figures describe past price movement only and do not rank the stocks.")
		return " ".join(sentences)


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
	"""Where the paragraphs live."""

	TABLE = "comparison_trace_daily"
	UPSERT_RPC = "upsert_comparison_traces"
	READ_COLUMNS = "set_key, as_of_day, horizon, trace, source, model, generated_at, facts"

	def __init__(self, client: Any | None = None):
		self._client_override = client

	def _client(self):
		# Imported on call, for the same reason as the quant store: supabase_client raises
		# at import when its env vars are missing, and that must degrade, not crash.
		if self._client_override is not None:
			return self._client_override
		from src.utils.supabase_client import supabase

		return supabase

	def read(self, key: str, day: str, horizon: str) -> dict[str, Any] | None:
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select(self.READ_COLUMNS)
				.eq("set_key", key)
				.eq("as_of_day", day)
				.eq("horizon", horizon.upper())
				.limit(1)
				.execute()
			)
			rows = res.data or []
			return rows[0] if rows else None
		except Exception as e:
			logger.info("Comparison trace read failed for %s %s %s: %s", key, day, horizon, e)
			return None

	def upsert(self, row: dict[str, Any]) -> int:
		try:
			res = self._client().rpc(self.UPSERT_RPC, {"p_rows": [row]}).execute()
			return int(res.data or 0)
		except Exception as e:
			logger.warning("Comparison trace write failed for %s: %s", row.get("set_key"), e)
			return 0

	def prune(self, before: datetime.date) -> None:
		try:
			self._client().table(self.TABLE).delete().lt("as_of_day", before.isoformat()).execute()
		except Exception as e:
			logger.info("Comparison trace prune failed: %s", e)


# ── the service ──────────────────────────────────────────────────────────────

class ComparisonTraceService:
	"""Serves a set's paragraph, generating and storing it the first time it is asked for."""

	def __init__(
		self,
		config: CompareConfig | None = None,
		history: QuantHistoryService | None = None,
		repository: ComparisonTraceRepository | None = None,
		run_metrics: Any | None = None,
		generator: ComparisonGenerator | None = None,
		template: ComparisonTemplate | None = None,
		today: Any = None,
	):
		self.config = config or CompareConfig.from_env()
		self.history = history or QuantHistoryService()
		self.repository = repository or ComparisonTraceRepository()
		#: Anything with ``latest_run_metrics(ticker)``: the quant trace's own store.
		self.run_metrics = run_metrics or QuantTraceRepository()
		self.generator = generator or ComparisonGenerator(self.config)
		self.template = template or ComparisonTemplate()
		self._today = today or utc_today
		self._pruned = False
		# One lock per key in flight, so two readers opening the same comparison at the
		# same moment pay for one completion between them.
		self._locks: dict[tuple[str, str, str], threading.Lock] = {}
		self._locks_guard = threading.Lock()

	@property
	def enabled(self) -> bool:
		"""The trace flag, and the windows it is written from."""
		return self.config.trace_enabled and self.history.enabled

	def trace_for(self, tickers: Iterable[str], horizon: str) -> dict[str, Any] | None:
		"""The stored paragraph for today, generating it if needed. Never raises.

		None for every quiet reason at once: off, too few stocks, a window with nothing in
		it, or no usable paragraph. The panel renders one fallback for all of them.
		"""
		if not self.enabled:
			return None
		try:
			return self._trace_for(normalise_tickers(tickers), horizon.upper())
		except Exception as e:
			logger.warning("Comparison trace lookup failed for %s %s: %s", list(tickers), horizon, e)
			return None

	def _trace_for(self, tickers: list[str], horizon: str) -> dict[str, Any] | None:
		if horizon not in HORIZONS:
			return None
		if not self.config.min_tickers <= len(tickers) <= self.config.max_tickers:
			return None
		day = self._today().isoformat()
		key = set_key(tickers)

		stored = self.repository.read(key, day, horizon)
		if stored:
			return self._point(stored)

		lock_key = (key, day, horizon)
		try:
			with self._lock_for(lock_key):
				# Whoever held the lock may have just written it.
				stored = self.repository.read(key, day, horizon)
				if stored:
					return self._point(stored)
				return self._generate(tickers, key, day, horizon)
		finally:
			# Dropped once written, so the map holds only keys in flight. A reader who
			# arrives after this makes a fresh lock and finds the stored row first.
			with self._locks_guard:
				self._locks.pop(lock_key, None)

	def _generate(self, tickers: list[str], key: str, day: str, horizon: str) -> dict[str, Any] | None:
		stocks: list[QuantEvidence] = []
		for sym in tickers:
			window = self.history.window(sym, horizon)
			facts = window.get("facts") if window else None
			if not facts:
				logger.info("Comparison trace for %s skipped: no window for %s", key, sym)
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

		evidence = ComparisonEvidence(horizon=horizon, day=day, stocks=tuple(stocks))
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
			"set_key": key,
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
		logger.info("Generated %s comparison trace for %s %s", source, key, horizon)
		return self._point(row)

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
		self.repository.prune(self._today() - datetime.timedelta(days=RETENTION_DAYS))

	@staticmethod
	def _point(row: dict[str, Any]) -> dict[str, Any]:
		return {
			"trace": row.get("trace"),
			"source": row.get("source"),
			"model": row.get("model"),
			"generated_at": row.get("generated_at"),
		}
