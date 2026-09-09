"""Tests for the funds copy catalogue and the forbidden-term scan.

The claim being defended is the legal one. The product is not a licensed
financial services provider, so a fund match may describe a filter over
published labels and may not read as a proposal, a ranking or a promise. That
distinction exists only in wording, so it needs a test rather than good
intentions — and the same scan runs over generated prose at request time, which
means this file also proves the guard works before anything relies on it.

The second claim is that the scan is precise. A check that flagged "safety" or
"buyer" would be turned off within a week, and a check that missed "outperformed"
or "we recommend" would be worthless.

No Supabase, no network.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds import copy  # noqa: E402
from src.funds.copy import FORBIDDEN_TERMS, all_strings, find_forbidden_terms  # noqa: E402


class TestTheScanCatchesWhatItMustCatch:
    """INVARIANT: every term on the list is detected, in every inflection used."""

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("We recommend this fund.", "recommend"),
            ("Our recommendation for the quarter.", "recommend"),
            ("A recommended holding.", "recommend"),
            ("This fund is suitable.", "suitable"),
            ("Suitability depends on your answers.", "suitable"),
            ("You should hold this for five years.", "should"),
            ("The best fund in its category.", "best"),
            ("Our top pick this month.", "top pick"),
            ("Our top picks this month.", "top pick"),
            ("An ideal starting point.", "ideal"),
            ("Ideally you would hold both.", "ideal"),
            ("It outperformed its benchmark.", "outperform"),
            ("Consistent outperformance.", "outperform"),
            ("Where to buy this fund.", "buy"),
            ("Buying is done on the platform.", "buy"),
            ("Buys are settled the next day.", "buy"),
            ("The units were bought yesterday.", "buy"),
            ("Ideally you would hold both.", "ideal"),
            ("A safe place for your money.", "safe"),
            ("The safest option here.", "safe"),
            ("A safer choice.", "safe"),
            ("Returns are guaranteed.", "guaranteed"),
            ("We guarantee the capital.", "guaranteed"),
            ("This fund is for you.", "for you"),
            ("Picked for you by our team.", "for you"),
        ],
    )
    def test_a_forbidden_phrase_is_found(self, text, expected):
        assert expected in find_forbidden_terms(text)

    def test_detection_is_case_insensitive(self):
        assert find_forbidden_terms("WE RECOMMEND THE BEST FUND") == ["recommend", "best"]

    def test_every_listed_term_has_a_pattern(self):
        # A term added to the list without a pattern would be silently unpoliced.
        assert len(copy._FORBIDDEN_PATTERNS) == len(FORBIDDEN_TERMS)
        assert [term for term, _ in copy._FORBIDDEN_PATTERNS] == list(FORBIDDEN_TERMS)

    def test_findings_come_back_in_list_order(self):
        found = find_forbidden_terms("guaranteed, recommended, and the best")
        assert found == ["recommend", "best", "guaranteed"]


class TestTheScanIsPrecise:
    """INVARIANT: words that merely contain a forbidden term are not flagged.

    REGRESSION GUARD: a scan with false positives is a scan someone disables.
    """

    @pytest.mark.parametrize(
        "text",
        [
            "Read about fund safety on the manager's site.",
            "The buyer's own research matters.",
            "Bestow is a fund manager name.",
            "This is information, not advice.",
            "Charges reduce what you earn.",
            "Shoulder the risk yourself.",
            "Idealism is not a strategy.",
            "Performance is reported by the manager.",
        ],
    )
    def test_a_near_miss_is_not_flagged(self, text):
        assert find_forbidden_terms(text) == []

    def test_the_word_you_is_not_banned(self):
        # Only "for you" as a predicate is. The copy has to be able to say what
        # the user told us.
        assert find_forbidden_terms("you told us your risk profile is Conservative") == []


class TestTheShippedCopy:
    """INVARIANT: nothing this module can put on screen breaks the line."""

    def test_no_shipped_string_contains_a_forbidden_term(self):
        offenders = {}
        for text in all_strings():
            found = find_forbidden_terms(text)
            if found:
                offenders[text[:70]] = found
        assert offenders == {}

    def test_the_scan_actually_saw_the_strings(self):
        # Guards the test above: an all_strings() that yielded nothing would
        # make it pass while policing nothing.
        rendered = list(all_strings())
        assert len(rendered) > 25
        assert all(isinstance(text, str) and text.strip() for text in rendered)

    def test_templates_are_rendered_not_scanned_raw(self):
        # The scan has to see finished sentences: a forbidden word can arrive
        # through a template's fixed text as easily as through a constant.
        assert not any("{" in text for text in all_strings())

    def test_the_match_reason_says_what_it_is_not(self):
        # PINNED VALUE: the disclaimer inside the match sentence is the point of
        # the sentence, not decoration.
        assert "This is information, not advice." in copy.MATCH_REASON
        assert "Read the fact sheet before deciding." in copy.MATCH_REASON

    def test_the_match_reason_names_its_sources(self):
        for field in ("{manco}", "{risk_label}", "{category}", "{as_of}", "{risk_tolerance}"):
            assert field in copy.MATCH_REASON, field

    def test_the_footer_states_the_licence_position(self):
        assert "not a licensed financial services provider" in copy.FOOTER_NOT_LICENSED
        assert "Minimum Disclosure Document" in copy.FOOTER_NOT_LICENSED

    def test_the_inclusion_rule_is_stated_and_excludes_performance(self):
        # "Why these funds" has to be answerable from the page, and the answer
        # must not be past returns.
        #
        # The rule is recognition rather than fund size for now, which is the
        # weaker of the two: it cannot be checked against a published figure the
        # way "largest by fund size" could. So the copy carries two admissions
        # the size rule did not need, and they are asserted rather than trusted
        # to survive an edit — that the list is partial, and that being on it is
        # not a judgement about the fund.
        assert "recognise" in copy.INCLUSION_RULE
        assert "partial" in copy.INCLUSION_RULE
        assert "not a judgement" in copy.INCLUSION_RULE
        assert "alphabetical" in copy.INCLUSION_RULE.lower()
        assert "past returns" in copy.INCLUSION_RULE

    def test_the_inclusion_rule_no_longer_claims_to_rank_by_size(self):
        """The old rule said "the largest funds by fund size", and a seed of
        well-known names is not that. A page that kept the claim would be
        describing a rule the catalogue does not follow."""
        assert "fund size" not in copy.INCLUSION_RULE
        assert "largest" not in copy.INCLUSION_RULE

    def test_the_header_answers_market_and_currency(self):
        assert "rand" in copy.HEADER_STRIP.lower()
        assert "not converted" in copy.HEADER_STRIP.lower()

    def test_the_disclaimer_avoids_the_industry_wording_it_replaces(self):
        # The standard phrasing is "should be considered a medium to long-term
        # investment"; the same fact is stated without the banned word.
        assert "medium- to long-term" in copy.CIS_DISCLAIMER
        assert find_forbidden_terms(copy.CIS_DISCLAIMER) == []

    def test_there_is_a_note_for_a_fund_with_no_published_label(self):
        assert "does not publish" in copy.NO_PUBLISHED_RISK_LABEL

    def test_every_purpose_answer_has_a_clause(self):
        assert set(copy.GOALS_CLAUSE_PURPOSE) == {"emergency_fund", "goal", "growth", "income"}

    def test_every_vehicle_has_a_note(self):
        assert set(copy.VEHICLE_NOTE) == {"unit_trust", "etf"}

    def test_every_rule_has_a_plain_sentence(self):
        # The explanation names rules in the user's terms, so a rule without a
        # note would surface its internal name on screen.
        for rule in ("risk_ceiling", "category", "horizon", "purpose", "eligibility", "skipped_no_goals"):
            assert rule in copy.RULE_NOTES, rule
            assert copy.RULE_NOTES[rule].strip()
