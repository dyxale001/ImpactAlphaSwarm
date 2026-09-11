import { describe, it, expect } from 'vitest'
import { GOAL_QUESTIONS } from './onboardingData'
import { buildGoals, goalAnswersFromGoals, goalsFromSurveyAnswers, type GoalQuestionId } from './goals'

/**
 * The claim: what you save is what you see when you come back.
 *
 * Goals are renamed on the way into storage, so a form that prefills from the
 * stored object has to rename them on the way out. The Settings card once
 * read the stored object by question id, found nothing, and reported every
 * goal unanswered a moment after they were saved. This pins the round trip.
 */

const AT = new Date('2026-09-05T12:00:00.000Z')

describe('reading goals back as answers', () => {
  it('round-trips every question through buildGoals', () => {
    const answered: Partial<Record<GoalQuestionId, string>> = {}
    for (const q of GOAL_QUESTIONS) answered[q.id as GoalQuestionId] = q.options[1].value

    const stored = { goals: buildGoals(answered, AT) }
    expect(goalAnswersFromGoals(goalsFromSurveyAnswers(stored))).toEqual(answered)
  })

  it('returns only what was answered', () => {
    const goals = buildGoals({ goal_purpose: 'growth' }, AT)
    expect(goalAnswersFromGoals(goals)).toEqual({ goal_purpose: 'growth' })
  })

  it('gives the chosen band back, not the derived year', () => {
    const goals = buildGoals({ goal_horizon: '5_plus' }, AT)
    expect(goals.horizon_target_year).toBe(2031)
    expect(goalAnswersFromGoals(goals)).toEqual({ goal_horizon: '5_plus' })
  })

  it.each([undefined, null, {}])('is empty for %s', (value) => {
    expect(goalAnswersFromGoals(value as never)).toEqual({})
  })

  it('every stored value is a real option of its question', () => {
    const answered: Partial<Record<GoalQuestionId, string>> = {}
    for (const q of GOAL_QUESTIONS) answered[q.id as GoalQuestionId] = q.options[0].value
    const back = goalAnswersFromGoals(buildGoals(answered, AT))
    for (const q of GOAL_QUESTIONS) {
      expect(q.options.map((o) => o.value)).toContain(back[q.id as GoalQuestionId])
    }
  })
})
