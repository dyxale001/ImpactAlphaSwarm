"""Macro / current-affairs news, tagged to investment universes.

World and market news from Finnhub's general feed, three pulls a day. Each article is
put to Jev (TypeSafe's decision model) as eight yes/no questions: is it
market-relevant, does it affect markets broadly, and does it directly concern each
universe. The probabilities are stored and shown in full; tags are what clears the
threshold.

Relevance, never direction, and nothing here feeds the ranking, the Signal Scorecard
or sentiment (D-223). Feature-flagged off by default — see ``config.py``. The plan,
including the validation runs that set the question wording and the threshold, is
``macro-news-plan.md`` in the repo root.
"""
