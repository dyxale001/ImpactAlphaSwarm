import { Layers, ArrowUpRight, Activity, Search, Check, Cpu, Zap, TrendingUp, Bot, Heart, Eye } from 'lucide-react'
import { useOnboarding } from '../hooks/useOnboarding'
import { SURVEY_QUESTIONS, UNIVERSE_OPTIONS, INVESTOR_PATHS, FAMILIAR_ASSETS } from '../utils/onboardingData'
import InvestorCard from '../components/InvestorCard'
import { useAuthStore } from '../store/authStore'

// ─── Icon maps ─────────────────────────────────────────────────────────────

// Lucide icons per investor path id
const PATH_ICONS: Record<string, React.ElementType> = {
  steady_builder: Layers,
  growth_seeker:  ArrowUpRight,
  trend_rider:    Activity,
  value_hunter:   Search,
}

// Sector colour system — dot + border accent
const SECTOR_COLOR: Record<string, { dot: string; border: string; bg: string; label: string; Icon: React.ElementType }> = {
  'Technology':    { dot: 'bg-blue-400',   border: 'border-blue-400/50',   bg: 'bg-blue-400/8',   label: 'text-blue-400',   Icon: Cpu },
  'Green Energy':  { dot: 'bg-green-400',  border: 'border-green-400/50',  bg: 'bg-green-400/8',  label: 'text-green-400',  Icon: Zap },
  'Finance':       { dot: 'bg-amber-400',  border: 'border-amber-400/50',  bg: 'bg-amber-400/8',  label: 'text-amber-400',  Icon: TrendingUp },
  'AI & Robotics': { dot: 'bg-purple-400', border: 'border-purple-400/50', bg: 'bg-purple-400/8', label: 'text-purple-400', Icon: Bot },
  'Healthcare':    { dot: 'bg-pink-400',   border: 'border-pink-400/50',   bg: 'bg-pink-400/8',   label: 'text-pink-400',   Icon: Heart },
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { user } = useAuthStore()

  const {
    step,
    formData,
    error,
    loading,
    psychometrics,
    investorPath,
    setInvestorPath,
    familiarAssets,
    toggleFamiliarAsset,
    addPicksToWatchlist,
    setAddPicksToWatchlist,
    handleSubmit,
    toggleUniverse,
    prevStep,
    handleSurveyAnswer,
  } = useOnboarding()

  const answeredCount = Object.keys(formData.surveyAnswers).length
  const totalQuestions = SURVEY_QUESTIONS.length
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100)

  const stepTitles = ['Your Path', 'What You Know', 'Assessment', 'Profile']

  return (
    <div className="min-h-screen py-6 md:py-12 flex items-center justify-center bg-brand-bg auth-bg p-4 relative overflow-hidden selection:bg-brand-primary selection:text-white">
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-brand-bg/40 via-brand-bg/80 to-brand-bg pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand-accent/20 rounded-full blur-[150px] pointer-events-none" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex w-full max-w-2xl flex-col gap-5 p-6 md:p-8 rounded-2xl shadow-2xl bg-brand-bg/60 backdrop-blur-xl border border-brand-border/60 max-h-[92vh]"
      >

        {/* ── Step indicator ─────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-0 mb-1">
          {stepTitles.map((title, i) => {
            const n = i + 1
            const isComplete = step > n
            const isCurrent = step === n
            return (
              <div key={n} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                    isComplete ? 'bg-brand-accent text-brand-bg' :
                    isCurrent  ? 'bg-brand-primary text-white' :
                                 'bg-brand-border/30 text-brand-muted-fg/50'
                  }`}>
                    {isComplete ? <Check size={10} strokeWidth={3} /> : n}
                  </div>
                  <span className={`text-[9px] font-medium whitespace-nowrap ${isCurrent ? 'text-brand-fg' : 'text-brand-muted-fg/40'}`}>
                    {title}
                  </span>
                </div>
                {i < stepTitles.length - 1 && (
                  <div className={`flex-1 h-px mx-1.5 mb-3 transition-colors duration-300 ${step > n ? 'bg-brand-accent/50' : 'bg-brand-border/30'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="text-center shrink-0">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-fg tracking-tight">
            {step === 1 && 'How do you like to invest?'}
            {step === 2 && 'What do you already follow?'}
            {step === 3 && 'Risk Profile Assessment'}
            {step === 4 && 'Profile Authorised'}
          </h1>
          <p className="text-brand-muted-fg mt-1.5 text-sm">
            {step === 1 && 'Pick the style that sounds most like you — adjustable any time.'}
            {step === 2 && "Select companies you recognise — we'll suggest sectors and can start your watchlist."}
            {step === 3 && 'Sets the foundation for position sizing calculations.'}
            {step === 4 && 'Calibrates your AI risk mandate and recommendation filter.'}
            {step === 5 && 'Review your AI-generated institutional profile.'}
          </p>
        </div>

        {error && (
          <div className="text-semantic-danger text-sm bg-semantic-danger/10 border border-semantic-danger/20 px-4 py-3 rounded-lg font-medium shrink-0">
            {error}
          </div>
        )}

        {/* ── STEP 1: Investor Path ──────────────────────────────────────── */}
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-400 overflow-y-auto">
            {INVESTOR_PATHS.map(path => {
              const selected = investorPath === path.id
              const PathIcon = PATH_ICONS[path.id] ?? Layers
              return (
                <button
                  key={path.id}
                  type="button"
                  onClick={() => setInvestorPath(path.id)}
                  aria-pressed={selected}
                  className={`relative text-left p-4 rounded-xl border transition-all duration-150 active:scale-[0.98] focus:outline-none ${
                    selected
                      ? 'border-brand-primary/50 bg-brand-primary/5'
                      : 'border-brand-border/40 bg-brand-bg/20 hover:border-brand-border/70 hover:bg-brand-bg/40'
                  }`}
                >
                  {selected && (
                    <span className="absolute top-3 right-3 w-4 h-4 rounded-full bg-brand-primary flex items-center justify-center animate-in zoom-in-75 duration-150">
                      <Check size={9} strokeWidth={3.5} className="text-white" />
                    </span>
                  )}

                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                    selected ? 'bg-brand-primary/15' : 'bg-brand-border/20'
                  }`}>
                    <PathIcon size={15} className={selected ? 'text-brand-primary' : 'text-brand-muted-fg'} strokeWidth={1.75} />
                  </div>

                  <p className="text-sm font-bold text-brand-fg leading-tight">{path.label}</p>
                  <p className={`text-[11px] font-semibold mt-0.5 mb-1.5 ${selected ? 'text-brand-primary' : 'text-brand-muted-fg'}`}>
                    {path.tagline}
                  </p>
                  <p className="text-[11px] text-brand-muted-fg leading-relaxed">{path.desc}</p>
                </button>
              )
            })}
          </div>
        )}

        {/* ── STEP 2: Asset Familiarity Picker ──────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col flex-1 min-h-0 animate-in fade-in slide-in-from-right-4 duration-400">

            {/* Count bar */}
            <div className="shrink-0 flex items-center justify-between mb-3">
              <p className="text-xs text-brand-muted-fg">
                {familiarAssets.length === 0
                  ? 'Select any you recognise — or skip.'
                  : <><span className="font-semibold text-brand-fg">{familiarAssets.length}</span> selected</>
                }
              </p>
              {familiarAssets.length > 0 && (
                <button
                  type="button"
                  onClick={() => familiarAssets.forEach(t => toggleFamiliarAsset(t))}
                  className="text-[11px] text-brand-muted-fg hover:text-brand-fg transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-2">
                {FAMILIAR_ASSETS.map(asset => {
                  const selected = familiarAssets.includes(asset.ticker)
                  const sc = SECTOR_COLOR[asset.sector] ?? SECTOR_COLOR['Technology']
                  return (
                    <button
                      key={asset.ticker}
                      type="button"
                      onClick={() => toggleFamiliarAsset(asset.ticker)}
                      aria-pressed={selected}
                      className={`relative text-left p-3 rounded-xl border transition-all duration-150 active:scale-95 focus:outline-none ${
                        selected
                          ? `${sc.border} ${sc.bg}`
                          : 'border-brand-border/30 bg-brand-bg/15 hover:border-brand-border/60 hover:bg-brand-bg/40'
                      }`}
                    >
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-brand-primary flex items-center justify-center animate-in zoom-in-75 duration-150">
                          <Check size={8} strokeWidth={3.5} className="text-white" />
                        </span>
                      )}

                      {/* Sector dot + label */}
                      <div className="flex items-center gap-1 mb-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                        <span className={`text-[8px] font-bold uppercase tracking-wider truncate ${sc.label}`}>
                          {asset.sector.replace(' & Robotics', '')}
                        </span>
                      </div>

                      {/* Ticker — the hero */}
                      <p className="text-sm font-black font-mono text-brand-fg leading-none tracking-tight">
                        {asset.ticker}
                      </p>
                      <p className="text-[10px] text-brand-muted-fg mt-0.5 truncate leading-tight">
                        {asset.name}
                      </p>
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
              const top = Object.entries(counts).sort(([, a], [, b]) => b - a).map(([s]) => s)
              return (
                <div className="shrink-0 mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-brand-accent/25 bg-brand-accent/5 animate-in fade-in duration-300">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">Suggested</span>
                  <span className="text-[10px] text-brand-muted-fg">{top.join(' · ')}</span>
                </div>
              )
            })()}

            {/* Watchlist opt-in */}
            {familiarAssets.length > 0 && (
              <button
                type="button"
                onClick={() => setAddPicksToWatchlist(!addPicksToWatchlist)}
                aria-pressed={addPicksToWatchlist}
                className="shrink-0 mt-2 flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-brand-border/40 bg-brand-bg/20 hover:border-brand-border/70 transition-colors text-left animate-in fade-in duration-300"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  addPicksToWatchlist
                    ? 'bg-brand-primary border-brand-primary'
                    : 'border-brand-muted-fg/40'
                }`}>
                  {addPicksToWatchlist && <Check size={9} strokeWidth={3.5} className="text-white" />}
                </span>
                <Eye className="w-3.5 h-3.5 text-brand-muted-fg shrink-0" />
                <span className="text-[11px] text-brand-fg">
                  Also add {familiarAssets.length === 1 ? 'this' : 'these'} to my watchlist
                </span>
              </button>
            )}
          </div>
        )}

        {/* ── STEP 3: Survey & Sectors ───────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col flex-1 min-h-0 animate-in fade-in slide-in-from-right-4 duration-400">

            {/* Progress */}
            <div className="shrink-0 pb-3 mb-4 border-b border-brand-border/40">
              <div className="flex justify-between text-[10px] font-mono text-brand-muted-fg mb-2">
                <span>Assessment Progress</span>
                <span>{answeredCount} / {totalQuestions}</span>
              </div>
              <div className="w-full bg-brand-border/30 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-brand-accent h-full transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar flex flex-col gap-7 pb-4">
              {SURVEY_QUESTIONS.map(q => (
                <div key={q.id} className="flex flex-col gap-3">
                  <label className="text-[14px] text-brand-fg font-medium leading-relaxed max-w-[95%]">
                    {q.question}
                  </label>
                  <div className="flex flex-col gap-2">
                    {q.options.map(opt => {
                      const isSelected = formData.surveyAnswers[q.id] === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSurveyAnswer(q.id, opt.value)}
                          className={`text-left px-3.5 py-3 rounded-lg border transition-all duration-150 group ${
                            isSelected
                              ? 'border-brand-accent/60 bg-brand-accent/5'
                              : 'border-brand-border/30 bg-brand-bg/20 hover:border-brand-border/60 hover:bg-brand-bg/30'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                              isSelected ? 'border-brand-accent' : 'border-brand-muted-fg/30'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />}
                            </div>
                            <span className={`text-[13px] leading-snug ${isSelected ? 'text-brand-fg font-medium' : 'text-brand-muted-fg group-hover:text-brand-fg'}`}>
                              {opt.label}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Sector selection */}
              <div className="flex flex-col gap-3 pt-5 border-t border-brand-border/40">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-brand-muted-fg mb-0.5">Target Sectors</p>
                  <p className="text-xs text-brand-muted-fg">
                    {formData.universe.length > 0
                      ? 'Pre-filled from your picks — adjust as needed.'
                      : 'Select sectors where you want to deploy capital.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {UNIVERSE_OPTIONS.map(item => {
                    const isSelected = formData.universe.includes(item)
                    const sc = SECTOR_COLOR[item]
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleUniverse(item)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border ${
                          isSelected && sc
                            ? `${sc.border} ${sc.bg} ${sc.label}`
                            : isSelected
                            ? 'border-brand-primary/50 bg-brand-primary/8 text-brand-fg'
                            : 'border-brand-border/40 text-brand-muted-fg hover:border-brand-border/70 hover:text-brand-fg'
                        }`}
                      >
                        {sc && <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} flex-shrink-0`} />}
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Profile Review ─────────────────────────────────────── */}
        {step === 4 && (
          <div className="flex flex-col gap-5 animate-in zoom-in-95 fade-in duration-400 overflow-y-auto py-4">
            <InvestorCard
              firstName={user?.user_metadata?.first_name || 'Authorised'}
              lastName={user?.user_metadata?.last_name || 'Investor'}
              universe={formData.universe}
              tolerance={psychometrics.riskTolerance}
              expertise={psychometrics.calculatedExpertise}
            />
            <p className="text-center text-xs text-brand-muted-fg max-w-md mx-auto">
              Classified as{' '}
              <span className="text-brand-fg font-semibold">{psychometrics.riskTolerance}</span>.
              All AI recommendations will be filtered through this risk mandate.
            </p>
          </div>
        )}

        {/* ── Navigation ────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-3 pt-4 border-t border-brand-border/40">
          {step > 1 && (
            <button
              type="button"
              onClick={prevStep}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl border border-brand-border/50 text-brand-muted-fg text-sm font-medium hover:text-brand-fg hover:border-brand-border transition-all duration-150 disabled:opacity-40"
            >
              Back
            </button>
          )}

          {step === 2 && familiarAssets.length === 0 && (
            <button
              type="submit"
              className="text-xs text-brand-muted-fg hover:text-brand-fg underline underline-offset-2 transition-colors px-1"
            >
              Skip
            </button>
          )}

          <button
            type="submit"
            disabled={loading || (step === 3 && (progressPercent < 100 || formData.universe.length === 0))}
            className="flex-1 bg-accent hover:bg-accent/80 hover:shadow-glow-accent text-brand-fg py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            {loading
              ? 'Initializing AlphaSwarm…'
              : step === 1 ? 'Continue'
              : step === 2 ? (familiarAssets.length > 0 ? `Continue with ${familiarAssets.length} picks` : 'Continue')
              : step === 3 ? 'Generate Profile'
              : 'Confirm & Enter Dashboard'}
          </button>
        </div>

      </form>
    </div>
  )
}