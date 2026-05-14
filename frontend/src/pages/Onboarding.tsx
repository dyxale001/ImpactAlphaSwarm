import { useOnboarding } from '../hooks/useOnboarding'
import { formatNumberWithSpaces, unformatNumberSpaces } from '../utils/stringFormatters'
import { SURVEY_QUESTIONS, UNIVERSE_OPTIONS } from '../utils/onboardingData'
import InvestorCard from '../components/InvestorCard';
import { useAuthStore } from '../store/authStore';

export default function Onboarding() {
  const {user} = useAuthStore()


  const { 
    step, formData, setFormData, error, loading,
    psychometrics, 
    handleSubmit, toggleUniverse, prevStep, 
    handleSurveyAnswer 
  } = useOnboarding()

  const defaultInput = "bg-brand-secondary border border-brand-border text-brand-fg placeholder:text-brand-border p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all w-full"
  
  const answeredCount = Object.keys(formData.surveyAnswers).length;
  const totalQuestions = SURVEY_QUESTIONS.length;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

  return (
    <div className="min-h-screen py-6 md:py-12 flex items-center justify-center bg-brand-bg p-4 relative overflow-hidden selection:bg-brand-primary selection:text-white">
      <div 
        className="fixed inset-0 z-0 opacity-20 bg-cover bg-center pointer-events-none mix-blend-luminosity"
        style={{ backgroundImage: 'url("/backgrounds/abstract-dark.jpg")' }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-brand-bg/40 via-brand-bg/80 to-brand-bg pointer-events-none"></div>
      
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand-accent/20 rounded-full blur-[150px] pointer-events-none"></div>

      <form onSubmit={handleSubmit} className="relative z-10 flex w-full max-w-2xl flex-col gap-5 p-6 md:p-8 rounded-2xl shadow-2xl bg-brand-bg/60 backdrop-blur-xl border border-brand-border/60 max-h-[92vh]">

        <div className="text-center shrink-0">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-fg tracking-tight">
            {step === 1 && "Initial Capital Allocation"}
            {step === 2 && "Risk Profile Assessment"}
            {step === 3 && "Profile Authorized"}
          </h1>
          <p className="text-brand-muted-fg mt-1.5 text-sm md:text-base">
            {step === 1 && "Establish the foundation for your portfolio."}
            {step === 2 && "Help the intelligence engine map your ideal strategy."}
            {step === 3 && "Review your AI-generated institutional profile."}
          </p>
        </div>

        {error && (
          <div className="text-semantic-danger text-sm bg-semantic-danger/10 border border-semantic-danger/20 p-4 rounded-lg font-medium shrink-0">
            {error}
          </div>
        )}
        
        {/* ================= PHASE 1: FINANCIALS ================= */}
        {step === 1 && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-[11px] text-brand-muted-fg font-semibold tracking-wider uppercase">Starting Capital (ZAR)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted-fg font-bold">R</span>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  placeholder="250 000" 
                  value={formatNumberWithSpaces(formData.capital)} 
                  onChange={(e) => {
                    const rawValue = unformatNumberSpaces(e.target.value)
                    setFormData({...formData, capital: rawValue})
                  }} 
                  className={`${defaultInput} pl-9 text-lg font-medium`} 
                />
              </div>
              <p className="text-xs text-brand-muted-fg mt-1">This determines position sizing calculations.</p>
            </div>
          </div>
        )}

        {/* ================= PHASE 2: SURVEY & SECTORS ================= */}
        {step === 2 && (

          <div className="flex flex-col flex-1 min-h-0 animate-in fade-in slide-in-from-right-4 duration-500">
            
            <div className="shrink-0 pb-3 mb-4 border-b border-brand-border/50">
               <div className="flex justify-between text-xs text-brand-muted-fg mb-2 font-mono mt-1">
                 <span>Assessment Progress</span>
                 <span>{answeredCount} / {totalQuestions} answered</span>
               </div>
               <div className="w-full bg-brand-border h-1.5 rounded-full overflow-hidden">
                 <div 
                   className="bg-brand-accent h-full transition-all duration-300 ease-out rounded-full" 
                   style={{ width: `${progressPercent}%` }}
                 />
               </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar flex flex-col gap-8 pb-4">
              
              {SURVEY_QUESTIONS.map((q) => (
                <div key={q.id} className="flex flex-col gap-3.5">
                  <label className="text-[15px] text-brand-fg font-medium leading-relaxed max-w-[95%]">
                    {q.question}
                  </label>
                  
                  <div className="flex flex-col gap-2.5">
                    {q.options.map((opt) => {
                      const isSelected = formData.surveyAnswers[q.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSurveyAnswer(q.id, opt.value)}
                          className={`text-left p-3.5 rounded-lg border transition-all duration-200 group ${
                            isSelected 
                              ? 'border-brand-accent bg-brand-accent/5 shadow-glow-sm' 
                              : 'border-brand-border/40 bg-brand-secondary/30 hover:border-brand-accent/40 hover:bg-brand-secondary'
                          }`}
                        >
                          <div className="flex items-center gap-3.5">
                            <div className={`w-4 h-4 rounded-full border-[1.5px] shadow-inner flex-shrink-0 flex items-center justify-center transition-colors ${
                              isSelected ? 'border-brand-accent bg-brand-bg' : 'border-brand-muted-fg/50'
                            }`}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-brand-accent shadow-[0_0_8px_rgba(var(--brand-accent),0.8)]" />}
                            </div>
                            <span className={`text-[14px] leading-snug ${isSelected ? 'text-brand-fg font-medium' : 'text-brand-muted-fg group-hover:text-brand-fg'}`}>
                              {opt.label}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}


              <div className="flex flex-col gap-4 pt-6 border-t border-brand-border/50">
                <div>
                  <h3 className="text-brand-fg font-medium text-[15px]">Target Sectors</h3>
                  <p className="text-xs text-brand-muted-fg mt-1">Select the industries where you want to deploy capital.</p>
                </div>
                
                <div className="flex flex-wrap gap-2.5">
                  {UNIVERSE_OPTIONS.map((item) => {
                    const isSelected = formData.universe.includes(item);
                    return (
                      <button 
                        key={item} 
                        type="button" 
                        onClick={() => toggleUniverse(item)}
                        className={`px-4 py-2.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                          isSelected 
                            ? 'bg-brand-primary border-brand-primary text-white shadow-glow-primary' 
                            : 'bg-brand-secondary/40 border-brand-border/60 text-brand-muted-fg hover:border-brand-primary/40 hover:text-brand-fg'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ================= PHASE 3: PROFILE SUMMARY ================= */}
        {step === 3 && (
          <div className="flex flex-col gap-6 animate-in zoom-in-95 fade-in duration-500 py-6 overflow-y-auto">
            <InvestorCard
              firstName={user?.user_metadata?.first_name || "Authorized"}
              lastName={user?.user_metadata?.last_name || "Investor"} 
              capital={formData.capital}
              universe={formData.universe}
              archetype={psychometrics.calculatedArchetype}
              expertise={psychometrics.calculatedExpertise}
              sentiment={psychometrics.sentimentBias}
              volatility={psychometrics.volatilityReaction}
            />
            
            <p className="text-center text-sm text-brand-muted-fg max-w-md mx-auto mt-2">
              Based on your answers, AlphaSwarm has classified you as a <span className="text-brand-fg font-semibold">{psychometrics.calculatedArchetype}</span>. All future AI recommendations will be filtered through this risk mandate.
            </p>
          </div>
        )}
        
        {/* Navigation Buttons */}
        <div className="shrink-0 flex items-center gap-4 mt-2 pt-4 border-t border-brand-border/50">
          {step > 1 && (
            <button 
              type="button" 
              onClick={prevStep} 
              disabled={loading} 
              className="px-6 py-3 bg-brand-secondary/50 border border-brand-border hover:border-brand-fg/30 text-brand-fg rounded-xl font-semibold transition-all duration-200"
            >
              Back
            </button>
          )}
          
          <button 
            type="submit" 
            disabled={loading || (step === 2 && (progressPercent < 100 || formData.universe.length === 0))} 
            className={`flex-1 bg-gradient-accent hover:shadow-glow-accent text-brand-fg py-3 rounded-xl font-bold tracking-wide transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none`}
          >
            {loading 
              ? 'Initializing AlphaSwarm...' 
              : step === 1 
                ? 'Continue to Assessment' 
              : step === 2
                ? 'Generate Profile'
                : 'Confirm & Enter Dashboard'}
          </button>
        </div>
      </form>
    </div>
  )
}