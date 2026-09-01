import { describe, it, expect } from 'vitest'
import { DAILY_RUN_UTC_HOUR, lastScheduledRunUTC, isRunStale, describeRunAge } from './staleness'

// Date arithmetic around a fixed 22:00 UTC boundary. Everything here uses UTC
// accessors deliberately: the nightly job fires on a UTC schedule, so a local
// -time boundary would mark users stale at the wrong moment, and would do it
// differently depending on where the viewer is.

const at = (iso: string) => new Date(iso)

describe('lastScheduledRunUTC', () => {
  it('returns todays boundary once it has passed', () => {
    expect(lastScheduledRunUTC(at('2026-08-09T23:30:00Z')).toISOString())
      .toBe('2026-08-09T22:00:00.000Z')
  })

  it('returns yesterdays boundary when today has not fired yet', () => {
    expect(lastScheduledRunUTC(at('2026-08-09T21:30:00Z')).toISOString())
      .toBe('2026-08-08T22:00:00.000Z')
  })

  it('treats the boundary instant itself as already fired', () => {
    expect(lastScheduledRunUTC(at('2026-08-09T22:00:00.000Z')).toISOString())
      .toBe('2026-08-09T22:00:00.000Z')
  })

  it('rolls back across a month boundary', () => {
    expect(lastScheduledRunUTC(at('2026-09-01T10:00:00Z')).toISOString())
      .toBe('2026-08-31T22:00:00.000Z')
  })

  it('rolls back across a year boundary', () => {
    expect(lastScheduledRunUTC(at('2026-01-01T05:00:00Z')).toISOString())
      .toBe('2025-12-31T22:00:00.000Z')
  })

  it('rolls back across a leap day', () => {
    expect(lastScheduledRunUTC(at('2028-03-01T09:00:00Z')).toISOString())
      .toBe('2028-02-29T22:00:00.000Z')
  })

  it('always lands exactly on the configured UTC hour', () => {
    for (const hour of [0, 6, 12, 21, 22, 23]) {
      const boundary = lastScheduledRunUTC(at(`2026-08-09T${String(hour).padStart(2, '0')}:17:43Z`))
      expect(boundary.getUTCHours()).toBe(DAILY_RUN_UTC_HOUR)
      expect(boundary.getUTCMinutes()).toBe(0)
      expect(boundary.getUTCSeconds()).toBe(0)
      expect(boundary.getUTCMilliseconds()).toBe(0)
    }
  })

  it('never returns a boundary in the future', () => {
    for (const hour of [0, 5, 13, 21, 22, 23]) {
      const now = at(`2026-08-09T${String(hour).padStart(2, '0')}:30:00Z`)
      expect(lastScheduledRunUTC(now).getTime()).toBeLessThanOrEqual(now.getTime())
    }
  })

  it('does not mutate the date it is given', () => {
    const now = at('2026-08-09T10:00:00Z')
    lastScheduledRunUTC(now)
    expect(now.toISOString()).toBe('2026-08-09T10:00:00.000Z')
  })
})

describe('isRunStale', () => {
  const now = at('2026-08-09T23:00:00Z') // last boundary: 2026-08-09T22:00Z

  it('a run from before the last refresh is stale', () => {
    expect(isRunStale('2026-08-09T21:00:00Z', now)).toBe(true)
    expect(isRunStale('2026-08-01T22:00:00Z', now)).toBe(true)
  })

  it('a run from after the last refresh is fresh', () => {
    expect(isRunStale('2026-08-09T22:30:00Z', now)).toBe(false)
  })

  it('a run exactly on the boundary counts as refreshed', () => {
    expect(isRunStale('2026-08-09T22:00:00.000Z', now)).toBe(false)
  })

  it('a user with no runs at all is not reported as stale', () => {
    // Nothing has gone wrong for a brand-new account; a staleness warning here
    // would be alarming and wrong.
    expect(isRunStale(null, now)).toBe(false)
    expect(isRunStale(undefined, now)).toBe(false)
    expect(isRunStale('', now)).toBe(false)
  })

  it('a run from earlier in the day before tonights refresh is still fresh', () => {
    // At 21:00 the last boundary is YESTERDAY 22:00, so a run made at 09:00
    // today has not been superseded yet.
    expect(isRunStale('2026-08-09T09:00:00Z', at('2026-08-09T21:00:00Z'))).toBe(false)
  })
})

describe('describeRunAge', () => {
  const now = at('2026-08-09T12:00:00Z').getTime()

  it('describes a run from today', () => {
    expect(describeRunAge('2026-08-09T09:00:00Z', now)).toBe('earlier today')
  })

  it('describes a run from yesterday', () => {
    expect(describeRunAge('2026-08-08T09:00:00Z', now)).toBe('yesterday')
  })

  it('describes older runs in whole days', () => {
    expect(describeRunAge('2026-08-06T12:00:00Z', now)).toBe('3 days ago')
    expect(describeRunAge('2026-07-10T12:00:00Z', now)).toBe('30 days ago')
  })

  it('rounds down to whole elapsed days', () => {
    // 47 hours is still "yesterday", not "2 days ago".
    expect(describeRunAge('2026-08-07T13:00:00Z', now)).toBe('yesterday')
    expect(describeRunAge('2026-08-07T11:00:00Z', now)).toBe('2 days ago')
  })

  it('handles the exact day boundaries', () => {
    expect(describeRunAge('2026-08-08T12:00:00Z', now)).toBe('yesterday')
    expect(describeRunAge('2026-08-07T12:00:00Z', now)).toBe('2 days ago')
  })

  it('a timestamp in the future reads as today rather than a negative age', () => {
    // Clock skew between the browser and the database must not render
    // "-1 days ago".
    expect(describeRunAge('2026-08-10T12:00:00Z', now)).toBe('earlier today')
  })
})
