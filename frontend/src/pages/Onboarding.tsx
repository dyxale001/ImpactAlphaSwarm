import { useOnboarding } from '../hooks/useOnboarding'
import { formatNumberWithSpaces, unformatNumberSpaces } from '../utils/stringFormatters'
import { SURVEY_QUESTIONS, UNIVERSE_OPTIONS, INVESTOR_PATHS, FAMILIAR_ASSETS } from '../utils/onboardingData'
import InvestorCard from '../components/InvestorCard'
import { useAuthStore } from '../store/authStore'
import { Check } from 'lucide-react'

// ─── Sector colours for the asset picker ──────────────────────────────────
const SECTOR_STYLES: Record<string, { border: string; bg: string; label: string }> = {
  'Technology':    { border: 'border-blue-500/50',   bg: 'bg-blue-500/10',   label: 'text-blue-400' },
  'Green Energy':  { border: 'border-green-500/50',  bg: 'bg-green-500/10',  label: 'text-green-400' },
  'Finance':       { border: 'border-amber-500/50',  bg: 'bg-amber-500/10',  label: 'text-amber-400' },
  'AI & Robotics': { border: 'border-purple-500/50', bg: 'bg-purple-500/10', label: 'text-purple-400' },
  'Healthcare':    { border: 'border-pink-500/50',   bg: 'bg-pink-500/10',   label: 'text-pink-400' },
}

export default function Onboarding() {
  const { user } = useAuthStore()

  const {
    step,
    totalSteps,
    formData,
    setFormData,
    error,
    loading,
    psychometrics,
    investorPath,
    setInvestorPath,
    familiarAssets,
    toggleFamiliarAsset,
    handleSubmit,
    toggleUniverse,
    prevStep,
    handleSurveyAnswer,
  } = useOnboarding()

  const defaultInput = 'bg-brand-bg border border-brand-border text-brand-fg placeholder:text-brand-border p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all w-full'

  const answeredCount = Object.keys(formData.surveyAnswers).length
  const totalQuestions = SURVEY_QUESTIONS.length
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100)

  // Step indicator dots
  const stepTitles = [
    'Your Path',
    'What You Know',
    'Capital',
    'Assessment',
    'Profile',
  ]

  return (
    <div className="min-h-screen py-6 md:py-12 flex items-center justify-center bg-brand-bg auth-bg p-4 relative overflow-hidden selection:bg-brand-primary selection:text-white">
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-brand-bg/40 via-brand-bg/80 to-brand-bg pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand-accent/20 rounded-full blur-[150px] pointer-events-none" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex w-full max-w-2xl flex-col gap-5 p-6 md:p-8 rounded-2xl shadow-2xl bg-brand-bg/60 backdrop-blur-xl border border-brand-border/60 max-h-[92vh]"
      >
        {/* Step indicator */}
        <div className="shrink-0 flex items-center justify-between gap-1">
          {stepTitles.map((title, i) => {
            const n = i + 1
            const isComplete = step > n
            const isCurrent = step === n
            return (
              <div key={n} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                  isComplete ? 'bg-brand-accent text-white' :
                  isCurrent  ? 'bg-brand-primary text-white ring-2 ring-brand-primary/30' :
                               'bg-brand-border/40 text-brand-muted-fg'
                }`}>
                  {isComplete ? <Check size={10} strokeWidth={3} /> : n}
                </div>
                <span className={`text-[9px] font-medium text-center leading-tight ${isCurrent ? 'text-brand-fg' : 'text-brand-muted-fg/60'}`}>
                  {title}
                </span>
              </div>
            )
          })}
        </div>

        {/* Header */}
        <div className="text-center shrink-0">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-fg tracking-tight">
            {step === 1 && 'How do you like to invest?'}
            {step === 2 && 'What do you already know?'}
            {step === 3 && 'Initial Capital Allocation'}
            {step === 4 && 'Risk Profile Assessment'}
            {step === 5 && 'Profile Authorized'}
          </h1>
          <p className="text-brand-muted-fg mt-1.5 text-sm md:text-base">
            {step === 1 && 'Pick the style that sounds most like you. You can always adjust later.'}
            {step === 2 && "Tap any companies you've heard of or follow. We'll use this to personalise your sectors."}
            {step === 3 && 'Establish the foundation for your portfolio.'}
            {step === 4 && 'Help the intelligence engine map your ideal strategy.'}
            {step === 5 && 'Review your AI-generated institutional profile.'}
          </p>
        </div>

        {error && (
          <div className="text-semantic-danger text-sm bg-semantic-danger/10 border border-semantic-danger/20 p-4 rounded-lg font-medium shrink-0">
            {error}
          </div>
        )}

        {/* ── STEP 1: Investor Path ──────────────────────────────────────── */}
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto">
            {INVESTOR_PATHS.map(path => {
              const selected = investorPath === path.id
              return (
                <button
                  key={path.id}
                  type="button"
                  onClick={() => setInvestorPath(path.id)}
                  aria-pressed={selected}
                  className={`relative text-left p-5 rounded-2xl border transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-primary/30 ${
                    selected
                      ? 'border-brand-primary/60 bg-brand-primary/8 shadow-[0_0_24px_rgba(194,102,84,0.18)]'
                      : 'border-brand-border/50 bg-brand-bg/30 hover:border-brand-border hover:bg-brand-bg/60'
                  }`}
                >
                  {selected && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center animate-in zoom-in-75 duration-150 shadow-[0_0_8px_rgba(194,102,84,0.6)]">
                      <Check size={11} strokeWidth={3} className="text-white" />
                    </span>
                  )}
                  <span className="text-3xl mb-3 block">{path.icon}</span>
                  <p className="text-base font-bold text-brand-fg">{path.label}</p>
                  <p className={`text-xs font-semibold mt-0.5 mb-2 ${selected ? 'text-brand-primary' : 'text-brand-muted-fg'}`}>
                    {path.tagline}
                  </p>
                  <p className="text-xs text-brand-muted-fg leading-relaxed">{path.desc}</p>
                </button>
              )
            })}
          </div>
        )}

        {/* ── STEP 2: Asset Familiarity Picker ──────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col flex-1 min-h-0 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Selection count */}
            <div className="shrink-0 flex items-center justify-between mb-3">
              <p className="text-xs text-brand-muted-fg">
                {familiarAssets.length === 0
                  ? 'Tap any you recognise — or skip if none apply.'
                  : <><span className="text-brand-fg font-semibold">{familiarAssets.length}</span> selected</>
                }
              </p>
              {familiarAssets.length > 0 && (
                <button
                  type="button"
                  onClick={() => familiarAssets.forEach(t => toggleFamiliarAsset(t))}
                  className="text-xs text-brand-muted-fg hover:text-brand-fg transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Asset grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pb-2">
                {FAMILIAR_ASSETS.map(asset => {
                  const selected = familiarAssets.includes(asset.ticker)
                  const style = SECTOR_STYLES[asset.sector] ?? SECTOR_STYLES['Technology']
                  return (
                    <button
                      key={asset.ticker}
                      type="button"
                      onClick={() => toggleFamiliarAsset(asset.ticker)}
                      aria-pressed={selected}
                      className={`relative text-left p-3 rounded-xl border transition-all duration-200 active:scale-95 focus:outline-none ${
                        selected
                          ? `${style.border} ${style.bg}`
                          : 'border-brand-border/40 bg-brand-bg/20 hover:border-brand-border hover:bg-brand-bg/50'
                      }`}
                    >
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-brand-primary flex items-center justify-center animate-in zoom-in-75 duration-150">
                          <Check size={9} strokeWidth={3} className="text-white" />
                        </span>
                      )}
                      <span className="text-2xl block mb-1.5">{asset.emoji}</span>
                      <p className="text-xs font-black font-mono text-brand-fg leading-none">{asset.ticker}</p>
                      <p className="text-[10px] text-brand-muted-fg mt-0.5 leading-tight truncate">{asset.name}</p>
                      <p className={`text-[9px] font-semibold mt-1 leading-tight ${style.label}`}>{asset.sector}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Inferred sectors preview */}
            {familiarAssets.length > 0 && (() => {
              const counts: Record<string, number> = {}
              familiarAssets.forEach(t => {
                const a = FAMILIAR_ASSETS.find(f => f.ticker === t)
                if (a) counts[a.sector] = (counts[a.sector] || 0) + 1
              })
              const topSectors = Object.entries(counts).sort(([,a],[,b]) => b - a).map(([s]) => s)
              return (
                <div className="shrink-0 mt-3 p-3 rounded-xl border border-brand-accent/30 bg-brand-accent/5 animate-in fade-in duration-300">
                  <p className="text-[11px] text-brand-muted-fg font-medium">
                    <span className="text-brand-accent font-semibold">Suggested sectors: </span>
                    {topSectors.join(' · ')}
                  </p>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── STEP 3: Capital ────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-[11px] text-brand-muted-fg font-semibold tracking-wider uppercase">
                Starting Capital (ZAR)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted-fg font-bold">R</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="250 000"
                  value={formatNumberWithSpaces(formData.capital)}
                  onChange={e => {
                    const rawValue = unformatNumberSpaces(e.target.value)
                    setFormData({ ...formData, capital: rawValue })
                  }}
                  className={`${defaultInput} pl-9 text-lg font-medium`}
                />
              </div>
              <p className="text-xs text-brand-muted-fg mt-1">This determines position sizing calculations.</p>
            </div>
          </div>
        )}

        {/* ── STEP 4: Survey & Sectors ───────────────────────────────────── */}
        {step === 4 && (
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
              {SURVEY_QUESTIONS.map(q => (
                <div key={q.id} className="flex flex-col gap-3.5">
                  <label className="text-[15px] text-brand-fg font-medium leading-relaxed max-w-[95%]">
                    {q.question}
                  </label>
                  <div className="flex flex-col gap-2.5">
                    {q.options.map(opt => {
                      const isSelected = formData.surveyAnswers[q.id] === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSurveyAnswer(q.id, opt.value)}
                          className={`text-left p-3.5 rounded-lg border transition-all duration-200 group ${
                            isSelected
                              ? 'border-brand-accent bg-brand-accent/5 shadow-glow-sm'
                              : 'border-brand-border/40 bg-brand-bg/30 hover:border-brand-accent/40 hover:bg-brand-secondary/10'
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

              {/* Sector selection — pre-populated from asset picks */}
              <div className="flex flex-col gap-4 pt-6 border-t border-brand-border/50">
                <div>
                  <h3 className="text-brand-fg font-medium text-[15px]">Target Sectors</h3>
                  <p className="text-xs text-brand-muted-fg mt-1">
                    {formData.universe.length > 0
                      ? 'Pre-filled from your asset picks — adjust as needed.'
                      : 'Select the industries where you want to deploy capital.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {UNIVERSE_OPTIONS.map(item => {
                    const isSelected = formData.universe.includes(item)
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleUniverse(item)}
                        className={`px-4 py-2.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                          isSelected
                            ? 'bg-brand-primary border-brand-primary text-white shadow-glow-primary'
                            : 'bg-brand-bg/30 border-brand-border/60 text-brand-muted-fg hover:border-brand-primary/40 hover:text-brand-fg'
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

        {/* ── STEP 5: Profile Review ─────────────────────────────────────── */}
        {step === 5 && (
          <div className="flex flex-col gap-6 animate-in zoom-in-95 fade-in duration-500 py-6 overflow-y-auto">
            <InvestorCard
              firstName={user?.user_metadata?.first_name || 'Authorized'}
              lastName={user?.user_metadata?.last_name || 'Investor'}
              capital={formData.capital}
              universe={formData.universe}
              tolerance={psychometrics.riskTolerance}
              expertise={psychometrics.calculatedExpertise}
            />
            <p className="text-center text-sm text-brand-muted-fg max-w-md mx-auto mt-2">
              Based on your answers, AlphaSwarm has classified you as a{' '}
              <span className="text-brand-fg font-semibold">{psychometrics.riskTolerance}</span>.
              All future AI recommendations will be filtered through this risk mandate.
            </p>
          </div>
        )}

        {/* ── Navigation ────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-4 mt-2 pt-4 border-t border-brand-border/50">
          {step > 1 && (
            <button
              type="button"
              onClick={prevStep}
              disabled={loading}
              className="px-6 py-3 bg-danger/30 border border-danger hover:border-danger hover:text-background hover:bg-danger text-danger hover:shadow-glow-accent rounded-xl font-semibold transition-all duration-200"
            >
              Back
            </button>
          )}

          {/* Skip option for step 2 only */}
          {step === 2 && familiarAssets.length === 0 && (
            <button
              type="submit"
              className="text-sm text-brand-muted-fg hover:text-brand-fg underline underline-offset-2 transition-colors px-2"
            >
              Skip
            </button>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              (step === 4 && (progressPercent < 100 || formData.universe.length === 0))
            }
            className="flex-1 bg-accent hover:shadow-glow-accent text-brand-fg py-3 rounded-xl font-bold tracking-wide transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            {loading
              ? 'Initializing AlphaSwarm…'
              : step === 1 ? 'Continue'
              : step === 2 ? (familiarAssets.length > 0 ? `Continue with ${familiarAssets.length} picks` : 'Continue')
              : step === 3 ? 'Continue to Assessment'
              : step === 4 ? 'Generate Profile'
              : 'Confirm & Enter Dashboard'}
          </button>
        </div>
      </form>
    </div>
  )
}
