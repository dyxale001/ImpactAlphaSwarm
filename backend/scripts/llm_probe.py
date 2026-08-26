"""Exercise all three Groq call sites against the live model and report the token split.

Run this whenever GROQ_MODEL changes. It is the check that would have caught both the
llama-3.3 retirement and the reasoning-token overrun in one go, since it reports what
the app never used to log: finish_reason, and how much of the budget went on thinking
before the model wrote anything.

Exits non-zero if any call returns empty or hits the token budget, so it can gate a
deploy.

Usage:  venv/Scripts/python scripts/llm_probe.py backend
"""
import logging
import os
import sys

# The token split is the point of this script, and GroqClient logs it at INFO.
logging.basicConfig(level=logging.INFO, format="    %(message)s")

BACKEND = sys.argv[1] if len(sys.argv) > 1 else "."
sys.path.insert(0, BACKEND)
from dotenv import load_dotenv

load_dotenv(os.path.join(BACKEND, ".env"))
from src.utils.llm_client import EmptyCompletionError, GroqClient  # noqa: E402

# The real prompt builders, so this probes what the app actually sends rather than a
# paraphrase of it. A prompt that drifts is exactly what this should catch.
from src.utils.descriptions import (  # noqa: E402
    DESCRIPTIONS_BATCH_SIZE,
    _asset_prompt,
    _fund_prompt,
)

TICKERS = ["AAPL", "MSFT", "TSLA", "NVDA", "JPM", "XOM", "PFE", "KO", "BA", "DIS"]
NAMES = [
    "Apple Inc", "Microsoft", "Tesla", "Nvidia", "JPMorgan Chase",
    "Exxon Mobil", "Pfizer", "Coca-Cola", "Boeing", "Walt Disney",
]
FUNDS = [
    "Berkshire Hathaway", "Bridgewater Associates", "Renaissance Technologies",
    "Baillie Gifford", "Vanguard Group", "BlackRock", "State Street",
    "Fidelity Management", "Coatue Management", "Tiger Global",
]

failures: list[str] = []


def probe(label: str, client, prompt: str) -> None:
    if client is None:
        failures.append(f"{label}: no client (GROQ_API_KEY unset or init failed)")
        print(f"  {label}: NO CLIENT")
        return
    try:
        text = client.complete(prompt)
    except EmptyCompletionError as exc:
        failures.append(f"{label}: {exc}")
        print(f"  {label}: EMPTY OR TRUNCATED\n    {exc}")
        return
    except Exception as exc:
        failures.append(f"{label}: {type(exc).__name__}: {exc}")
        print(f"  {label}: ERROR {type(exc).__name__}: {exc}")
        return
    preview = " ".join(text.split())[:100]
    print(f"  {label}: OK, {len(text)} chars\n    {preview}...")


print(f"model: {os.getenv('GROQ_MODEL', GroqClient.DEFAULT_MODEL)}")
print(f"effort: {os.getenv('GROQ_REASONING_EFFORT', GroqClient.DEFAULT_EFFORT)}")
print("Per-call token detail is on the INFO logger; set LOG_LEVEL=INFO to see it.\n")

# 1. Reasoning trace. Budgets and temperatures mirror the call sites exactly; if one
#    changes there and not here the probe stops being evidence about production.
print("reasoning_trace (langgraph_orchestrator.py)")
probe(
    "one trace",
    GroqClient.create(purpose="probe_reasoning", max_tokens=2000, temperature=0.3),
    "Explain, in 1-2 sentences, why NVDA sits where it does in a list of assets shown "
    "to one user. Use British spelling and never use dashes as punctuation.\n"
    "Factors: momentum 0.81, news sentiment +0.42 across 14 articles, social sentiment "
    "+0.30 across 220 posts, all three signals agree.\n"
    "State what the measurements show. Do not give investment advice.",
)

# 2. Descriptions, at the batch size the nightly run actually uses. This is the call
#    that returned zero characters on a full budget before reasoning_effort was set.
print(f"\ndescriptions (descriptions.py, batch of {DESCRIPTIONS_BATCH_SIZE})")
desc_client = GroqClient.create(
    purpose="probe_descriptions", max_tokens=4000, temperature=0.3
)
probe(
    "asset batch",
    desc_client,
    _asset_prompt(
        [
            {"ticker": t, "name": n}
            for t, n in zip(TICKERS, NAMES)
        ][:DESCRIPTIONS_BATCH_SIZE]
    ),
)
probe(
    "fund batch",
    desc_client,
    _fund_prompt(
        [
            {"fund_key": f.lower().replace(" ", "_"), "fund_name": f}
            for f in FUNDS
        ][:DESCRIPTIONS_BATCH_SIZE]
    ),
)

# 3. Discovery. Classify is the demanding one: it spends most of its tokens reasoning
#    even at low effort, which is why this budget is 3000 and not the original 600.
print("\ndiscovery (asset_discovery.py)")
disc_client = GroqClient.create(
    purpose="probe_discovery", max_tokens=3000, temperature=0.2
)
probe(
    "gap fill",
    disc_client,
    "List 15 listed clean energy companies as a JSON array of ticker symbols only. "
    "Return only the array, no other text.",
)
probe(
    "classify",
    disc_client,
    "Classify each ticker into one sector. Return only a JSON object mapping ticker "
    "to sector.\nTickers: " + ", ".join(TICKERS),
)

print()
if failures:
    print(f"FAILED: {len(failures)} of the probes did not return usable text.")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("All probes returned usable text.")
