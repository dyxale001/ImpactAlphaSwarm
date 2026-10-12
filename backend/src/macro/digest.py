"""The short overview at the top of each sector on the Market News page.

Jev returns numbers, never words, so a reader faced with thirteen Finance stories has to
work out what they add up to. This writes two or three sentences per sector, and one for
market-wide news, from the stories tagged to it: the summary layer above the evidence.

Written at pull time, not on request, and only when a sector's set of tagged stories has
changed since its last overview: at most seven calls a pull, usually fewer. A failed
generation stores nothing, so the next pull tries again.

The rules are the drivers paragraph's, tightened for a page that must not advise:
only what the listed stories report, no direction (good or bad for the sector), no
prediction, no buy/sell/hold. The prompt says so, and a guard rejects a reply that
uses the words those rules exist to keep out, because a 20b model follows instructions
unevenly and a stored paragraph renders for every reader until the next one replaces it.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional, Sequence

from ..utils.gr_reasoningtracestyle import HOUSE_STYLE
from ..utils.llm_client import GroqClient
from .config import MACRO_DIGEST_FALLBACK_KEY_ENV, MACRO_DIGEST_KEY_ENV
from .universes import MARKET_WIDE, NEWS_RULES

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DigestStory:
    publisher: str
    published_at: datetime
    headline: str
    blurb: str


def _words(text: str) -> str:
    return re.sub(r"[^\w%]+", " ", text.lower()).strip()


#: Stock-tip and trading-idea pieces: a TV host's picks, a newsletter's "how to play the
#: stock", options trades said to point to gains. They can be relevant to a sector and
#: stay in the feed as evidence, but an overview that relays them reads as advice, and
#: the model drops the attribution often enough that telling it to keep it is not enough.
#: So they never reach the prompt.
#: Judged on the headline alone: a newsletter's headline can still carry real news
#: ("Plus, Lilly's mixed obesity drug trial data"), and only its blurb is boilerplate.
TIP_PATTERN = re.compile(
    r"\b(jim cramer|cramer's|how to play|options? (volume|trades?|bets?)|"
    r"trades? that just happened|stock picks?|top 10 things to watch)\b",
    re.IGNORECASE,
)

#: Newsletter boilerplate standing in for a summary ("Every weekday, the Investing Club
#: releases the Homestretch..."). Dropped so the model works from the headline instead.
BOILERPLATE_PATTERN = re.compile(r"\b(investing club|homestretch|morning meeting)\b", re.IGNORECASE)


def is_commentary(headline: str) -> bool:
    """A stock tip or trading idea rather than a news event, judged on the headline."""
    return bool(TIP_PATTERN.search(headline or ""))


def is_stock_tip(story: "DigestStory") -> bool:
    return is_commentary(story.headline)


def without_boilerplate(story: "DigestStory") -> "DigestStory":
    if story.blurb and BOILERPLATE_PATTERN.search(story.blurb):
        return DigestStory(story.publisher, story.published_at, story.headline, "")
    return story


class MacroDigestPromptBuilder:
    """The prompt for one sector's overview. Pure, no I/O."""

    #: Stories shown to the model, most relevant first. Enough to see the storylines,
    #: few enough that the paragraph is about the week rather than a list of it.
    MAX_STORIES = 8

    def build(self, group: str, stories: Sequence[DigestStory], total: int) -> str:
        if group == MARKET_WIDE:
            subject = "news that affects markets broadly, across many sectors at once"
            about = "the markets as a whole"
        else:
            subject = f"the {group} sector ({NEWS_RULES[group].concern})"
            about = f"the {group} sector"
        shown = list(stories)[: self.MAX_STORIES]
        listed = "\n".join(self._line(i, s) for i, s in enumerate(shown, start=1))
        more = (
            f"\nThese are the {len(shown)} most relevant of {total} stories tagged this week."
            if total > len(shown)
            else ""
        )
        return f"""You are writing a short overview for the Market News page of a retail investing app, for someone new to investing. A classifier tagged the stories below as relevant to {subject}.

Stories, most relevant first:
{listed}{more}

Write one short sentence per storyline, at most three sentences and no more than 70 words in total, as one paragraph with no heading, no bullet points and no title. If there are more than three storylines, cover the three most relevant and leave the rest out. One storyline means one sentence: never pad to fill space. Never join clauses with semicolons.

Cover the main storylines in plain words. Group stories that tell the same story into one, and name the publisher behind the most relevant one.

Rules you must follow:
- Use ONLY the stories listed above. If something is not in them, it does not go in.
- Explain in your own words. Do not repeat headlines word for word.
- Where a story has no summary, work from its headline alone and do not guess at what it said beyond it.
- Never add detail that a headline or summary does not state, such as why a result came out as it did or what it means.
- Describe events and announcements only. Leave out stock tips, trading ideas and commentators' views on particular stocks, such as a television host's pick or an options trade said to point to gains.
- Ignore any text describing the newsletter, show or briefing a story came from, and never describe an article itself (what it highlights, covers or focuses on).
- If a headline calls something mixed, strong or weak, use that word and do not explain how or why.
- Never describe news as good, bad, positive or negative, even when a headline does.
- Do not end with a sentence that sums up a trend or says what the stories show.
- Never say whether the news is good or bad for {about}, for any company or for investors. Describe what was reported, not its effect.
- Never predict what prices, markets or companies will do next.
- Never tell the reader to buy, sell or hold anything, and never call anything an opportunity or a risk for investors.
- If the stories are only loosely connected to {about}, say so plainly.
- Write British English, in a plain, level voice. No hype, and no openers like "Overall", "In summary" or "This week".
- Never use a dash of any kind as punctuation. Use a comma, a full stop or a rewrite.
- Plain prose only. No markdown, no quotation marks around the paragraph.

Write only the paragraph itself."""

    @staticmethod
    def _line(i: int, s: DigestStory) -> str:
        day = s.published_at.strftime("%a %d %b").replace(" 0", " ")
        line = f"[{i}] {s.publisher}, {day}: {s.headline}"
        # A Reuters "summary" is the headline again; only a real one is worth the tokens.
        if s.blurb and not _words(s.blurb).startswith(_words(s.headline)[:40]):
            line += f"\n    Summary: {s.blurb}"
        return line


class MacroDigestGenerator:
    """One paragraph per call, or None. Never raises."""

    PURPOSE = "macro_digest"
    MAX_TOKENS = 900
    #: Low on purpose: the job is restating, and every point of temperature above this
    #: bought invented detail in testing ("varied efficacy across patient groups").
    TEMPERATURE = 0.15
    RETRIES = 2
    #: Long enough for a per-minute rate limit to clear: the likeliest failure on a
    #: free-tier key is a 429 from the token-per-minute window, which a one-second
    #: wait just hits again. Nobody waits on a pull, so the time is free.
    BACKOFF_SECONDS = (10.0, 30.0)
    MIN_CHARS = 40
    MAX_CHARS = 600

    #: Words the rules forbid, checked after generation. Matching any discards the
    #: paragraph: a missing overview is a small loss, an advisory one is not.
    FORBIDDEN = re.compile(
        r"\b(buy|buying|sell|selling|recommend\w*|bullish|bearish|good news|bad news|"
        r"upside|downside|tailwinds?|headwinds?|opportunit\w*|actionable|encouraging|favourable|unfavourable|"
        r"positive news|negative news|(the|these|both) stories (show|suggest|highlight|indicate|point)|"
        r"growing interest|"
        r"investors should|you should|"
        r"will (rise|fall|drop|climb|surge|plunge|rally|slump|soar|tumble))\b",
        re.IGNORECASE,
    )

    def __init__(self, client: Any | None = None, builder: MacroDigestPromptBuilder | None = None):
        self.builder = builder or MacroDigestPromptBuilder()
        self._client = client
        self._client_built = client is not None

    @property
    def client(self):
        if not self._client_built:
            self._client_built = True
            self._client = GroqClient.create(
                purpose=self.PURPOSE,
                max_tokens=self.MAX_TOKENS,
                temperature=self.TEMPERATURE,
                key_env=MACRO_DIGEST_KEY_ENV,
                fallback_key_env=MACRO_DIGEST_FALLBACK_KEY_ENV,
            )
        return self._client

    @property
    def model(self) -> Optional[str]:
        client = self.client
        return getattr(client, "model", None) if client else None

    def generate(self, group: str, stories: Sequence[DigestStory], total: int) -> Optional[str]:
        client = self.client
        stories = [without_boilerplate(s) for s in stories if not is_stock_tip(s)]
        if client is None or not stories:
            return None
        prompt = self.builder.build(group, stories, total)
        text = self._complete(client, group, prompt)
        problem = None if text is None else self.problem(text)
        if problem is not None and text is not None:
            # The model breaks a rule now and then rather than always, so it gets one more
            # go, told which rule, before the overview is given up on: a missing overview is
            # the worse outcome, but never worse than an advisory one.
            logger.info("Macro digest for %s retried: %s", group, problem)
            text = self._complete(client, group, f"{prompt}\n\nYour last answer broke a rule: {problem}. Rewrite it.")
        return None if text is None else self.validate(group, text)

    def _complete(self, client, group: str, prompt: str) -> Optional[str]:
        for attempt in range(self.RETRIES + 1):
            try:
                return HOUSE_STYLE.apply(client.complete(prompt)).strip()
            except Exception as exc:
                if attempt >= self.RETRIES:
                    logger.warning("Macro digest for %s failed after %d attempts: %s", group, attempt + 1, exc)
                    return None
                time.sleep(self.BACKOFF_SECONDS[min(attempt, len(self.BACKOFF_SECONDS) - 1)])
        return None

    def problem(self, text: str) -> Optional[str]:
        """What is wrong with a reply, in words the model can act on, or None."""
        text = text.strip()
        if len(text) < self.MIN_CHARS:
            return "it was too short to be a paragraph"
        if len(text) > self.MAX_CHARS:
            return "it was too long; use at most 50 words and three short sentences"
        hit = self.FORBIDDEN.search(text)
        if hit:
            return f'it used "{hit.group(0)}", which judges the news, advises or predicts; leave that out'
        return None

    def validate(self, group: str, text: str) -> Optional[str]:
        problem = self.problem(text)
        if problem:
            logger.info("Macro digest for %s discarded: %s", group, problem)
            return None
        return text.strip()
