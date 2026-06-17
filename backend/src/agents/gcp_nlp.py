"""Google Cloud Natural Language API sentiment scorer (REST).

Purpose: provide a second sentiment signal alongside VADER. The two signals are
averaged into one score by the sentiment scout. This module is designed to fail
gracefully: missing credentials, missing libraries, network/API errors, or an
exhausted monthly quota all return ``None`` so the caller falls back to VADER.

Cost control: the API bills 1 "unit" per 1000 characters. Each call truncates to
1000 chars (1 unit) and a persisted monthly budget guard (default 500 units)
stops spending once the cap is hit. Results are cached in-memory so duplicate
text within a process does not re-spend units.

Auth: prefers an API key (``GOOGLE_NLP_API_KEY``) which works locally and on
Cloud Run. If no key is set it falls back to Application Default Credentials
(the Cloud Run service account), which requires the optional ``google-auth``
package.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

try:
	import requests
except ImportError:
	requests = None

try:
	from tenacity import (
		retry,
		retry_if_exception_type,
		stop_after_attempt,
		wait_exponential,
	)
except ImportError:
	retry = None


NL_ENDPOINT = "https://language.googleapis.com/v2/documents:analyzeSentiment"
MAX_CHARS = 1000  # 1 NLP unit == 1000 chars; keep every call to a single unit.

_CACHE_DIR = Path(os.getenv("ALPHASWARM_CACHE_DIR", "data/cache"))
_BUDGET_FILE = _CACHE_DIR / "gcp_nlp_budget.json"
_budget_lock = threading.Lock()


class _GcpRetryableError(Exception):
	"""Raised on transient API errors (429/5xx) to trigger a tenacity retry."""


def _monthly_budget() -> int:
	try:
		return int(os.getenv("GOOGLE_NLP_MONTHLY_BUDGET", "500"))
	except ValueError:
		return 500


def _current_month() -> str:
	return datetime.now(timezone.utc).strftime("%Y-%m")


def _read_budget() -> dict:
	try:
		data = json.loads(_BUDGET_FILE.read_text(encoding="utf-8"))
	except (FileNotFoundError, ValueError, OSError):
		data = {}
	if data.get("month") != _current_month():
		# New month (or first run) resets the counter.
		return {"month": _current_month(), "used": 0}
	return {"month": data["month"], "used": int(data.get("used", 0))}


def _budget_available() -> bool:
	with _budget_lock:
		return _read_budget()["used"] < _monthly_budget()


def _increment_budget() -> None:
	with _budget_lock:
		data = _read_budget()
		data["used"] += 1
		try:
			_CACHE_DIR.mkdir(parents=True, exist_ok=True)
			_BUDGET_FILE.write_text(json.dumps(data), encoding="utf-8")
		except OSError:
			# If we cannot persist the counter, skip silently rather than fail scoring.
			pass


def _get_api_key() -> str | None:
	key = os.getenv("GOOGLE_NLP_API_KEY", "").strip()
	return key or None


def _get_adc_token() -> str | None:
	"""Fetch a bearer token via Application Default Credentials (Cloud Run SA).

	Requires the optional ``google-auth`` package. Returns ``None`` if it is not
	installed or no credentials are available.
	"""
	try:
		import google.auth
		from google.auth.transport.requests import Request

		creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
		creds.refresh(Request())
		return creds.token
	except Exception:
		return None


def _request_sentiment(text: str) -> float | None:
	"""Single API call. Raises ``_GcpRetryableError`` on 429/5xx; otherwise
	returns the document sentiment score (-1..1) or ``None``."""
	params: dict[str, str] = {}
	headers = {"Content-Type": "application/json"}

	api_key = _get_api_key()
	if api_key:
		params["key"] = api_key
	else:
		token = _get_adc_token()
		if not token:
			return None
		headers["Authorization"] = f"Bearer {token}"

	body = {
		"document": {"type": "PLAIN_TEXT", "content": text, "languageCode": "en"},
		"encodingType": "UTF8",
	}

	resp = requests.post(NL_ENDPOINT, params=params, headers=headers, json=body, timeout=10)
	if resp.status_code == 429 or resp.status_code >= 500:
		raise _GcpRetryableError(f"transient status {resp.status_code}")
	if resp.status_code != 200:
		return None

	score = resp.json().get("documentSentiment", {}).get("score")
	if score is None:
		return None
	return max(-1.0, min(1.0, float(score)))


if retry is not None:
	_request_sentiment = retry(
		reraise=True,
		stop=stop_after_attempt(3),
		wait=wait_exponential(multiplier=0.5, max=4),
		retry=retry_if_exception_type(_GcpRetryableError),
	)(_request_sentiment)


@lru_cache(maxsize=4096)
def _cached_score(text: str) -> float | None:
	# Cache hits never reach here, so the budget is only consumed on real calls.
	if not _budget_available():
		return None
	try:
		score = _request_sentiment(text)
	except Exception:
		return None
	if score is not None:
		_increment_budget()
	return score


def score_with_gcp(text: str) -> float | None:
	"""Return a sentiment score in [-1, 1] from GCP NLP, or ``None`` to signal
	the caller to fall back to VADER only."""
	if requests is None:
		return None
	cleaned = (text or "").strip()
	if not cleaned:
		return None
	return _cached_score(cleaned[:MAX_CHARS])
