import { describe, expect, it } from 'vitest';
import { SURVEY_QUESTIONS } from './onboardingData';
import { determinePsychometrics, psychometricBreakdown } from './scoringEngine';
import { riskProfileReasoning } from './riskProfileReasoning';

export function survey(position: 'low' | 'middle' | 'high') {
  return Object.fromEntries(SURVEY_QUESTIONS.map(q => {
    const options = [...q.options].sort((a, b) => Number(a.value) - Number(b.value));
    const option = position === 'low' ? options[0] : position === 'high' ? options.at(-1)! : options[Math.floor((options.length - 1) / 2)];
    return [q.id, option.value];
  }).concat([['demo_age', '35_44'], ['demo_income', 'tier_3']]));
}

describe('saved risk reasoning', () => {
  it.each([
    ['low', 'Conservative'], ['middle', 'Moderate'], ['high', 'Aggressive'],
  ] as const)('explains %s responses as %s using actual options', (position, label) => {
    const saved = survey(position);
    expect(determinePsychometrics(saved).riskTolerance).toBe(label);
    const explanation = riskProfileReasoning(saved, label)!;
    expect(explanation.summary).toContain(label);
    expect(explanation.highlights).toHaveLength(3);
    for (const item of explanation.highlights) {
      expect(item.answer).toBe(SURVEY_QUESTIONS.find(q => q.id === item.id)!.options.find(o => o.value === saved[item.id])!.label);
    }
  });

  it.each([
    ['under_25', 'tier_5', 'raised', 'raised'],
    ['55_64', 'tier_1', 'lowered', 'lowered'],
    ['75_over', 'tier_4', 'lowered', 'raised'],
    ['45_54', 'tier_2', 'unchanged', 'unchanged'],
  ])('describes age %s and income %s', (age, income, ageEffect, incomeEffect) => {
    const saved = { ...survey('middle'), demo_age: age, demo_income: income };
    const explanation = riskProfileReasoning(saved, determinePsychometrics(saved).riskTolerance)!;
    const [ageSentence, incomeSentence] = explanation.capacity.split('. ');
    expect(ageSentence).toContain(ageEffect);
    expect(incomeSentence).toContain(incomeEffect);
  });

  it.each([undefined, null, [], 'bad', {}, { ...survey('middle'), q_game_show: undefined },
    { ...survey('middle'), q_game_show: '99' }, { ...survey('middle'), demo_age: 'unknown' },
    { ...survey('middle'), demo_income: null }, { ...survey('middle'), q_legacy: '1' },
  ])('does not explain missing or invalid data: %j', saved => {
    expect(riskProfileReasoning(saved, 'Moderate')).toBeNull();
  });

  it('rejects inconsistent or unrecognised saved labels', () => {
    expect(riskProfileReasoning(survey('high'), 'Conservative')).toBeNull();
    expect(riskProfileReasoning(survey('high'), 'Unknown')).toBeNull();
    expect(riskProfileReasoning(survey('high'), null)).toBeNull();
  });

  it('ignores non-scoring answers and stored metadata', () => {
    const saved = survey('middle');
    delete saved.q_financial_math;
    delete saved.demo_gender;
    expect(riskProfileReasoning({ ...saved, goals: {}, _history: [] }, 'Moderate')).not.toBeNull();
  });

  it('exposes the existing arithmetic without changing the public result', () => {
    const saved = { ...survey('high'), demo_age: 'under_25', demo_income: 'tier_5' };
    const details = psychometricBreakdown(saved);
    expect(details.riskToleranceScore).toBe(46);
    expect(details.baseTolerancePercentage).toBe(100);
    expect(details.capacityMultiplier).toBeCloseTo(1.25);
    expect(details.finalRiskScore).toBeCloseTo(125);
    expect(determinePsychometrics(saved)).toEqual({ riskTolerance: details.riskTolerance, calculatedExpertise: details.calculatedExpertise });
  });
});
