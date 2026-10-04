import { describe, expect, it } from 'vitest'
import { describeAssessmentGaps } from './assessmentGaps'

const gaps = (goalsMissing: number, riskMissing: number, sectorMissing: boolean) =>
  describeAssessmentGaps({ goalsMissing, riskMissing, sectorMissing })

describe('describeAssessmentGaps', () => {
  it('says nothing when everything is done', () => {
    expect(gaps(0, 0, false)).toBeUndefined()
  })

  it('names a single missing goal question in the singular', () => {
    expect(gaps(1, 0, false)).toBe('To continue, answer 1 goal question.')
  })

  it('uses the plural for several', () => {
    expect(gaps(4, 0, false)).toBe('To continue, answer 4 goal questions.')
    expect(gaps(0, 20, false)).toBe('To continue, answer 20 risk questions.')
  })

  it('joins goal and risk gaps', () => {
    expect(gaps(1, 1, false)).toBe('To continue, answer 1 goal question and 1 risk question.')
  })

  it('reports a missing sector on its own', () => {
    expect(gaps(0, 0, true)).toBe('To continue, pick at least one target sector.')
  })

  it('reports questions and a sector together', () => {
    expect(gaps(2, 3, true)).toBe(
      'To continue, answer 2 goal questions and 3 risk questions, then pick at least one target sector.',
    )
    expect(gaps(0, 1, true)).toBe('To continue, answer 1 risk question, then pick at least one target sector.')
  })
})
