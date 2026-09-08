import { describe, it, expect } from 'vitest'
import { marketClosure } from './sentimentDays'
import { marketHolidayName, holidaysKnownFor } from '../../utils/marketHours'

// Why a bar on the trend chart is quiet. The chart washes these columns and writes
// the reason up them, so a wrong answer here mislabels the chart rather than just
// dropping a highlight.
//
// Day keys are UTC calendar labels, which is what the backend buckets posts under.
// Every date below is checked against a real calendar: 2026-11-26 is a Thursday,
// 2026-11-28 a Saturday, 2026-11-29 a Sunday.

describe('marketClosure', () => {
  it('names a weekday public holiday', () => {
    expect(marketClosure('2026-11-26')).toEqual({
      kind: 'holiday',
      name: 'Thanksgiving',
    })
  })

  it('keeps the observed suffix, because that is why the market is shut that day', () => {
    // The 4th of July 2026 is a Saturday, so the NYSE closes on Friday the 3rd.
    expect(marketClosure('2026-07-03')).toEqual({
      kind: 'holiday',
      name: 'Independence Day (observed)',
    })
  })

  it('names a Saturday and a Sunday by their own day names', () => {
    expect(marketClosure('2026-11-28')).toEqual({ kind: 'weekend', name: 'Saturday' })
    expect(marketClosure('2026-11-29')).toEqual({ kind: 'weekend', name: 'Sunday' })
  })

  it('returns null on an ordinary trading day', () => {
    // The Wednesday before Thanksgiving: a full session.
    expect(marketClosure('2026-11-25')).toBeNull()
  })

  it('reads the day in UTC, not the running machines timezone', () => {
    // 2026-08-31 is a Monday everywhere. Were this parsed through local time, a
    // viewer far enough west would read it back as Sunday the 30th and the chart
    // would wash a trading day.
    expect(marketClosure('2026-08-31')).toBeNull()
    // The Sunday before it really is a Sunday.
    expect(marketClosure('2026-08-30')).toEqual({ kind: 'weekend', name: 'Sunday' })
  })

  it('still finds the weekend in a year the holiday table does not reach', () => {
    // Weekends are computed rather than listed, so they survive the table running
    // out. 2035-01-06 is a Saturday.
    expect(holidaysKnownFor('2035-01-06')).toBe(false)
    expect(marketClosure('2035-01-06')).toEqual({ kind: 'weekend', name: 'Saturday' })
  })

  it('claims no holiday for a year the table does not reach, rather than guessing', () => {
    // Christmas 2035 is a Tuesday and the market is certainly shut, but the table
    // does not go that far and inventing an entry would be worse than saying
    // nothing: the chart would label a column from a rule it never verified.
    expect(marketClosure('2035-12-25')).toBeNull()
  })

  it('returns null rather than throwing on an unparseable key', () => {
    expect(marketClosure('not-a-date')).toBeNull()
  })
})

describe('marketHolidayName', () => {
  it('names a listed closure', () => {
    expect(marketHolidayName('2027-05-31')).toBe('Memorial Day')
  })

  it('returns null for a trading day and for an uncovered year alike', () => {
    expect(marketHolidayName('2026-11-25')).toBeNull()
    expect(marketHolidayName('2035-12-25')).toBeNull()
  })
})
