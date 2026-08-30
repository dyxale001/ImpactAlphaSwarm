"""Tests for the house style pass over generated prose.

The claim being defended is that a reasoning trace never reaches the user with a
dash used as punctuation, whatever the model actually wrote. The second claim
matters as much as the first: a hyphen inside a compound word is not punctuation
and must survive untouched.

Nothing external is touched; the pass is pure text.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.gr_reasoningtracestyle import HOUSE_STYLE  # noqa: E402

DASHES = ("—", "–", "―", "‒")


def test_an_em_dash_becomes_a_comma():
	out = HOUSE_STYLE.apply(
		"AAPL sits here because the two signals disagree — the price data is "
		"positive while the news tone is not."
	)

	assert not any(d in out for d in DASHES)
	assert "disagree, the price data" in out


def test_every_dash_character_the_model_reaches_for_is_covered():
	for dash in DASHES:
		out = HOUSE_STYLE.apply(f"Thin evidence {dash} only two articles were found.")
		assert out == "Thin evidence, only two articles were found."


def test_a_spaced_hyphen_is_punctuation_but_a_compound_word_is_not():
	out = HOUSE_STYLE.apply("The fit is lower - it is more volatile than the risk-averse profile.")

	assert out == "The fit is lower, it is more volatile than the risk-averse profile."


def test_a_unicode_hyphen_inside_a_word_folds_to_a_plain_one():
	out = HOUSE_STYLE.apply("MSFT is a cloud‑based business.")

	assert out == "MSFT is a cloud-based business."


def test_a_dash_after_a_comma_does_not_double_the_comma():
	out = HOUSE_STYLE.apply("Evidence is thin, — and the signals disagree.")

	assert ", ," not in out
	assert out == "Evidence is thin, and the signals disagree."


def test_a_dash_before_a_full_stop_leaves_no_stray_comma():
	assert HOUSE_STYLE.apply("The signals agree — .") == "The signals agree."


def test_a_leading_bullet_dash_is_dropped():
	assert HOUSE_STYLE.apply("- NVDA places first on price data.") == (
		"NVDA places first on price data."
	)


def test_a_clean_trace_is_returned_unchanged():
	trace = "MSFT places here because the price data and the news tone broadly agree."

	assert HOUSE_STYLE.apply(trace) == trace


def test_unusable_input_comes_back_empty():
	assert HOUSE_STYLE.apply(None) == ""
	assert HOUSE_STYLE.apply("   ") == ""
