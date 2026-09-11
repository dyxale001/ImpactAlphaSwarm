import { describe, it, expect } from 'vitest'
import { findForbiddenTerms } from './fundsCopy'
import { allSettingsStrings, formatSavedDate } from './settingsCopy'
import { lastSavedAt } from './profileHistory'

/**
 * The claim: the Settings page describes what a rating does, and never
 * proposes anything.
 *
 * The page now explains that a risk rating is the ceiling on which funds are
 * matched, which puts its wording under the same rule as the Funds page: the
 * product is not a licensed adviser, so no string here may read as a
 * recommendation. The funds scan already knows the terms; this runs the
 * Settings copy through it so a rewrite is caught by a test rather than a
 * reviewer.
 */

describe('the Settings page copy', () => {
  it('contains no forbidden term', () => {
    const offenders = allSettingsStrings()
      .map((text) => [text, findForbiddenTerms(text)] as const)
      .filter(([, found]) => found.length > 0)
    expect(offenders).toEqual([])
  })

  it('actually scanned something', () => {
    expect(allSettingsStrings().length).toBeGreaterThan(40)
  })
})

describe('the saved date', () => {
  it('reads as a date a person would write', () => {
    expect(formatSavedDate('2026-09-05T10:15:00.000Z')).toBe('5 September 2026')
  })

  it.each([null, undefined, '', 'yesterday'])('shows nothing for %s', (value) => {
    expect(formatSavedDate(value)).toBeNull()
  })
})

describe('when the answers were last saved', () => {
  it('is the newest history entry, which was stamped when the current answers replaced it', () => {
    const stored = {
      q_friend_describe: '1',
      _history: [
        { at: '2026-09-05T12:00:00.000Z', answers: { q_friend_describe: '3' } },
        { at: '2026-07-01T12:00:00.000Z', answers: { q_friend_describe: '2' } },
      ],
    }
    expect(lastSavedAt(stored)).toBe('2026-09-05T12:00:00.000Z')
  })

  it('falls back to when the goals were answered', () => {
    expect(lastSavedAt({ goals: { answered_at: '2026-08-01T09:00:00.000Z' } })).toBe(
      '2026-08-01T09:00:00.000Z',
    )
  })

  it('is null when the row does not say', () => {
    expect(lastSavedAt({ q_friend_describe: '1' })).toBeNull()
    expect(lastSavedAt({})).toBeNull()
  })
})
