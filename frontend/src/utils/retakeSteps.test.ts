import { describe, it, expect } from 'vitest'
import { SURVEY_QUESTIONS } from './onboardingData'
import { RETAKE_STEPS, questionsInStep, retakeProgress, stepComplete } from './retakeSteps'

/**
 * The claim: the four steps of the retake cover the questionnaire exactly.
 *
 * The score uses every answer, so a step boundary that skipped a question, or
 * counted one twice, would let someone save a retake that looked complete and
 * was not — or block one that was. The step titles are fixed to the
 * questionnaire's own structure, so if the question list changes shape this
 * file says so before a user does.
 */

describe('the step boundaries', () => {
  it('cover every question once, in order', () => {
    const seen = RETAKE_STEPS.flatMap((_, i) => questionsInStep(SURVEY_QUESTIONS, i).map((q) => q.id))
    expect(seen).toEqual(SURVEY_QUESTIONS.map((q) => q.id))
  })

  it('are contiguous and the same length', () => {
    for (let i = 1; i < RETAKE_STEPS.length; i++) {
      expect(RETAKE_STEPS[i].from).toBe(RETAKE_STEPS[i - 1].to)
    }
    const lengths = new Set(RETAKE_STEPS.map((s) => s.to - s.from))
    expect(lengths.size).toBe(1)
  })

  it('return nothing for a step that does not exist', () => {
    expect(questionsInStep(SURVEY_QUESTIONS, RETAKE_STEPS.length)).toEqual([])
    expect(questionsInStep(SURVEY_QUESTIONS, -1)).toEqual([])
  })
})

describe('whether a step is complete', () => {
  it('needs every question in the step, and only those', () => {
    const first = questionsInStep(SURVEY_QUESTIONS, 0)
    const answers: Record<string, string> = {}
    for (const q of first.slice(0, -1)) answers[q.id] = q.options[0].value
    expect(stepComplete(answers, 0)).toBe(false)
    answers[first[first.length - 1].id] = first[first.length - 1].options[0].value
    expect(stepComplete(answers, 0)).toBe(true)
    expect(stepComplete(answers, 1)).toBe(false)
  })
})

describe('the progress bar', () => {
  it('reads 100 only on the last step', () => {
    expect(retakeProgress(0)).toBeLessThan(100)
    expect(retakeProgress(RETAKE_STEPS.length - 1)).toBe(100)
  })

  it('rises with each step', () => {
    for (let i = 1; i < RETAKE_STEPS.length; i++) {
      expect(retakeProgress(i)).toBeGreaterThan(retakeProgress(i - 1))
    }
  })
})
