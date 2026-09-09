"""Probe Ask AlphaSwarm's actual Groq call sites (intent classifier, narrator,
external-knowledge grounding) against the live model, using the exact
budgets/prompts api.py uses. Same pattern as llm_probe.py.

Usage:  python scripts/ask_probe.py
"""
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="    %(message)s")

sys.path.insert(0, ".")
from dotenv import load_dotenv

load_dotenv(".env")
from src.utils.llm_client import EmptyCompletionError, GroqClient  # noqa: E402

failures: list[str] = []


def probe(label, client, prompt):
    if client is None:
        failures.append(f"{label}: no client")
        print(f"  {label}: NO CLIENT")
        return None
    try:
        text = client.complete(prompt)
    except EmptyCompletionError as exc:
        failures.append(f"{label}: {exc}")
        print(f"  {label}: EMPTY OR TRUNCATED\n    {exc}")
        return None
    except Exception as exc:
        failures.append(f"{label}: {type(exc).__name__}: {exc}")
        print(f"  {label}: ERROR {type(exc).__name__}: {exc}")
        return None
    safe = text.encode("ascii", "replace").decode("ascii")
    print(f"  {label}: OK, {len(text)} chars -> {safe!r}")
    return text


print(f"model: {os.getenv('GROQ_MODEL', GroqClient.DEFAULT_MODEL)}")
print(f"effort: {os.getenv('GROQ_REASONING_EFFORT', GroqClient.DEFAULT_EFFORT)}\n")

CLASSIFY_PROMPT_TMPL = (
    "Classify the user question into exactly one label, output ONLY the "
    "label, nothing else:\n"
    "ASSET_SEARCH - looking for a LIST of assets/tickers by sector or universe\n"
    "USER_DATA_SEARCH - asking about their own watchlist or latest analysis run\n"
    "ANALYSIS_EXPLANATION - asking about ONE specific company/asset, by name or "
    "ticker: its ranking, score, sentiment, risk, quant metrics, or general info "
    "('tell me about X', 'why does X rank high', 'sentiment on X', 'is X risky')\n"
    "LEARNING_QUESTION - asking what a financial or technical term/concept means "
    "('what is beta', 'explain RSI', 'what does X mean', 'what is a UFT')\n"
    "PLATFORM_QUESTION - asking how AlphaSwarm ITSELF works or calculates something "
    "('how does AlphaSwarm calculate Signal Score', 'how does the ranking work')\n"
    "UNSUPPORTED_FINANCIAL_ADVICE - asking for a prediction or buy/sell/hold advice\n"
    "UNKNOWN - anything else\n\n"
    "Question: {q}\nLabel:"
)

INTENT_TOKENS = 200
NARR_TOKENS = 350

intent_client = GroqClient.create(purpose="probe_ask_intent", max_tokens=INTENT_TOKENS, temperature=0)
narr_client = GroqClient.create(purpose="probe_ask_narration", max_tokens=NARR_TOKENS, temperature=0)

print(f"1. Intent classifier (max_tokens={INTENT_TOKENS})")
for q in [
    "Tell me about NVIDIA",
    "Why does NVDA rank highly?",
    "What is beta?",
    "Should I buy NVDA?",
    "Explain what a UFT is",
    "How does AlphaSwarm calculate Signal Score?",
    "What is diversification?",
]:
    probe(f"classify({q!r})", intent_client, CLASSIFY_PROMPT_TMPL.format(q=q))

print(f"\n2. Narrator (max_tokens={NARR_TOKENS})")
system = (
    "You are AlphaSwarm.\n\nExplain only the AlphaSwarm data provided to you.\n\n"
    "Rules:\n1. Never invent financial data.\n2. Never invent scores, rankings, "
    "prices, metrics, or analysis.\n3. Never make predictions.\n4. Never provide "
    "personalised financial advice.\n5. Never tell the user what to buy, sell, or "
    "hold.\n6. If the retrieved data only partially answers the question, explain "
    "the relevant information that IS available rather than refusing.\n7. Do not "
    "claim unavailable information exists.\n8. Do not use external knowledge.\n"
    "9. Keep the answer concise.\n"
    '10. End with:\n"This is informational only — not financial advice."'
)
data = "{'ticker': 'NVDA', 'name': 'NVIDIA Corporation', 'rank': 1, 'confidence_score': 82.0, 'signal_strength': 0.82, 'convergence': 0.76}"
probe(
    "narrate(NVDA ranking)",
    narr_client,
    f"{system}\n\nUSER QUESTION:\nWhy does NVDA rank highly?\n\nALPHASWARM DATA:\n{data}",
)

print(f"\n3. External-knowledge grounding (max_tokens={NARR_TOKENS})")
ground_prompt = (
    "Answer the user's question using ONLY the supplied source material.\n"
    "Do not use your pretrained knowledge to add facts that are not supported by "
    "the source.\nDo not infer unsupported facts.\nIf the supplied source does not "
    "contain enough information to answer the question reliably, say so rather "
    "than guessing.\nDo not provide investment recommendations.\nThis is an "
    "educational explanation, not personalised financial advice.\nKeep the answer "
    "concise. Do not mention the source in your answer — it is shown separately.\n\n"
    "USER QUESTION:\nWhat is diversification?\n\n"
    "SOURCE MATERIAL:\nDiversification means spreading investments across "
    "different assets, sectors, or geographies so that a single investment's poor "
    "performance has a smaller effect on the overall portfolio. It reduces "
    "exposure to any one company or sector, though it does not eliminate "
    "market-wide risk."
)
probe("ground(diversification)", narr_client, ground_prompt)

print()
if failures:
    print(f"FAILED: {len(failures)} probe(s) did not return usable text.")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("All probes returned usable text.")
