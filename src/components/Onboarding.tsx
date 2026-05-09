import { useOnboarding } from '../hooks/useOnboarding'
import SelectionCard from '../components/SelectionCard'
import { 
  RISK_PROFILES, 
  SCENARIO_QUESTIONS, 
  SLIDER_QUESTIONS, 
  UNIVERSE_OPTIONS 
} from '../utils/onboardingData'

export default function Onboarding() {
  const { 
    step, formData, setFormData, error, loading, 
    handleSubmit, toggleUniverse, prevStep, 
    handleScenarioAnswer, handleSliderChange 
  } = useOnboarding()

  const defaultInput = "bg-brand-secondary border border-brand-border text-brand-fg placeholder:text-brand-border p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all w-full"

  return (
    <div className="min-h-screen py-12 flex items-center justify-center bg-brand-bg p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-accent rounded-full blur-[120px] opacity-10 pointer-events-none"></div>

      <form onSubmit={handleSubmit} className="relative z-10 flex w-full max-w-2xl flex-col gap-6 p-8 md:p-10 rounded-brand shadow-card bg-gradient-card border border-brand-border">
        
        {/* Progress Bar */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-2 flex-1">
            {[1, 2, 3].map(i => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-brand-accent shadow-glow-accent' : 'bg-brand-border/50'}`} />
            ))}
          </div>
        </div>

        <div className="text-center mb-2">
          <h1 className="text-3xl font-bold text-brand-fg tracking-tight">
            {step === 1 && "The Vault"}
            {step === 2 && "The Analyst's Couch"}
            {step === 3 && "The War Room"}
          </h1>
          <p className="text-brand-muted-fg mt-2 text-sm md:text-base">
            {step === 1 && "Establish your financial boundaries."}
            {step === 2 && "Let us understand how you think."}
            {step === 3 && "Where should the AI deploy your capital?"}
          </p>
        </div>

        {error && (
          <div className="text-semantic-danger text-sm bg-semantic-danger/10 border border-semantic-danger/20 p-4 rounded-lg font-medium">
            {error}
          </div>
        )}
        
        {/* ================= PHASE 1: FINANCIALS ================= */}
        {step === 1 && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-[11px] text-brand-muted-fg font-semibold tracking-wider uppercase">Initial Ammunition (ZAR)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted-fg font-bold">R</span>
                <input type="number" placeholder="100 000" value={formData.capital} onChange={(e) => setFormData({...formData, capital: e.target.value})} className={`${defaultInput} pl-9`} min="0" />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[11px] text-brand-muted-fg font-semibold tracking-wider uppercase">Foundational Risk Limit</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {RISK_PROFILES.map((risk) => (
                  <SelectionCard key={risk.id} isSelected={formData.riskTolerance === risk.id} onClick={() => setFormData({...formData, riskTolerance: risk.id})} label={risk.label} desc={risk.desc} colorClass={risk.color} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= PHASE 2: GAMIFIED BEHAVIOR ================= */}
        {step === 2 && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500 h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            
            {SCENARIO_QUESTIONS.map((sq, index) => (
              <div key={sq.id} className="flex flex-col gap-3 pb-6 border-b border-brand-border/30 last:border-0">
                <label className="text-sm text-brand-fg font-medium leading-relaxed">
                   <span className="text-brand-accent mr-2 font-mono">0{index + 1}.</span> 
                   {sq.question}
                </label>
                
                <div className="flex flex-col gap-2">
                  {sq.options.map((opt) => (
                    <SelectionCard 
                      key={opt.value} 
                      isSelected={formData.scenarioAnswers[sq.id] === opt.value} 
                      onClick={() => handleScenarioAnswer(sq.id, opt.value)} 
                      label={opt.label} 
                      desc={opt.desc} 
                    />
                  ))}
                </div>
              </div>
            ))}

          </div>
        )}

        {/* ================= PHASE 3: SLIDERS & SECTORS ================= */}
        {step === 3 && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500 h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
             
             <div className="flex flex-col gap-6 bg-brand-bg/30 p-5 rounded-xl border border-brand-border/50">
               <h3 className="text-sm font-bold text-brand-fg mb-2 uppercase tracking-wide">Fine-Tune Your Engine</h3>
               
               {SLIDER_QUESTIONS.map((slider) => (
                 <div key={slider.id} className="flex flex-col gap-2">
                    <label className="text-xs text-brand-muted-fg font-medium">{slider.label}</label>
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={formData.sliderAnswers[slider.id]} 
                      onChange={(e) => handleSliderChange(slider.id, parseInt(e.target.value))}
                      className="w-full accent-brand-accent h-1.5 bg-brand-border rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-brand-muted-fg mt-1 uppercase font-mono">
                      <span>{slider.leftLabel}</span>
                      <span>{slider.rightLabel}</span>
                    </div>
                 </div>
               ))}
             </div>

             {/* Sectors */}
            <div className="flex flex-col gap-3">
              <label className="text-[11px] text-brand-muted-fg font-semibold tracking-wider uppercase flex justify-between">
                <span>Combat Zones (Sectors)</span>
                <span className="text-brand-primary lowercase bg-brand-primary/10 px-2 py-0.5 rounded-full">Select multiple</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {UNIVERSE_OPTIONS.map((item) => {
                  const isSelected = formData.universe.includes(item);
                  return (
                    <button key={item} type="button" onClick={() => toggleUniverse(item)}
                      className={`px-4 py-2 rounded-full text-xs font-mono transition-all duration-200 border ${isSelected ? 'bg-brand-primary border-brand-primary text-brand-fg shadow-glow-primary' : 'bg-brand-secondary border-brand-border text-brand-muted-fg hover:border-brand-primary/50'}`}
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
            </div>
            
          </div>
        )}
        
        {/* Navigation Buttons */}
        <div className="flex gap-4 mt-4 pt-4 border-t border-brand-border/50">
          {step > 1 && (
            <button type="button" onClick={prevStep} disabled={loading} className="w-1/3 bg-brand-secondary border border-brand-border hover:border-brand-primary text-brand-fg py-4 rounded-xl font-bold tracking-wide transition-all duration-300">
              Back
            </button>
          )}
          <button type="submit" disabled={loading} className={`${step > 1 ? 'w-2/3' : 'w-full'} bg-gradient-accent hover:shadow-glow-accent text-brand-fg py-4 rounded-xl font-bold tracking-wide transition-all duration-300 disabled:opacity-50 disabled:hover:shadow-none`}>
            {loading ? 'Analyzing Answers' : step === 3 ? 'Submit' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}