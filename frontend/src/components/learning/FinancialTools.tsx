import { useState } from 'react';
import { Calculator } from 'lucide-react';
import InvestmentPlanner from './InvestmentPlanner';
import TFSAPlanner from './TFSAPlanner';

export default function FinancialTools() {
  const [selectedTool, setSelectedTool] = useState<'investment' | 'tfsa'>('investment');
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-primary"><Calculator className="h-4 w-4" aria-hidden="true" />Financial Tools</p>
        <h2 className="text-2xl font-semibold text-brand-fg">Put your learning into practice</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-brand-muted-fg">Explore financial concepts with interactive tools. Change the assumptions and see how they shape an illustrative investment journey.</p>
      </div>
      <div role="group" aria-label="Choose a financial tool" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={selectedTool === 'investment'} aria-controls="tool-investment" onClick={() => setSelectedTool('investment')} className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold ${selectedTool === 'investment' ? 'bg-brand-primary text-brand-bg' : 'border border-brand-border bg-brand-card text-brand-primary hover:bg-brand-primary/5'}`}>Investment Growth &amp; Goal Planner</button>
        <button type="button" aria-pressed={selectedTool === 'tfsa'} aria-controls="tool-tfsa" onClick={() => setSelectedTool('tfsa')} className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold ${selectedTool === 'tfsa' ? 'bg-brand-primary text-brand-bg' : 'border border-brand-border bg-brand-card text-brand-primary hover:bg-brand-primary/5'}`}>TFSA Planner</button>
      </div>
      <div id="tool-investment" hidden={selectedTool !== 'investment'}><InvestmentPlanner /></div>
      <div id="tool-tfsa" hidden={selectedTool !== 'tfsa'}><TFSAPlanner /></div>
    </div>
  );
}
