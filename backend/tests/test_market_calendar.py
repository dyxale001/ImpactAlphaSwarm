"""Tests for the NYSE closure table behind the day summary prompt.

The claims here are all calendar facts, so every date is checked against a real one:
2026-11-26 is the Thursday of Thanksgiving, the 25th is the Wednesday before it, and the
28th and 29th are that weekend. 2026-07-04 falls on a Saturday, which is why the market
shuts on Friday the 3rd instead.

The table is duplicated in ``frontend/src/utils/marketHours.ts`` and covered there by
``frontend/src/components/research/sentimentDays.test.ts``. The two describe the same
calendar and are extended together; if these dates change, those do too.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.market_calendar import MarketCalendar  # noqa: E402

calendar = MarketCalendar()


def test_a_weekday_holiday_is_named():
	closure = calendar.closure("2026-11-26")

	assert closure is not None
	assert closure.kind == "holiday"
	assert closure.name == "Thanksgiving"


def test_the_observed_suffix_survives():
	"""It is the honest answer to "why is the market shut on the 3rd of July", and the
	chart writes this name up the column."""
	closure = calendar.closure("2026-07-03")

	assert closure is not None
	assert closure.name == "Independence Day (observed)"


def test_saturday_and_sunday_are_named_by_their_own_day_names():
	saturday = calendar.closure("2026-11-28")
	sunday = calendar.closure("2026-11-29")

	assert saturday is not None and saturday.kind == "weekend"
	assert saturday.name == "Saturday"
	assert sunday is not None and sunday.name == "Sunday"


def test_an_ordinary_trading_day_is_not_a_closure():
	assert calendar.closure("2026-11-25") is None


def test_weekends_survive_a_year_the_holiday_table_does_not_reach():
	"""Weekends are computed rather than listed, so they outlive the table. 2035-01-06
	is a Saturday."""
	assert calendar.holidays_known_for("2035-01-06") is False
	closure = calendar.closure("2035-01-06")

	assert closure is not None
	assert closure.name == "Saturday"


def test_an_unlisted_year_claims_no_holiday_rather_than_guessing():
	"""Christmas 2035 is a Tuesday and the market is certainly shut, but the table does
	not reach it. Saying nothing is the safe direction to be wrong in: inventing the
	entry would have the summary explain a day from a rule it never verified."""
	assert calendar.holiday_name("2035-12-25") is None
	assert calendar.closure("2035-12-25") is None


def test_a_malformed_day_key_is_not_a_closure_and_does_not_raise():
	assert calendar.closure("not-a-date") is None
	assert calendar.holiday_name("not-a-date") is None
	assert calendar.holidays_known_for("not-a-date") is False
