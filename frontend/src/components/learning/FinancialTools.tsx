import SproutMotif from './SproutMotif';
import LearnMore from './LearnMore';
import { useState } from 'react';
import { Calculator } from 'lucide-react';
import InvestmentPlanner from './InvestmentPlanner';
import TFSAPlanner from './TFSAPlanner';
import { DEFAULT_INFLATION_RATE } from '../../utils/purchasingPower';

export default function FinancialTools() {
  const [inflationRate, setInflationRate] = useState(DEFAULT_INFLATION_RATE);
  const [mode, setMode] = useState<"growth" | "goal">("growth");
  const [selectedTool, setSelectedTool] = useState<'investment' | 'tfsa'>('investment');
  return (
    <div className="space-y-6">
      <header className="hero-card overflow-hidden px-5 sm:px-7 pt-8 pb-12 sm:pb-16">
        <SproutMotif className="h-14 sm:h-full" />
        <div className="relative top-2">
          <p className="absolute bottom-full left-0 text-[10px] font-bold uppercase tracking-widest text-brand-accent mb-1">Financial Tools</p>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-brand-bg lg:text-3xl"><Calculator className="h-7 w-7 shrink-0 text-brand-accent" aria-hidden="true" />Financial Tools</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">Plan your investments, explore potential growth, and understand your financial future.</p>
        </div>
      </header>
      <LearnMore context={selectedTool === "tfsa" ? "tools.tfsa" : `tools.${mode}`} />
      <div role="group" aria-label="Choose a financial tool" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={selectedTool === 'investment'} aria-controls="tool-investment" onClick={() => setSelectedTool('investment')} className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold ${selectedTool === 'investment' ? 'bg-brand-primary text-brand-bg' : 'border border-brand-border bg-brand-card text-brand-primary hover:bg-brand-primary/5'}`}>Investment Growth &amp; Goal Planner</button>
        <button type="button" aria-pressed={selectedTool === 'tfsa'} aria-controls="tool-tfsa" onClick={() => setSelectedTool('tfsa')} className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold ${selectedTool === 'tfsa' ? 'bg-brand-primary text-brand-bg' : 'border border-brand-border bg-brand-card text-brand-primary hover:bg-brand-primary/5'}`}>TFSA Planner</button>
      </div>
      <div id="tool-investment" hidden={selectedTool !== 'investment'}><InvestmentPlanner mode={mode} onModeChange={setMode} inflationRate={inflationRate} onInflationChange={setInflationRate} /></div>
      <div id="tool-tfsa" hidden={selectedTool !== 'tfsa'}><TFSAPlanner inflationRate={inflationRate} onInflationChange={setInflationRate} /></div>
    </div>
  );
}
