"""Trace Persistence

Purpose:
- Save per-run JSON traces to disk for reproducibility and explainability.
- Track collected messages, quant metrics, and scoring decisions.
"""

import json
import logging
import os
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, Dict, List

logger = logging.getLogger(__name__)


def _load_env_file() -> None:
	"""Lightweight .env loader so direct script execution picks up backend/.env."""
	candidates = [
		Path.cwd() / ".env",
		Path(__file__).resolve().parent / ".env",
		Path(__file__).resolve().parent / ".env.local",
	]

	for candidate in candidates:
		if not candidate.exists():
			continue

		try:
			for raw_line in candidate.read_text(encoding="utf-8").splitlines():
				line = raw_line.strip()
				if not line or line.startswith("#") or "=" not in line:
					continue
				key, value = line.split("=", 1)
				key = key.strip()
				value = value.strip().strip('"').strip("'")
				if key and key not in os.environ:
					os.environ[key] = value
		except Exception as exc:
			logger.debug(f"Skipping env file {candidate}: {exc}")


_load_env_file()

RUNS_DIR = Path(os.getenv("TRACES_DIR", "data/runs"))


@dataclass
class SocialMention:
	"""Representation of a collected social media mention."""

	source: str
	message_id: str
	raw_text: str
	cleaned_text: str
	created_at: str
	author: Optional[str] = None
	engagement_count: int = 0
	vader_score: Optional[float] = None
	transformer_label: Optional[str] = None
	transformer_confidence: Optional[float] = None


@dataclass
class QuantMetrics:
	"""Representation of quantitative metrics for a ticker."""

	ticker: str
	rsi: Optional[float] = None
	macd_signal: Optional[str] = None
	sharpe_ratio: Optional[float] = None
	beta: Optional[float] = None
	volatility: Optional[float] = None
	raw_quant_score: Optional[float] = None


class Tracer:
	"""Trace collector and persister for analysis runs."""

	def __init__(
		self,
		run_id: str,
		user_id: str,
		risk_tolerance: str = "Moderate",
		universes: Optional[List[str]] = None,
		tickers: Optional[List[str]] = None,
	):
		self.run_id = run_id
		self.user_id = user_id
		self.risk_tolerance = risk_tolerance
		self.universes = universes or []
		self.tickers = tickers or []
		self.created_at = datetime.utcnow().isoformat() + "Z"

		self.trace: Dict[str, Any] = {
			"run_id": run_id,
			"user_id": user_id,
			"risk_tolerance": risk_tolerance,
			"universes": self.universes,
			"tickers": self.tickers,
			"created_at": self.created_at,
			"steps": [],
			"collectors": {
				"messages": [],
				"quant_metrics": {},
			},
			"sentiment_outputs": {},
			"aggregates": {},
			"artifacts": {
				"trace_path": None,
				"saved_at": None,
			},
		}

	def log_step(self, step_name: str, metadata: Optional[Dict[str, Any]] = None):
		step_entry = {
			"step": step_name,
			"timestamp": datetime.utcnow().isoformat() + "Z",
			"metadata": metadata or {},
		}
		self.trace["steps"].append(step_entry)
		logger.debug(f"Logged step '{step_name}' for run {self.run_id}")

	def add_messages(self, ticker: str, messages: List[SocialMention]):
		for msg in messages:
			msg_dict = asdict(msg) if hasattr(msg, "__dataclass_fields__") else msg
			self.trace["collectors"]["messages"].append({"ticker": ticker, **msg_dict})
		logger.debug(f"Added {len(messages)} messages for {ticker}")

	def add_quant_metrics(self, ticker: str, metrics: QuantMetrics):
		metrics_dict = asdict(metrics) if hasattr(metrics, "__dataclass_fields__") else metrics
		self.trace["collectors"]["quant_metrics"][ticker] = metrics_dict
		logger.debug(f"Added quant metrics for {ticker}")

	def add_sentiment_output(self, ticker: str, sentiment_data: Dict[str, Any]):
		self.trace["sentiment_outputs"][ticker] = sentiment_data
		logger.debug(f"Added sentiment output for {ticker}")

	def add_aggregates(self, final_rankings: List[Dict[str, Any]], unified_scores: Dict[str, Dict[str, Any]]):
		self.trace["aggregates"] = {
			"final_rankings": final_rankings,
			"unified_scores": unified_scores,
			"generated_at": datetime.utcnow().isoformat() + "Z",
		}
		logger.debug(f"Added aggregates for {len(final_rankings)} top-ranked assets")

	def save(self) -> str:
		RUNS_DIR.mkdir(parents=True, exist_ok=True)
		trace_path = RUNS_DIR / f"{self.run_id}.trace.json"

		self.trace["artifacts"]["trace_path"] = str(trace_path)
		self.trace["artifacts"]["saved_at"] = datetime.utcnow().isoformat() + "Z"

		with open(trace_path, "w", encoding="utf-8") as f:
			json.dump(self.trace, f, ensure_ascii=False, indent=2, default=str)

		logger.info(f"Trace saved to {trace_path}")
		return str(trace_path)


def load_trace(run_id: str) -> Optional[Dict[str, Any]]:
	trace_path = RUNS_DIR / f"{run_id}.trace.json"
	if trace_path.exists():
		with open(trace_path, "r", encoding="utf-8") as f:
			return json.load(f)
	return None


def list_traces(limit: int = 10) -> List[str]:
	if not RUNS_DIR.exists():
		return []
	traces = sorted(RUNS_DIR.glob("*.trace.json"), reverse=True)
	return [str(t) for t in traces[:limit]]
