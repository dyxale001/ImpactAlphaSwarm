import { useState } from 'react';
import CompoundInterestCalculator from './CompoundInterestCalculator';
import InvestmentGoalPlanner from './InvestmentGoalPlanner';

export default function InvestmentPlanner() {
  const [mode, setMode] = useState<'growth' | 'goal'>('growth');

  return (
    <section aria-labelledby="investment-planner-title" className="min-w-0 space-y-4">
      <h2 id="investment-planner-title" className="text-xl font-semibold text-brand-fg">Investment Growth &amp; Goal Planner</h2>
      <div role="group" aria-label="Investment planning mode" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={mode === 'growth'} aria-controls="investment-mode-growth" onClick={() => setMode('growth')} className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold ${mode === 'growth' ? 'bg-brand-primary text-brand-bg' : 'border border-brand-border bg-brand-card text-brand-primary hover:bg-brand-primary/5'}`}>Project Growth</button>
        <button type="button" aria-pressed={mode === 'goal'} aria-controls="investment-mode-goal" onClick={() => setMode('goal')} className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold ${mode === 'goal' ? 'bg-brand-primary text-brand-bg' : 'border border-brand-border bg-brand-card text-brand-primary hover:bg-brand-primary/5'}`}>Plan a Goal</button>
      </div>
      <div id="investment-mode-growth" hidden={mode !== 'growth'}><CompoundInterestCalculator /></div>
      <div id="investment-mode-goal" hidden={mode !== 'goal'}><InvestmentGoalPlanner /></div>
    </section>
  );
}
