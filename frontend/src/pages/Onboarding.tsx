import { useOnboarding } from '../hooks/useOnboarding'

const RISK_PROFILES = [
  { id: 'Conservative', label: 'Shield & Protect', desc: 'Focus on wealth preservation. Steady, reliable dividend growth with minimal volatility.', color: 'hover:border-semantic-info' },
  { id: 'Moderate', label: 'Calculated Growth', desc: 'A balanced approach. Capturing upside momentum while hedging against major market drawdowns.', color: 'hover:border-semantic-success' },
  { id: 'Aggressive', label: 'Max Alpha', desc: 'High risk, high reward. Unlocking volatility to aggressively outpace the market averages.', color: 'hover:border-brand-primary' },
  { id: 'Very Aggressive', label: 'Apex Predator', desc: 'Pure speculation and frontier markets. You thrive in the chaos and ride the deepest waves.', color: 'hover:border-semantic-danger' },
]

const UNIVERSE_OPTIONS = [
  "Technology & AI", "Healthcare & Biotech", "Financials & Fintech", 
  "Real Estate (REITs)", "Energy & Renewables", "Consumer Discretionary", 
  "Industrials & Aerospace", "Emerging Markets", "Precious Metals"
]

export default function Onboarding() {
  const { formData, setFormData, error, loading, handleSubmit, toggleUniverse } = useOnboarding()

  const defaultInput = "bg-brand-secondary border border-brand-border text-brand-fg placeholder:text-brand-border p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all w-full"

  return (
    <div className="min-h-screen py-12 flex items-center justify-center bg-brand-bg p-4 relative overflow-hidden">
        

      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-accent rounded-full blur-[120px] opacity-10 pointer-events-none"></div>

      <form 
        onSubmit={handleSubmit} 
        className="relative z-10 flex w-full max-w-2xl flex-col gap-6 p-8 md:p-10 rounded-brand shadow-card bg-gradient-card border border-brand-border"
      >
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold text-brand-fg tracking-tight">Configure Your Swarm</h1>
          <p className="text-brand-muted-fg mt-2 text-sm md:text-base">Calibrate the AI to match your unique financial DNA.</p>
        </div>

        {error && (
          <div className="text-semantic-danger text-sm bg-semantic-danger/10 border border-semantic-danger/20 p-4 rounded-lg font-medium">
            {error}
          </div>
        )}
        
        {/* SECTION 1: Capital */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-[11px] text-brand-muted-fg font-semibold tracking-wider uppercase">Initial Ammunition (ZAR)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted-fg font-bold">R</span>
            <input 
              type="number" 
              placeholder="100 000" 
              value={formData.capital} 
              onChange={(e) => setFormData({...formData, capital: e.target.value})} 
              className={`${defaultInput} pl-9`} 
              required 
              disabled={loading} 
              min="0"
            />
          </div>
        </div>

        <hr className="border-brand-border/50" />
        
        {/* SECTION 2: Risk Profile Cards */}
        <div className="flex flex-col gap-3">
          <label className="text-[11px] text-brand-muted-fg font-semibold tracking-wider uppercase">Risk Calibration</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RISK_PROFILES.map((risk) => {
              const isSelected = formData.riskTolerance === risk.id;
              return (
                <button
                  key={risk.id}
                  type="button"
                  onClick={() => setFormData({...formData, riskTolerance: risk.id})}
                  className={`p-4 rounded-xl border text-left transition-all duration-200 flex flex-col gap-1 group
                    ${isSelected 
                      ? 'bg-brand-secondary border-brand-accent shadow-glow-accent' 
                      : `bg-brand-bg/50 border-brand-border ${risk.color}`
                    }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className={`font-bold ${isSelected ? 'text-brand-fg' : 'text-brand-muted-fg group-hover:text-brand-fg'}`}>
                      {risk.label}
                    </span>
                    
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors
                      ${isSelected ? 'border-brand-accent bg-brand-accent' : 'border-brand-border'}
                    `}>
                      {isSelected && <div className="w-1.5 h-1.5 bg-brand-bg rounded-full" />}
                    </div>
                  </div>
                  <span className="text-xs text-brand-muted-fg leading-relaxed">{risk.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        <hr className="border-brand-border/50" />
        
        {/* SECTION 3: Investment Universe Pills */}
        <div className="flex flex-col gap-3 mb-4">
          <label className="text-[11px] text-brand-muted-fg font-semibold tracking-wider uppercase flex justify-between">
            <span>Combat Zones (Sectors)</span>
            <span className="text-brand-primary lowercase bg-brand-primary/10 px-2 py-0.5 rounded-full">Select multiple</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {UNIVERSE_OPTIONS.map((item) => {
              const isSelected = formData.universe.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleUniverse(item)}
                  className={`px-4 py-2 rounded-full text-xs font-mono transition-all duration-200 border
                    ${isSelected 
                      ? 'bg-brand-primary border-brand-primary text-brand-fg shadow-glow-primary' 
                      : 'bg-brand-secondary border-brand-border text-brand-muted-fg hover:border-brand-primary/50'
                    }`}
                >
                  {item}
                </button>
              )
            })}
          </div>
        </div>
        
        <button 
          type="submit" 
          disabled={loading} 
          className="w-full bg-gradient-accent hover:shadow-glow-accent text-brand-fg py-4 rounded-xl font-bold tracking-wide transition-all duration-300 disabled:opacity-50 disabled:hover:shadow-none mt-2"
        >
          {loading ? 'Initializing Swarm...' : 'Deploy Analytics'}
        </button>
      </form>
    </div>
  )
}