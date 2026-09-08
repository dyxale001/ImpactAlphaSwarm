"""Live probe: confirms the Learning Centre relevance-weighting fix against
the REAL Learning Centre content (not a fixture) plus the required controls.
Real Groq + real Supabase."""
import asyncio
import sys

sys.path.insert(0, ".")
from dotenv import load_dotenv

load_dotenv(".env")

import src.api as api  # noqa: E402


async def _fake_auth(_a):
    return "cccccccc-cccc-cccc-cccc-cccccccccccc"


api._get_user_id_from_bearer = _fake_auth


async def ask(q):
    resp = await api.ask_alphaswarm(api.AskRequest(query=q), authorization="Bearer x")
    safe = resp.narration.encode("ascii", "replace").decode("ascii")
    print(f"\n--- {q!r} ---")
    print(f"intent={resp.intent} source={resp.source} is_blocked={resp.is_blocked}")
    print(f"narration: {safe[:300]}")
    if resp.sources:
        print(f"sources: {[(s.title, s.url) for s in resp.sources]}")


async def main():
    for q in [
        "How does inflation affect South African markets?",
        "What is the JSE?",
        "What does SARB do?",
        "What is the repo rate?",
        "What is beta?",
        "What is SPY?",
        "What is the S&P 500?",
    ]:
        try:
            await ask(q)
        except Exception as e:
            print(f"\n--- {q!r} ---\nERROR: {type(e).__name__}: {e}")


asyncio.run(main())
