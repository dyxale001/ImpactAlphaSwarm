"""When the US market is shut, and what to call the day it is shut for.

The sentiment window is seven consecutive calendar days, not five trading ones, so two
rows in seven are a weekend and occasionally a third is a public holiday. Those days are
reliably the quietest in the window, and nothing in the figures says why: a Thursday in
late November with no posts looks exactly like an asset everyone stopped talking about.

That gap mattered in two places, which is why this is one table rather than two:

  * The day summary prompt. The model was shown a week of rows, some of them empty, and
    was never told which were closures. It is the same failure mode the "nothing
    collected" phrasing already guards against, one step further out: a gap it cannot
    explain becomes a finding it invents.
  * The trend chart, which washes closed columns and writes the reason up them. That
    lives in the frontend's own copy of this table, at
    ``frontend/src/utils/marketHours.ts``. The two tables are duplicated deliberately,
    because the chart cannot call this and this cannot call the chart, but they describe
    the same calendar and must be extended together or the chart and the paragraph under
    it will disagree about the same day.

Dates are NYSE closures in New York local time, and the keys the callers pass are UTC
calendar days. Both are plain calendar labels here and a holiday is a whole day rather
than an instant, so "2026-11-26" means Thanksgiving to both without a conversion.

Verify against nyse.com/markets/hours-calendars when extending. Half days are not listed:
the market does trade on them, so they carry data and need no explanation.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass


@dataclass(frozen=True)
class MarketClosure:
	"""Why the market was shut on a day, and what to call it."""

	#: "weekend" or "holiday".
	kind: str
	#: "Saturday", "Thanksgiving", "Independence Day (observed)".
	name: str


class MarketCalendar:
	"""The NYSE trading calendar, as far as it is known.

	Hardcoded because there is no free holiday feed worth a network call for this, and a
	summary that treats Christmas as a collapse in interest is worse than one that is
	occasionally silent about a holiday it has not been told about.
	"""

	#: Full closures by year, then by ISO date, to the name of the holiday.
	FULL_CLOSURES: dict[int, dict[str, str]] = {
		2026: {
			"2026-01-01": "New Year's Day",
			"2026-01-19": "Martin Luther King Jr. Day",
			"2026-02-16": "Washington's Birthday",
			"2026-04-03": "Good Friday",
			"2026-05-25": "Memorial Day",
			"2026-06-19": "Juneteenth",
			# The 4th is a Saturday.
			"2026-07-03": "Independence Day (observed)",
			"2026-09-07": "Labor Day",
			"2026-11-26": "Thanksgiving",
			"2026-12-25": "Christmas",
		},
		2027: {
			"2027-01-01": "New Year's Day",
			"2027-01-18": "Martin Luther King Jr. Day",
			"2027-02-15": "Washington's Birthday",
			"2027-03-26": "Good Friday",
			"2027-05-31": "Memorial Day",
			# The 19th is a Saturday.
			"2027-06-18": "Juneteenth (observed)",
			# The 4th is a Sunday.
			"2027-07-05": "Independence Day (observed)",
			"2027-09-06": "Labor Day",
			"2027-11-25": "Thanksgiving",
			# The 25th is a Saturday.
			"2027-12-24": "Christmas (observed)",
		},
	}

	#: ``date.weekday()`` is Monday 0 through Sunday 6.
	WEEKEND_NAMES: dict[int, str] = {5: "Saturday", 6: "Sunday"}

	def holidays_known_for(self, day: str) -> bool:
		"""Whether the table covers the year this day falls in.

		A caller that needs to tell "trading day" from "we have not been told" asks this.
		Nothing currently has to: the summary simply says less about an unlisted year,
		which is the safe direction to be wrong in.
		"""
		return self._year(day) in self.FULL_CLOSURES

	def holiday_name(self, day: str) -> str | None:
		"""The holiday closing this day, or None if it is not a listed closure."""
		year = self._year(day)
		if year is None:
			return None
		return self.FULL_CLOSURES.get(year, {}).get(day)

	def closure(self, day: str) -> MarketClosure | None:
		"""Why this day was shut, or None on an ordinary trading day.

		Holiday is checked first. Listed closures are always weekdays, because a holiday
		falling at a weekend is observed on a neighbouring one, so the two cannot collide
		in the table as written. If a future entry ever did, the holiday is the more
		informative of the two answers.
		"""
		holiday = self.holiday_name(day)
		if holiday:
			return MarketClosure(kind="holiday", name=holiday)

		parsed = self._parse(day)
		if parsed is None:
			return None
		weekend = self.WEEKEND_NAMES.get(parsed.weekday())
		return MarketClosure(kind="weekend", name=weekend) if weekend else None

	@staticmethod
	def _parse(day: str) -> datetime.date | None:
		try:
			return datetime.date.fromisoformat(day)
		except (TypeError, ValueError):
			return None

	@classmethod
	def _year(cls, day: str) -> int | None:
		parsed = cls._parse(day)
		return parsed.year if parsed else None
