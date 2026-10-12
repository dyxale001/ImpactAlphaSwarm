import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import RiskProfileCard from './RiskProfileCard';
import { SURVEY_QUESTIONS } from '../../utils/onboardingData';
import { RISK_REASONING_FALLBACK } from '../../utils/riskProfileReasoning';

vi.mock('../../hooks/useFundCatalogue', () => ({ useFundMatches: () => ({ bracket: null }) }));

type Profile = Parameters<typeof RiskProfileCard>[0]['profile'];
const saved = Object.fromEntries(SURVEY_QUESTIONS.map(q => [q.id, q.options.reduce((a, b) => Number(a.value) < Number(b.value) ? a : b).value]));
saved.demo_age = '35_44';
saved.demo_income = 'tier_3';

function profile(savedSurveyAnswers: unknown): Profile {
  return {
    riskLabel: 'Conservative', savedSurveyAnswers,
    // Unsaved edits deliberately describe a different allocation.
    surveyAnswers: { ...saved, q_portfolio_allocation: '3' },
    goalAnswers: {}, setSurveyAnswer: vi.fn(), setGoalAnswer: vi.fn(),
    saveGoals: vi.fn(), saveRetake: vi.fn(), discardChanges: vi.fn(),
    isSaving: false, error: null, savedWhat: null,
    answeredSurvey: 20, answeredGoals: 0, lastSavedAt: null,
  };
}

describe('risk card saved explanation', () => {
  it('shows saved selections even when editable answers differ', () => {
    const html = renderToStaticMarkup(createElement(RiskProfileCard, { profile: profile(saved) }));
    expect(html).toContain('Why this risk level?');
    expect(html).toContain('Mostly safe:');
    expect(html).not.toContain('Mostly risky:');
    expect(html).toContain('Review your answers');
  });

  it('keeps the saved label and shows fallback when data is missing', () => {
    const html = renderToStaticMarkup(createElement(RiskProfileCard, { profile: profile(null) }));
    expect(html).toContain('Conservative');
    expect(html).toContain(RISK_REASONING_FALLBACK);
    expect(html).not.toContain('Mostly safe:');
  });
});
