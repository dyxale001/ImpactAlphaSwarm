import { describe, it, expect } from 'vitest'
import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  historyOf,
  withHistory,
  withoutHistory,
} from './profileHistory'

/**
 * The claim: revising a profile keeps what it was.
 *
 * The fund page puts a sentence beside every matched fund citing the answers
 * the match used. If revising overwrote, that sentence would refer to answers
 * that no longer exist anywhere, and nobody could check afterwards whether a
 * match had been reasonable when it was made. So a save archives first.
 *
 * The other half is that archiving must not nest: each entry stores the answers
 * without their own history, or every save would wrap the previous save and one
 * row would grow geometrically. That is the bug this file mostly exists to
 * prevent, because it would not show up until a user had saved several times.
 */

const AT = new Date('2026-09-05T12:00:00.000Z')

describe('archiving a previous version', () => {
  it('keeps the answers that were there', () => {
    const stored = { q_friend_describe: '3', demo_age: '25_34' }
    const next = withHistory(stored, { q_friend_describe: '1' }, AT)

    expect(historyOf(next)).toEqual([
      { at: AT.toISOString(), answers: stored },
    ])
  })

  it('puts the newest version first', () => {
    const first = withHistory({ q: 'a' }, { q: 'b' }, AT)
    const second = withHistory(first, { q: 'c' }, new Date('2026-10-05T12:00:00.000Z'))

    const versions = historyOf(second)
    expect(versions[0].answers).toEqual({ q: 'b' })
    expect(versions[1].answers).toEqual({ q: 'a' })
  })

  it('never nests a history inside a history', () => {
    // The geometric-growth bug: an archived entry must be the answers alone.
    let current: Record<string, unknown> = { q: '0' }
    for (let i = 1; i <= 4; i++) {
      current = withHistory(current, { q: String(i) }, AT)
    }
    for (const version of historyOf(current)) {
      expect(version.answers).not.toHaveProperty(HISTORY_KEY)
    }
  })

  it('keeps only the most recent versions', () => {
    let current: Record<string, unknown> = { q: '0' }
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) {
      current = withHistory(current, { q: String(i) }, AT)
    }
    expect(historyOf(current)).toHaveLength(HISTORY_LIMIT)
    // The oldest fall off the end, not the newest.
    expect(historyOf(current)[0].answers).toEqual({ q: String(HISTORY_LIMIT + 4) })
  })

  it('archives nothing on a first save', () => {
    // A user who has never answered has nothing worth keeping, and an empty
    // entry would read as a version in which they answered nothing.
    const next = withHistory({}, { q: 'a' }, AT)
    expect(historyOf(next)).toEqual([])
  })

  it('carries the new answers through', () => {
    const next = withHistory({ q: 'a' }, { q: 'b', extra: 'c' }, AT)
    expect(next.q).toBe('b')
    expect(next.extra).toBe('c')
  })
})

describe('withoutHistory', () => {
  it('drops the history key and nothing else', () => {
    const stored = { q: 'a', goals: { purpose: 'growth' }, [HISTORY_KEY]: [{ at: 'x', answers: {} }] }
    expect(withoutHistory(stored)).toEqual({ q: 'a', goals: { purpose: 'growth' } })
  })

  it('does not mutate what it was given', () => {
    const stored = { q: 'a', [HISTORY_KEY]: [] }
    withoutHistory(stored)
    expect(stored).toHaveProperty(HISTORY_KEY)
  })
})

describe('historyOf', () => {
  it('is empty for a row that has never been revised', () => {
    expect(historyOf({ q: 'a' })).toEqual([])
  })

  it('tolerates a malformed history rather than throwing', () => {
    // These rows are written by an earlier version of the app and read by this
    // one; a shape that surprises us should lose the history, not the page.
    expect(historyOf({ [HISTORY_KEY]: 'not a list' })).toEqual([])
    expect(historyOf({ [HISTORY_KEY]: null })).toEqual([])
  })
})
