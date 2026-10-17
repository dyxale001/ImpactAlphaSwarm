import CompoundInterestCalculator from './CompoundInterestCalculator';
import InvestmentGoalPlanner from './InvestmentGoalPlanner';

// The two investment calculators behind one small tray, which sits in each
// calculator card's header beside its title (the full redesign's layout) rather
// than under a repeated page heading.
export default function InvestmentPlanner({ inflationRate, onInflationChange, mode, onModeChange }: { inflationRate: string; onInflationChange?: (value: string) => void; mode: "growth" | "goal"; onModeChange: (mode: "growth" | "goal") => void }) {
  const modeSwitch = (
    <div role="group" aria-label="Investment planning mode" className="as-tabs as-tabs-sm grid w-full shrink-0 grid-cols-2 self-start rounded-[16px] sm:inline-flex sm:w-auto sm:rounded-full">
      <button type="button" aria-pressed={mode === 'growth'} aria-controls="investment-mode-growth" onClick={() => onModeChange('growth')} className="as-tab">Project growth</button>
      <button type="button" aria-pressed={mode === 'goal'} aria-controls="investment-mode-goal" onClick={() => onModeChange('goal')} className="as-tab">Plan a goal</button>
    </div>
  );

  return (
    <section aria-labelledby="investment-planner-title" className="min-w-0">
      <h2 id="investment-planner-title" className="sr-only">Growth and goals</h2>
      <div id="investment-mode-growth" hidden={mode !== 'growth'}><CompoundInterestCalculator inflationRate={inflationRate} onInflationChange={onInflationChange} modeSwitch={modeSwitch} /></div>
      <div id="investment-mode-goal" hidden={mode !== 'goal'}><InvestmentGoalPlanner inflationRate={inflationRate} onInflationChange={onInflationChange} modeSwitch={modeSwitch} /></div>
    </section>
  );
}
