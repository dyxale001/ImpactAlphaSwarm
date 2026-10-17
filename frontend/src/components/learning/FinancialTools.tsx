import LearnPopover from './LearnPopover';
import { useState } from 'react';
import { Calculator } from 'lucide-react';
import InvestmentPlanner from './InvestmentPlanner';
import TFSAPlanner from './TFSAPlanner';
import { DEFAULT_INFLATION_RATE } from '../../utils/purchasingPower';

const TOOLS = [
  { id: 'investment', label: 'Growth and goals', short: 'Growth and goals' },
  { id: 'tfsa', label: 'Tax-free savings (TFSA)', short: 'Tax-free (TFSA)' },
] as const;

// The hub header the other pages use, with no motif. Financial Tools has no About
// dialog, so its lessons sit behind the book button, following the tool in view.
export default function FinancialTools() {
  const [inflationRate, setInflationRate] = useState(DEFAULT_INFLATION_RATE);
  const [mode, setMode] = useState<"growth" | "goal">("growth");
  const [selectedTool, setSelectedTool] = useState<'investment' | 'tfsa'>('investment');
  return (
    <div className="space-y-6">
      <header className="hero-card px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="band-eyebrow mb-2">Plan and explore</p>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl"><Calculator className="h-7 w-7 shrink-0 text-brand-accent" aria-hidden="true" />Financial Tools</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">See how saving regularly could grow, what a goal might take, and how much of your tax-free allowance is left. Illustrations, not forecasts.</p>
          </div>
          <LearnPopover context={selectedTool === "tfsa" ? "tools.tfsa" : `tools.${mode}`} onDark className="shrink-0" />
        </div>
      </header>
      <div role="group" aria-label="Choose a financial tool" className="as-tabs grid w-full grid-cols-2 rounded-[20px] sm:inline-flex sm:w-auto sm:rounded-full">
        {TOOLS.map(tool => (
          <button key={tool.id} type="button" aria-pressed={selectedTool === tool.id} aria-controls={`tool-${tool.id}`} aria-label={tool.label} onClick={() => setSelectedTool(tool.id)} className="as-tab px-2 sm:px-4">
            {tool.short === tool.label ? tool.label : <><span className="sm:hidden">{tool.short}</span><span className="hidden sm:inline">{tool.label}</span></>}
          </button>
        ))}
      </div>
      <div id="tool-investment" hidden={selectedTool !== 'investment'}><InvestmentPlanner mode={mode} onModeChange={setMode} inflationRate={inflationRate} onInflationChange={setInflationRate} /></div>
      <div id="tool-tfsa" hidden={selectedTool !== 'tfsa'}><TFSAPlanner inflationRate={inflationRate} onInflationChange={setInflationRate} /></div>
    </div>
  );
}
