"""The default Groq model, in one place.

It used to be a literal repeated across the orchestrator, the discovery agent and
the description writer. When Groq retired ``llama-3.3-70b-versatile`` in June 2026
that single retirement broke reasoning traces, discovery validation and company
descriptions at once, and each had to be found separately. One constant means the
next retirement is a one line change.

``GROQ_MODEL`` still overrides it everywhere, so a model can be swapped on a
running service without a deploy.

On the current choice: gpt-oss models spend tokens on internal reasoning before
they answer, and those count against ``max_tokens``. Callers need more headroom
than they did with Llama, which wrote its answer straight out. The other
replacement Groq suggests, ``qwen/qwen3.6-27b``, is deliberately not used: it
emits its ``<think>`` reasoning inside the message body, which would land in
user-facing copy.
"""

from __future__ import annotations

# Kept as a bare module constant rather than a class: it is a value, and every
# consumer wants it at import time to build its own client.
#
# 20b over 120b, chosen on the output rather than the size. On a reasoning trace
# the smaller model wrote the more specific sentence, and it holds up on the
# structured prompts discovery depends on: a bare JSON array of tickers and a
# ticker-to-sector object, both returned unfenced and parseable. It is also twice
# as fast and half the price, which for two sentence answers is all upside.
GROQ_DEFAULT_MODEL = "openai/gpt-oss-20b"
