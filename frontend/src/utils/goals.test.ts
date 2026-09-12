import { describe, it, expect } from 'vitest'
import {
  GOAL_QUESTION_IDS,
  HORIZON_BAND_YEARS,
  buildGoals,
  describeGoals,
  goalsFromSurveyAnswers,
  horizonTargetYear,
  type Goals,
} from './goals'
import { BAND_WORDS, PURPOSE_WORDS } from './goals'
import { GOAL_QUESTIONS, SURVEY_QUESTIONS } from './onboardingData'
import { determinePsychometrics } from './scoringEngine'

/**
 * Two claims here.
 *
 * The first is that a horizon ages. The answer is a band, but a band is only
 * true on the day it is given: five years answered in 2026 is two years in 2029,
 * and nobody goes back to update it. So a target year is stored and the band is
 * derived from what is left of it. Personalisation that quietly goes stale while
 * still claiming to be based on your answers is worse than none.
 *
 * The second is that these four questions cannot touch the risk score. The
 * scorer sums every answer whose id begins with `q_` and reads `demo_age` and
 * `demo_income` by name, so an id in either style would silently change how a
 * person is classified. That is the regression this file exists to prevent.
 */

const NOW = new Date('2026-09-04T10:00:00Z')

describe('the goal questions are safe to add', () => {
  it('has an id per question, in the asked order', () => {
    expect(GOAL_QUESTIONS.map((q) => q.id)).toEqual([...GOAL_QUESTION_IDS])
  })

  it('never names a question the way a risk answer is named', () => {
    // REGRESSION GUARD. The whole reason these ids are prefixed `goal_`.
    for (const id of GOAL_QUESTION_IDS) {
      expect(id.startsWith('q_')).toBe(false)
      expect(id.startsWith('demo_')).toBe(false)
    }
  })

  it('stays out of the assessment question list', () => {
    // The assessment progress counter counts SURVEY_QUESTIONS, and the step
    // gate requires 20 of them. Both must keep measuring the assessment.
    const surveyIds = new Set(SURVEY_QUESTIONS.map((q) => q.id))
    for (const id of GOAL_QUESTION_IDS) {
      expect(surveyIds.has(id)).toBe(false)
    }
  })

  it('gives every question at least two options with distinct values', () => {
    for (const question of GOAL_QUESTIONS) {
      expect(question.options.length).toBeGreaterThanOrEqual(2)
      const values = question.options.map((o) => o.value)
      expect(new Set(values).size).toBe(values.length)
      for (const option of question.options) {
        expect(option.label.trim()).not.toBe('')
      }
    }
  })
})

describe('the risk score cannot see the goal answers', () => {
  const riskAnswers: Record<string, string> = {
    q_friend_describe: '3',
    q_game_show: '3',
    demo_age: '25_34',
  }

  it('produces the same classification with goals present', () => {
    // INVARIANT: the two records are separate in the hook, and this proves the
    // scorer would be unaffected even if they were ever merged by accident.
    const withGoals = {
      ...riskAnswers,
      goal_horizon: '5_plus',
      goal_purpose: 'growth',
      goal_account_type: 'tfsa',
      goal_contribution: 'monthly',
    }
    expect(determinePsychometrics(withGoals)).toEqual(determinePsychometrics(riskAnswers))
  })

  it('produces the same classification with a nested goals object present', () => {
    const withNested = { ...riskAnswers, goals: JSON.stringify({ purpose: 'growth' }) }
    expect(determinePsychometrics(withNested)).toEqual(determinePsychometrics(riskAnswers))
  })
})

describe('every stored answer has a word for the screen', () => {
  // The funds page echoes the horizon and purpose back to the reader, and falls
  // through to the stored value when a word is missing. That fallback would put
  // `emergency_fund` on screen — a database enum shown to a user as though it
  // were English. Driven off the questions themselves so adding a fourth
  // purpose option fails here rather than in the interface.

  it('covers every purpose the questions offer', () => {
    const question = GOAL_QUESTIONS.find((q) => q.id === 'goal_purpose')
    expect(question).toBeDefined()
    for (const option of question!.options) {
      expect(PURPOSE_WORDS[option.value as keyof typeof PURPOSE_WORDS]).toBeTruthy()
    }
  })

  it('covers every horizon band the questions offer', () => {
    const question = GOAL_QUESTIONS.find((q) => q.id === 'goal_horizon')
    expect(question).toBeDefined()
    for (const option of question!.options) {
      expect(BAND_WORDS[option.value as keyof typeof BAND_WORDS]).toBeTruthy()
    }
  })

  it('says none of them in database wording', () => {
    // A word containing an underscore is the stored value leaking through.
    for (const word of [...Object.values(PURPOSE_WORDS), ...Object.values(BAND_WORDS)]) {
      expect(word).not.toMatch(/_/)
    }
  })
})

describe('horizonTargetYear', () => {
  it('uses the lower bound of the band', () => {
    // The cautious end. Someone answering "2 to 5" is promised nothing beyond
    // two, and treating them as a five-year investor could show them a fund
    // asking for longer than they have.
    expect(HORIZON_BAND_YEARS).toEqual({ under_2: 1, '2_to_5': 2, '5_plus': 5 })
    expect(horizonTargetYear('under_2', NOW)).toBe(2027)
    expect(horizonTargetYear('2_to_5', NOW)).toBe(2028)
    expect(horizonTargetYear('5_plus', NOW)).toBe(2031)
  })

  it('moves with the year it is answered in', () => {
    expect(horizonTargetYear('5_plus', new Date('2029-01-01T00:00:00Z'))).toBe(2034)
  })
})

describe('buildGoals', () => {
  it('records the band, the derived year and the answers', () => {
    const goals = buildGoals(
      {
        goal_horizon: '2_to_5',
        goal_purpose: 'emergency_fund',
        goal_account_type: 'tfsa',
        goal_contribution: 'lump_sum',
      },
      NOW,
    )
    expect(goals.horizon_band).toBe('2_to_5')
    expect(goals.horizon_target_year).toBe(2028)
    expect(goals.purpose).toBe('emergency_fund')
    expect(goals.account_type).toBe('tfsa')
    expect(goals.contribution_style).toBe('lump_sum')
    expect(goals.answered_at).toBe(NOW.toISOString())
  })

  it('keeps the band as answered as well as the derived year', () => {
    // The band is provenance: what the person actually chose. The year is what
    // the matcher reads. Losing the first makes the answer unauditable.
    const goals = buildGoals({ goal_horizon: '5_plus' }, NOW)
    expect(goals.horizon_band).toBe('5_plus')
    expect(goals.horizon_target_year).toBe(2031)
  })

  it('omits what was not answered rather than inventing it', () => {
    const goals = buildGoals({ goal_purpose: 'income' }, NOW)
    expect(goals.purpose).toBe('income')
    expect(goals.horizon_target_year).toBeUndefined()
    expect(goals.account_type).toBeUndefined()
  })

  it('always stamps when it was answered', () => {
    // So a stale profile can be spotted, and so a later nudge knows when to ask.
    expect(buildGoals({}, NOW).answered_at).toBe(NOW.toISOString())
  })
})

describe('goalsFromSurveyAnswers', () => {
  it('reads a stored object', () => {
    const goals = goalsFromSurveyAnswers({ goals: { purpose: 'growth', horizon_target_year: 2031 } })
    expect(goals?.purpose).toBe('growth')
    expect(goals?.horizon_target_year).toBe(2031)
  })

  it('reads a stored JSON string', () => {
    // That column is read both ways elsewhere in the codebase.
    const goals = goalsFromSurveyAnswers('{"goals":{"purpose":"income"}}')
    expect(goals?.purpose).toBe('income')
  })

  it('returns undefined for a record written before these questions existed', () => {
    // Most existing users. The funds page says it used the risk profile only,
    // rather than pretending to a fuller profile.
    expect(goalsFromSurveyAnswers({ q_friend_describe: '3' })).toBeUndefined()
  })

  it.each([null, undefined, 'not json', 42, { goals: null }, { goals: 'nope' }, { goals: {} }])(
    'returns undefined for %s',
    (stored) => {
      expect(goalsFromSurveyAnswers(stored)).toBeUndefined()
    },
  )

  it('treats a goals object with only a timestamp as unanswered', () => {
    // buildGoals always stamps answered_at, so a user who opened the block and
    // answered nothing must not read as having a profile.
    expect(goalsFromSurveyAnswers({ goals: { answered_at: NOW.toISOString() } })).toBeUndefined()
  })

  it('round-trips what buildGoals wrote', () => {
    const built = buildGoals({ goal_horizon: 'under_2', goal_purpose: 'emergency_fund' }, NOW)
    expect(goalsFromSurveyAnswers({ goals: built })).toEqual(built)
  })
})

describe('describeGoals', () => {
  it('reads as a phrase for the profile card', () => {
    const goals: Goals = { horizon_band: '2_to_5', purpose: 'emergency_fund' }
    expect(describeGoals(goals)).toBe('2 to 5 years · money you may need at short notice')
  })

  it('describes what it has', () => {
    expect(describeGoals({ purpose: 'growth' })).toBe('long-term growth')
    expect(describeGoals({ horizon_band: '5_plus' })).toBe('5 years or more')
  })

  it('is undefined when there is nothing to say', () => {
    // So the card hides the panel rather than showing an empty heading.
    expect(describeGoals(undefined)).toBeUndefined()
    expect(describeGoals({})).toBeUndefined()
    expect(describeGoals({ answered_at: NOW.toISOString() })).toBeUndefined()
  })

  it('never uses wording that reads as advice', () => {
    // The page-level copy scan covers the funds page; this covers the one
    // sentence onboarding renders from the same vocabulary.
    const forbidden = ['recommend', 'suitable', 'should', 'best', 'ideal', 'safe', 'guaranteed']
    for (const purpose of ['emergency_fund', 'goal', 'growth', 'income'] as const) {
      const described = describeGoals({ horizon_band: '2_to_5', purpose }) ?? ''
      for (const word of forbidden) {
        expect(described.toLowerCase()).not.toContain(word)
      }
    }
  })
})
