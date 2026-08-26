"""One Groq chat client for every LLM call in the backend.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


class EmptyCompletionError(RuntimeError):
    """The model returned no usable text.

    Raised for a blank reply and for one cut short by the token budget, since a trace
    that stops mid-sentence and a JSON object missing its closing brace are both
    unusable in the same way a blank one is.
    """


class GroqClient:

    DEFAULT_MODEL = "openai/gpt-oss-20b"
    DEFAULT_EFFORT = "low"

    def __init__(self, llm, *, purpose: str, model: str) -> None:
        self._llm = llm
        self._purpose = purpose
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    @classmethod
    def create(
        cls, *, purpose: str, max_tokens: int, temperature: float
    ) -> Optional["GroqClient"]:
        """Build a client, or return None when Groq is unconfigured.

        ``purpose`` is a short label naming the call site. It appears in every log
        line, which is what makes it possible to tell which of the three consumers is
        failing without reading a stack trace.
        """
        key = os.getenv("GROQ_API_KEY")
        if not key:
            return None

        model = os.getenv("GROQ_MODEL", cls.DEFAULT_MODEL)
        kwargs = {
            "api_key": key,
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        effort = os.getenv("GROQ_REASONING_EFFORT", cls.DEFAULT_EFFORT).strip().lower()
        if effort and effort != "none":
            kwargs["reasoning_effort"] = effort
            kwargs["reasoning_format"] = "hidden"

        try:
            from langchain_groq import ChatGroq

            llm = ChatGroq(**kwargs)
        except Exception as exc:
            logger.warning("Groq init failed for %s: %s", purpose, exc)
            return None

        logger.info(
            "Groq client ready for %s: model=%s max_tokens=%d effort=%s",
            purpose,
            model,
            max_tokens,
            effort or "none",
        )
        return cls(llm, purpose=purpose, model=model)

    def complete(self, prompt: str) -> str:
        """Return the model's reply, or raise.

        Raises ``EmptyCompletionError`` on a blank or truncated reply, and whatever the
        client library raises on a transport or API error. Both are failures; callers
        that have a fallback should catch broadly rather than distinguish them.
        """
        from langchain_core.messages import HumanMessage

        response = self._llm.invoke([HumanMessage(content=prompt)])
        content = (response.content or "").strip()
        finish = (response.response_metadata or {}).get("finish_reason")
        usage = getattr(response, "usage_metadata", None) or {}
        reasoning_tokens = (usage.get("output_token_details") or {}).get("reasoning")

        # This sees a budget being eaten by thinking before it runs out.
        logger.info(
            "Groq %s: model=%s finish=%s output_tokens=%s reasoning_tokens=%s chars=%d",
            self._purpose,
            self._model,
            finish,
            usage.get("output_tokens"),
            reasoning_tokens,
            len(content),
        )

        if not content:
            raise EmptyCompletionError(
                f"{self._purpose}: {self._model} returned no content "
                f"(finish_reason={finish}, reasoning_tokens={reasoning_tokens}). "
                "The token budget was most likely spent on reasoning."
            )
        if finish == "length":
            raise EmptyCompletionError(
                f"{self._purpose}: {self._model} hit the token budget after "
                f"{len(content)} characters (reasoning_tokens={reasoning_tokens}). "
                "The reply is truncated and cannot be used."
            )
        return content
