import { describe, it, expect } from 'vitest'
import { determinePsychometrics } from './scoringEngine'

// This function produces the `riskTolerance` string that is stored on the user
// profile and then read by the backend's ranking.profile_fit, which matches
// "Conservative" EXACTLY. The stored column has previously held six spellings of
// three levels, which silently disabled risk personalisation for ~39% of
// profiles. The first test below is the front half of that contract.

const answers = (o: Record<string, string>) => determinePsychometrics(o)

describe('determinePsychometrics — risk tolerance vocabulary', () => {
  it('only ever emits the three canonical spellings the backend matches on', () => {
    const seen = new Set<string>()
    for (const score of ['0', '5', '10', '15', '18', '20', '30', '45', '90']) {
      for (const age of ['under_25', '25_34', '35_44', '55_64', '65_74', '75_over', '']) {
        for (const income of ['tier_1', 'tier_3', 'tier_4', 'tier_5', '']) {
          seen.add(answers({ q_risk: score, demo_age: age, demo_income: income }).riskTolerance)
        }
      }
    }
    expect([...seen].sort()).toEqual(['Aggressive', 'Conservative', 'Moderate'])
  })

  it('only ever emits the three declared expertise levels', () => {
    const seen = new Set<string>()
    for (const self of ['0', '1', '2', '3', '4', '5', '']) {
      for (const extra of ['0', '2', '3']) {
        seen.add(
          answers({
            q_financial_knowledge_self: self,
            q_financial_math: extra,
            q_inflation: extra,
            q_diversification: extra,
          }).calculatedExpertise,
        )
      }
    }
    for (const level of seen) {
      expect(['novice', 'intermediate', 'advanced']).toContain(level)
    }
  })
})

describe('determinePsychometrics — base risk score', () => {
  it('sums every q_ answer that is not a literacy question', () => {
    // 45 is the documented maximum, so this saturates the base at 100%.
    expect(answers({ q_a: '15', q_b: '15', q_c: '15' }).riskTolerance).toBe('Aggressive')
  })

  it('excludes the four literacy questions from the risk score', () => {
    // REGRESSION GUARD: these four measure financial literacy, not risk
    // appetite. Letting them leak into the risk sum would make a knowledgeable
    // but cautious user look aggressive.
    const literacyOnly = answers({
      q_financial_knowledge_self: '45',
      q_financial_math: '45',
      q_inflation: '45',
      q_diversification: '45',
    })
    expect(literacyOnly.riskTolerance).toBe('Conservative')
  })

  it('ignores keys that are not risk questions', () => {
    expect(answers({ demo_age: '45', other: '45' }).riskTolerance).toBe('Conservative')
  })

  it('caps the base percentage at 100 however high the raw score goes', () => {
    // Both saturate, so the demographic multiplier is the only thing that can
    // still separate them.
    const capped = answers({ q_a: '45', demo_age: '55_64' })
    const wayOver = answers({ q_a: '450', demo_age: '55_64' })
    expect(capped.riskTolerance).toBe(wayOver.riskTolerance)
  })

  it('an empty survey is Conservative and novice', () => {
    expect(answers({})).toEqual({ riskTolerance: 'Conservative', calculatedExpertise: 'novice' })
  })
})

describe('determinePsychometrics — demographic capacity multiplier', () => {
  // Base score of 45 saturates at 100%, so the band boundary reached is a direct
  // readout of the multiplier.
  const withBase = (extra: Record<string, string>) => answers({ q_a: '45', ...extra })

  it.each([
    ['under_25', 'Aggressive'],   // x1.15 -> 115
    ['25_34', 'Aggressive'],      // x1.15 -> 115
    ['35_44', 'Aggressive'],      // x1.00 -> 100
    ['55_64', 'Aggressive'],      // x0.85 ->  85
    ['65_74', 'Aggressive'],      // x0.70 ->  70, exactly on the boundary
    ['75_over', 'Aggressive'],    // x0.70 ->  70
  ])('age band %s', (age, expected) => {
    expect(withBase({ demo_age: age }).riskTolerance).toBe(expected)
  })

  it('older age and lowest income together drop a maximal score to Moderate', () => {
    // 100 x (1 - 0.30 - 0.15) = 55
    expect(withBase({ demo_age: '65_74', demo_income: 'tier_1' }).riskTolerance).toBe('Moderate')
  })

  it('the lowest income tier reduces capacity', () => {
    // 100 x 0.85 = 85, still Aggressive; drop the base so the effect shows.
    const mid = { q_a: '20' } // base 44.4
    expect(answers(mid).riskTolerance).toBe('Moderate')
    expect(answers({ ...mid, demo_income: 'tier_1' }).riskTolerance).toBe('Conservative')
  })

  it.each(['tier_4', 'tier_5'])('the top income tier %s raises capacity', (tier) => {
    const mid = { q_a: '17' } // base 37.8 -> Conservative on its own
    expect(answers(mid).riskTolerance).toBe('Conservative')
    expect(answers({ ...mid, demo_income: tier }).riskTolerance).toBe('Moderate')
  })

  it('age and income adjustments compound', () => {
    const base = { q_a: '16' } // base 35.6
    expect(answers(base).riskTolerance).toBe('Conservative')
    // x(1 + 0.15 + 0.10) = 44.4
    expect(answers({ ...base, demo_age: 'under_25', demo_income: 'tier_4' }).riskTolerance)
      .toBe('Moderate')
  })
})

describe('determinePsychometrics — tolerance band boundaries', () => {
  it('70 and above is Aggressive', () => {
    expect(answers({ q_a: '45', demo_age: '65_74' }).riskTolerance).toBe('Aggressive')
  })

  it('40 up to 70 is Moderate', () => {
    expect(answers({ q_a: '18' }).riskTolerance).toBe('Moderate') // exactly 40
    expect(answers({ q_a: '31' }).riskTolerance).toBe('Moderate') // 68.9
  })

  it('below 40 is Conservative', () => {
    expect(answers({ q_a: '17' }).riskTolerance).toBe('Conservative') // 37.8
    expect(answers({ q_a: '0' }).riskTolerance).toBe('Conservative')
  })

  it('a higher risk score never lowers the tolerance band', () => {
    const rank = { Conservative: 0, Moderate: 1, Aggressive: 2 }
    let previous = -1
    for (let score = 0; score <= 45; score++) {
      const current = rank[answers({ q_a: String(score) }).riskTolerance as keyof typeof rank]
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })
})

describe('determinePsychometrics — expertise', () => {
  it('a literacy score of 6 or more is advanced', () => {
    expect(
      answers({
        q_financial_knowledge_self: '5', // 5
        q_financial_math: '2',           // +1 (must be > 1)
        q_inflation: '3',                // +1 (must equal 3)
        q_diversification: '3',          // +1  = 8
      }).calculatedExpertise,
    ).toBe('advanced')
  })

  it('a literacy score of 3 or less is novice', () => {
    expect(answers({ q_financial_knowledge_self: '3' }).calculatedExpertise).toBe('novice')
  })

  it('the band between is intermediate', () => {
    expect(answers({ q_financial_knowledge_self: '4' }).calculatedExpertise).toBe('intermediate')
    expect(
      answers({ q_financial_knowledge_self: '3', q_financial_math: '2' }).calculatedExpertise,
    ).toBe('intermediate')
  })

  it('the quiz questions only score on their exact correct answer', () => {
    // q_inflation and q_diversification credit === 3 only; a near miss earns
    // nothing, so 4 is not "more correct" than 3.
    const exact = answers({ q_financial_knowledge_self: '4', q_inflation: '3' })
    const near = answers({ q_financial_knowledge_self: '4', q_inflation: '4' })
    expect(exact.calculatedExpertise).toBe('intermediate')
    expect(near.calculatedExpertise).toBe('intermediate')
    // and the boundary case where that one mark decides the band
    expect(
      answers({ q_financial_knowledge_self: '5', q_inflation: '3' }).calculatedExpertise,
    ).toBe('advanced')
    expect(
      answers({ q_financial_knowledge_self: '5', q_inflation: '4' }).calculatedExpertise,
    ).toBe('intermediate')
  })

  it('the financial-maths question credits any answer above 1', () => {
    expect(
      answers({ q_financial_knowledge_self: '5', q_financial_math: '1' }).calculatedExpertise,
    ).toBe('intermediate')
    expect(
      answers({ q_financial_knowledge_self: '5', q_financial_math: '2' }).calculatedExpertise,
    ).toBe('advanced')
  })

  it('expertise is independent of risk tolerance', () => {
    const cautiousExpert = answers({
      q_a: '0',
      q_financial_knowledge_self: '5',
      q_financial_math: '2',
      q_inflation: '3',
      q_diversification: '3',
    })
    expect(cautiousExpert.riskTolerance).toBe('Conservative')
    expect(cautiousExpert.calculatedExpertise).toBe('advanced')
  })
})

describe('determinePsychometrics — malformed input', () => {
  it('treats a missing answer as zero', () => {
    expect(answers({ q_a: '' }).riskTolerance).toBe('Conservative')
  })

  it('a non-numeric answer collapses the score and falls through to Conservative', () => {
    // PINNED BEHAVIOUR, not an endorsement. parseInt('abc') is NaN, NaN
    // propagates through the arithmetic, and both band comparisons are false, so
    // the result silently defaults to Conservative. It fails safe, but it fails
    // SILENTLY -- a survey that only ever posts numeric strings is the only
    // reason this is not currently visible.
    const nonsense = answers({ q_a: 'abc', q_b: '45' })
    expect(nonsense.riskTolerance).toBe('Conservative')
  })

  it('is a pure function of its input', () => {
    const input = { q_a: '20', demo_age: 'under_25' }
    const snapshot = { ...input }
    expect(determinePsychometrics(input)).toEqual(determinePsychometrics(input))
    expect(input).toEqual(snapshot)
  })
})
