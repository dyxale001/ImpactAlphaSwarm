import { useEffect } from 'react'
import { Layers, ArrowUpRight, Activity, Search, Check, Eye, ArrowRight, Terminal } from 'lucide-react'
import { useOnboarding } from '../hooks/useOnboarding'
import { SURVEY_QUESTIONS, UNIVERSE_OPTIONS, INVESTOR_PATHS, FAMILIAR_ASSETS } from '../utils/onboardingData'
import InvestorProfileCard from '../components/InvestorProfileCard'
import { useAuthStore } from '../store/authStore'

// ─── Display maps ──────────────────────────────────────────────────────────

// Lucide icons per investor path id
const PATH_ICONS: Record<string, React.ElementType> = {
  steady_builder: Layers,
  growth_seeker:  ArrowUpRight,
  trend_rider:    Activity,
  value_hunter:   Search,
}

// Sector accent dot per universe option
const SECTOR_DOT: Record<string, string> = {
  'Technology':    'bg-sector-technology',
  'Green Energy':  'bg-sector-green-energy',
  'Finance':       'bg-sector-finance',
  'AI & Robotics': 'bg-sector-ai-robotics',
  'Healthcare':    'bg-sector-healthcare',
}

const STEP_TITLES = ['Your Path', 'What You Know', 'Assessment', 'Profile']
const STEP_SUBS = ['Investing style', 'Companies you follow', 'Risk & literacy', 'Your mandate']
const STEP_EYEBROWS = [
  'Step 01 of 04 · Your Path',
  'Step 02 of 04 · What You Know',
  'Step 03 of 04 · Assessment',
  'Step 04 of 04 · Profile',
]
const STEP_HEADS = ['How Do You Like to Invest?', 'What Do You Already Follow?', 'Your Risk Profile', 'Your Profile Is Ready']
const STEP_LEADS = [
  'Pick the style that sounds most like you, adjustable any time.',
  "Select companies you recognise. We'll suggest sectors and can start your watchlist.",
  'These questions set the foundation for how the Swarm sizes and filters for you.',
  'Every recommendation you see will be filtered through this mandate.',
]

// Display casing only; stored DB values stay lowercase
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  const answeredCount = Object.keys(formData.surveyAnswers).length
  const totalQuestions = SURVEY_QUESTIONS.length
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100)

  const firstName = user?.user_metadata?.first_name || 'Authorised'
  const lastName = user?.user_metadata?.last_name || 'Investor'
  const pathLabel = INVESTOR_PATHS.find((p) => p.id === investorPath)?.label ?? 'Steady Builder'

  return (
    <div className="grid min-h-screen grid-cols-1 bg-neutral-100 font-sans text-forest-900 selection:bg-lime-500 selection:text-forest-900 lg:grid-cols-[320px_1fr]">
      {/* ═══ Left rail ═══ */}
      <div className="p-6 lg:sticky lg:top-0 lg:h-screen">
        <div className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-forest-900 p-7">
          <svg viewBox="0 0 400 400" className="pointer-events-none absolute -top-[160px] -right-[140px] h-[340px] w-[340px]" aria-hidden="true">
            <circle cx="200" cy="200" r="190" className="fill-lime-500" opacity="0.14" />
          </svg>
          <span className="relative flex items-center gap-2 text-[19px] font-extrabold tracking-[-0.04em] text-white">
            <Terminal size={19} className="text-lime-500" strokeWidth={2} />
            AlphaSwarm
          </span>

          {/* Vertical step tracker (compact horizontal pills on mobile) */}
          <div className="relative mt-7 hidden flex-col lg:flex">
            {STEP_TITLES.map((title, i) => {
              const n = i + 1
              const done = step > n
              const current = step === n
              return (
                <div key={title} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all duration-300 ${
                        done
                          ? 'border-lime-500 bg-lime-500 text-forest-900'
                          : current
                            ? 'border-lime-500/60 bg-white/12 text-lime-500'
                            : 'border-white/15 text-neutral-100/40'
                      }`}
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : String(n).padStart(2, '0')}
                    </div>
                    {i < STEP_TITLES.length - 1 && (
                      <div className={`mt-1 min-h-5 w-px flex-1 ${done ? 'bg-lime-500/50' : 'bg-white/12'}`} />
                    )}
                  </div>
                  <div className="pt-[7px] pb-3.5">
                    <p className={`text-sm font-semibold ${current || done ? 'text-white' : 'text-neutral-100/45'}`}>{title}</p>
                    <p className={`mt-0.5 text-[11px] ${current ? 'text-lime-500' : 'text-neutral-100/35'}`}>{STEP_SUBS[i]}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="relative mt-5 flex items-center gap-2 lg:hidden">
            {STEP_TITLES.map((title, i) => {
              const n = i + 1
              const done = step > n
              const current = step === n
              return (
                <div key={title} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all duration-300 ${
                      done
                        ? 'border-lime-500 bg-lime-500 text-forest-900'
                        : current
                          ? 'border-lime-500/60 bg-white/12 text-lime-500'
                          : 'border-white/15 text-neutral-100/40'
                    }`}
                  >
                    {done ? <Check size={13} strokeWidth={3} /> : String(n).padStart(2, '0')}
                  </div>
                  {i < STEP_TITLES.length - 1 && <div className={`h-px flex-1 ${done ? 'bg-lime-500/50' : 'bg-white/12'}`} />}
                </div>
              )
            })}
          </div>

          {/* Squiggle + note pinned to the rail bottom */}
          <div className="relative mt-auto hidden min-h-0 lg:block">
            <svg
              viewBox="0 0 260 120"
              preserveAspectRatio="xMidYMax meet"
              className="block w-full overflow-visible"
              style={{ height: 'clamp(48px, 12vh, 110px)' }}
              aria-hidden="true"
            >
              <path
                pathLength={1}
                d="M-10,90 C50,40 110,110 170,60 C210,28 240,50 270,30"
                fill="none"
                className="ribbon-draw stroke-lime-500"
                strokeWidth={20}
                strokeLinecap="round"
                strokeDasharray="1"
                style={{ '--ribbon-draw-duration': '1400ms' } as React.CSSProperties}
              />
            </svg>
            <p className="mt-2.5 text-[11px] leading-normal text-neutral-100/60">
              A few minutes of setup. Every signal you'll see is shaped to this profile.
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Content column ═══ */}
      <div className="flex justify-center px-6 pt-4 pb-24 sm:px-12 lg:pt-16">
        <form onSubmit={handleSubmit} className="flex w-full max-w-[680px] flex-col gap-7">
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-eyebrow text-muted">{STEP_EYEBROWS[step - 1]}</p>
            <h1 className="mb-2.5 text-[32px] font-medium leading-[1.1] tracking-tight text-forest-700 md:text-[40px]">
              {STEP_HEADS[step - 1]}
            </h1>
            <p className="text-[15px] leading-relaxed text-muted">{STEP_LEADS[step - 1]}</p>
          </div>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          {/* ── STEP 1: investor path ── */}
          {step === 1 && (
            <div key="step1" className="animate-fade-up grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {INVESTOR_PATHS.map((path) => {
                const selected = investorPath === path.id
                const PathIcon = PATH_ICONS[path.id] ?? Layers
                return (
                  <button
                    key={path.id}
                    type="button"
                    onClick={() => setInvestorPath(path.id)}
                    aria-pressed={selected}
                    className={`relative rounded-xl border bg-white p-5 text-left transition-all duration-150 ${
                      selected
                        ? 'border-lime-500 shadow-[0_0_0_4px_rgba(199,242,105,0.35),0_8px_24px_rgba(17,35,32,0.06)]'
                        : 'border-forest-900/10 shadow-sm'
                    }`}
                  >
                    <div
                      className={`mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-md transition-all duration-150 ${
                        selected ? 'bg-forest-700 text-lime-500' : 'bg-forest-900/6 text-muted'
                      }`}
                    >
                      <PathIcon size={18} strokeWidth={1.75} />
                    </div>
                    <p className="text-[15px] font-bold text-forest-900">{path.label}</p>
                    <p className="mt-[3px] mb-1.5 text-xs font-semibold text-forest-700">{path.tagline}</p>
                    <p className="text-xs leading-[1.55] text-muted">{path.desc}</p>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── STEP 2: familiar assets ── */}
          {step === 2 && (
            <div key="step2" className="animate-fade-up flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-muted">
                  {familiarAssets.length === 0 ? 'Select any you recognise, or skip.' : `${familiarAssets.length} selected`}
                </p>
                {familiarAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => familiarAssets.forEach((t) => toggleFamiliarAsset(t))}
                    className="text-xs text-muted-foreground transition-colors hover:text-forest-900"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {FAMILIAR_ASSETS.map((asset) => {
                  const selected = familiarAssets.includes(asset.ticker)
                  return (
                    <button
                      key={asset.ticker}
                      type="button"
                      onClick={() => toggleFamiliarAsset(asset.ticker)}
                      aria-pressed={selected}
                      className={`min-w-0 overflow-hidden rounded-[14px] border bg-white p-3 text-left transition-all duration-150 ${
                        selected
                          ? 'border-lime-500 shadow-[0_0_0_3px_rgba(199,242,105,0.35)]'
                          : 'border-forest-900/10 shadow-xs'
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-[5px]">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SECTOR_DOT[asset.sector] ?? 'bg-sector-technology'}`} />
                        <span className="truncate text-[8px] font-bold uppercase tracking-[0.08em] text-muted">
                          {asset.sector.replace(' & Robotics', '')}
                        </span>
                      </div>
                      <p className="text-sm font-extrabold tracking-tight text-forest-900">{asset.ticker}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{asset.name}</p>
                    </button>
                  )
                })}
              </div>

              {familiarAssets.length > 0 && (
                <>
                  {(() => {
                    const counts: Record<string, number> = {}
                    familiarAssets.forEach((t) => {
                      const a = FAMILIAR_ASSETS.find((f) => f.ticker === t)
                      if (a) counts[a.sector] = (counts[a.sector] || 0) + 1
                    })
                    const top = Object.entries(counts).sort(([, a], [, b]) => b - a).map(([s]) => s)
                    return (
                      <div className="flex items-center gap-2.5 rounded-md border border-lime-500/60 bg-lime-100 px-4 py-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-forest-700">Suggested</span>
                        <span className="text-xs text-muted">{top.join(' · ')}</span>
                      </div>
                    )
                  })()}
                  <button
                    type="button"
                    onClick={() => setAddPicksToWatchlist(!addPicksToWatchlist)}
                    aria-pressed={addPicksToWatchlist}
                    className="flex items-center gap-2.5 rounded-md border border-forest-900/14 bg-white px-4 py-3 text-left transition-colors hover:border-forest-900/28"
                  >
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150 ${
                        addPicksToWatchlist ? 'border-lime-500 bg-lime-500' : 'border-forest-900/25 bg-transparent'
                      }`}
                    >
                      {addPicksToWatchlist && <Check size={10} strokeWidth={3.5} className="text-forest-900" />}
                    </span>
                    <Eye size={14} className="shrink-0 text-muted" strokeWidth={2} />
                    <span className="text-[13px] text-forest-900">
                      Also add {familiarAssets.length === 1 ? 'this' : 'these'} to my watchlist
                    </span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── STEP 3: assessment ── */}
          {step === 3 && (
            <div key="step3" className="animate-fade-up flex flex-col gap-7">
              <div className="sticky top-0 z-5 border-b border-forest-900/8 bg-neutral-100 py-3">
                <div className="mb-2 flex justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Assessment Progress</span>
                  <span className="text-[11px] font-semibold text-forest-700">
                    {answeredCount} / {totalQuestions}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-forest-900/8">
                  <div
                    className="h-full rounded-full bg-lime-500 transition-[width] duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {SURVEY_QUESTIONS.map((q) => (
                <div key={q.id} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
                  <p className="text-[15px] font-semibold leading-normal text-forest-900">{q.question}</p>
                  <div className="flex flex-col gap-2">
                    {q.options.map((opt) => {
                      const selected = formData.surveyAnswers[q.id] === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSurveyAnswer(q.id, opt.value)}
                          className={`flex items-center gap-3 rounded-md border px-3.5 py-[11px] text-left transition-all duration-150 ${
                            selected ? 'border-lime-500/80 bg-lime-100' : 'border-forest-900/8 bg-neutral-100/60'
                          }`}
                        >
                          <span
                            className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                              selected ? 'border-forest-900' : 'border-forest-900/25'
                            }`}
                          >
                            {selected && <span className="h-1.5 w-1.5 rounded-full bg-forest-900" />}
                          </span>
                          <span className={`text-[13px] leading-[1.45] ${selected ? 'font-semibold text-forest-900' : 'text-muted'}`}>
                            {opt.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <div className="rounded-xl bg-white p-6 shadow-sm">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-eyebrow text-forest-700">Target Sectors</p>
                <p className="mb-3.5 text-[13px] text-muted">
                  {formData.universe.length > 0
                    ? 'Pre-filled from your picks, adjust as needed.'
                    : 'Select sectors where you want the Swarm to look.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {UNIVERSE_OPTIONS.map((item) => {
                    const selected = formData.universe.includes(item)
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleUniverse(item)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition-all duration-150 ${
                          selected
                            ? 'border-forest-700 bg-forest-700 text-white'
                            : 'border-forest-900/14 bg-white text-muted'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${SECTOR_DOT[item] ?? 'bg-sector-technology'}`} />
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: profile ── */}
          {step === 4 && (
            <div key="step4" className="animate-fade-up flex flex-col items-center gap-6">
              <div className="w-full max-w-[520px]">
                <InvestorProfileCard
                  name={`${firstName} ${lastName}`}
                  archetype={psychometrics.riskTolerance}
                  experience={capitalise(psychometrics.calculatedExpertise)}
                  path={pathLabel}
                  sectors={formData.universe.length ? formData.universe : ['Technology']}
                />
              </div>
              <p className="max-w-[420px] text-center text-[13px] leading-relaxed text-muted">
                You're classified as <span className="font-bold text-forest-900">{psychometrics.riskTolerance}</span>.
                Every recommendation the Swarm shows you will be filtered through this mandate, adjustable any time in
                Settings.
              </p>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex items-center gap-3 border-t border-forest-900/8 pt-5">
            {step > 1 && (
              <button
                type="button"
                onClick={prevStep}
                disabled={loading}
                className="rounded-full border border-forest-900/14 px-7 py-3.5 text-sm font-semibold text-muted transition-colors hover:border-forest-900/28 hover:text-forest-900 disabled:opacity-40"
              >
                Back
              </button>
            )}

            {step === 2 && familiarAssets.length === 0 && (
              <button
                type="submit"
                className="px-2 text-[13px] text-muted-foreground underline underline-offset-[3px] transition-colors hover:text-forest-900"
              >
                Skip
              </button>
            )}

            <button
              type="submit"
              disabled={loading || (step === 3 && (progressPercent < 100 || formData.universe.length === 0))}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-forest-700 p-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-85 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading
                ? 'Initializing AlphaSwarm…'
                : step === 1
                  ? 'Continue'
                  : step === 2
                    ? familiarAssets.length > 0
                      ? `Continue with ${familiarAssets.length} picks`
                      : 'Continue'
                    : step === 3
                      ? 'Generate Profile'
                      : 'Confirm & Enter Dashboard'}
              {!loading && <ArrowRight size={16} strokeWidth={2} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
