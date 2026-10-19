import { useEffect, useRef } from 'react'
import { Layers, ArrowUpRight, Activity, Search, Check, ArrowLeft, ArrowRight, Sparkles, Terminal } from 'lucide-react'
import { useOnboarding } from '../hooks/useOnboarding'
import { SURVEY_QUESTIONS, GOAL_QUESTIONS, UNIVERSE_OPTIONS, INVESTOR_PATHS, FAMILIAR_ASSETS } from '../utils/onboardingData'
import GoalQuestions from '../components/onboarding/GoalQuestions'
import QuestionBlock from '../components/onboarding/QuestionBlock'
import BracketPanel from '../components/onboarding/BracketPanel'
import { FUNDS_ENABLED } from '../utils/fundsFlags'
import { describeGoals } from '../utils/goals'
import { useAuthStore } from '../store/authStore'
import { sectorColour } from '../utils/sectorColours'
import { describeAssessmentGaps } from '../utils/assessmentGaps'

// ─── Display maps ──────────────────────────────────────────────────────────

// Lucide icons per investor path id
const PATH_ICONS: Record<string, React.ElementType> = {
  steady_builder: Layers,
  growth_seeker:  ArrowUpRight,
  trend_rider:    Activity,
  value_hunter:   Search,
}


// The asset cards' sector label sits in a narrow card, so long names shorten
const SECTOR_SHORT: Record<string, string> = {
  'AI & Robotics':          'AI',
  'Media & Communications': 'Media',
}

const STEP_TITLES = ['Your path', 'What you know', 'Assessment', 'Profile']
const STEP_SUBS = ['Investing style', 'Companies you follow', 'Risk and literacy', 'Your mandate']
const STEP_HEADS = [
  'How do you like to invest?',
  'What do you already follow?',
  'Your risk profile',
  'Your profile is ready',
]
const STEP_LEADS = [
  'Pick the style that sounds most like you, adjustable any time.',
  "Select companies you recognise. We'll suggest sectors and can start your watchlist.",
  'These questions set the foundation for how the Swarm sizes and filters for you.',
  'The ranked assets you see will be filtered through this mandate.',
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
    universeTouched,
    prevStep,
    handleSurveyAnswer,
    goalAnswers,
    handleGoalAnswer,
    goals,
    goalsAnswered,
  } = useOnboarding()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  // The banner sits above the form, which on step 3 is far off screen from
  // the button that raised it. Bring it into view so a click never looks inert.
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  const answeredCount = Object.keys(formData.surveyAnswers).length
  const totalQuestions = SURVEY_QUESTIONS.length
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100)
  const assessmentGaps = describeAssessmentGaps({
    goalsMissing: GOAL_QUESTIONS.length - goalsAnswered,
    riskMissing: totalQuestions - answeredCount,
    sectorMissing: formData.universe.length === 0,
  })

  const firstName = user?.user_metadata?.first_name || 'Authorised'
  const lastName = user?.user_metadata?.last_name || 'Investor'
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  const sectors = formData.universe.length ? formData.universe : ['Technology']
  const pathLabel = INVESTOR_PATHS.find((p) => p.id === investorPath)?.label ?? 'Steady Builder'

  return (
    <div className="grid min-h-screen grid-cols-1 bg-brand-bg text-forest-900 selection:bg-lime-500 selection:text-forest-900 lg:grid-cols-[320px_1fr]">
      {/* ═══ Left rail ═══
          The hub header's forest surface, with the steps on it. A row of
          numbered steps on phones. */}
      <div className="p-4 lg:sticky lg:top-0 lg:h-screen">
        <div className="hero-card flex h-full flex-col p-5 sm:p-7">
          <span className="flex items-center gap-2 text-xl font-extrabold tracking-[-0.04em] text-white">
            <Terminal size={20} className="text-lime-500" strokeWidth={2} aria-hidden="true" />
            AlphaSwarm
          </span>

          <ol className="mt-8 hidden flex-col lg:flex" aria-label="Setup steps">
            {STEP_TITLES.map((title, i) => {
              const n = i + 1
              const done = step > n
              const current = step === n
              return (
                <li key={title} className="flex gap-3.5" aria-current={current ? 'step' : undefined}>
                  <div className="flex flex-col items-center">
                    <StepDot n={n} done={done} current={current} />
                    {i < STEP_TITLES.length - 1 && (
                      <div className={`mt-1 min-h-5 w-px flex-1 ${done ? 'bg-lime-500/60' : 'bg-white/15'}`} />
                    )}
                  </div>
                  <div className="pb-4 pt-1">
                    <p className={`text-sm font-bold ${current || done ? 'text-white' : 'text-white/60'}`}>{title}</p>
                    <p className={`mt-0.5 text-xs ${current ? 'text-lime-500' : 'text-white/50'}`}>{STEP_SUBS[i]}</p>
                  </div>
                </li>
              )
            })}
          </ol>
          <ol className="mt-5 flex items-center gap-2 lg:hidden" aria-label="Setup steps">
            {STEP_TITLES.map((title, i) => {
              const n = i + 1
              return (
                <li key={title} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={step === n ? 'step' : undefined}>
                  <StepDot n={n} done={step > n} current={step === n} />
                  <span className="sr-only">{title}</span>
                  {i < STEP_TITLES.length - 1 && <div className={`h-px flex-1 ${step > n ? 'bg-lime-500/60' : 'bg-white/15'}`} />}
                </li>
              )
            })}
          </ol>

          <p className="mt-auto hidden pt-6 text-xs leading-relaxed text-white/70 lg:block">
            A few minutes of setup. Every signal you'll see is shaped to this profile.
          </p>
        </div>
      </div>

      {/* ═══ Content column ═══ */}
      <div className="flex justify-center px-4 pb-24 pt-4 sm:px-12 lg:pt-14">
        <form onSubmit={handleSubmit} className="flex w-full max-w-[720px] flex-col gap-6">
          <div>
            <p className="text-xs font-medium text-brand-muted-fg">
              Step {step} of 4 · {STEP_TITLES[step - 1]}
            </p>
            <h1 className="mt-1.5 text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-forest-900">
              {STEP_HEADS[step - 1]}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-brand-muted-fg">{STEP_LEADS[step - 1]}</p>
          </div>

          {error && (
            <div ref={errorRef} role="alert" className="rounded-[12px] bg-down-bg px-4 py-3 text-sm text-down">
              {error}
            </div>
          )}

          {/* ── STEP 1: investor path ── */}
          {step === 1 && (
            <div key="step1" className="animate-fade-up grid grid-cols-1 gap-3 sm:grid-cols-2">
              {INVESTOR_PATHS.map((path) => {
                const selected = investorPath === path.id
                const PathIcon = PATH_ICONS[path.id] ?? Layers
                return (
                  <button
                    key={path.id}
                    type="button"
                    onClick={() => setInvestorPath(path.id)}
                    aria-pressed={selected}
                    className={`${TILE} ${selected ? TILE_ON : TILE_OFF} flex gap-3 p-[18px]`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-colors ${
                        selected ? 'bg-forest-700 text-lime-500' : 'bg-forest-50 text-forest-700'
                      }`}
                      aria-hidden="true"
                    >
                      <PathIcon size={16} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 pr-5">
                      <span className="block text-base font-bold text-forest-900">{path.label}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-forest-700">{path.tagline}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-brand-muted-fg">{path.desc}</span>
                    </span>
                    {selected && <TileCheck />}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── STEP 2: familiar assets ── */}
          {step === 2 && (
            <div key="step2" className="animate-fade-up flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-brand-muted-fg">
                  {familiarAssets.length === 0 ? 'Select any you recognise, or skip.' : `${familiarAssets.length} selected`}
                </p>
                {familiarAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => familiarAssets.forEach((t) => toggleFamiliarAsset(t))}
                    className="text-sm font-bold text-forest-700 hover:underline"
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
                      className={`${TILE} ${selected ? TILE_ON : TILE_OFF} min-w-0 overflow-hidden p-3`}
                    >
                      <span className="flex items-center gap-1.5 pr-5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${sectorColour(asset.sector).fill}`} aria-hidden="true" />
                        <span className="truncate text-xs text-brand-muted-fg">{SECTOR_SHORT[asset.sector] ?? asset.sector}</span>
                      </span>
                      <span className="mt-1.5 block text-base font-bold tracking-[-0.01em] text-forest-900">{asset.ticker}</span>
                      <span className="block truncate text-xs text-brand-muted-fg">{asset.name}</span>
                      {selected && <TileCheck />}
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
                      <div className="as-inset flex flex-wrap items-center gap-2 px-4 py-3">
                        <span className="text-sm font-bold text-forest-900">Suggested sectors</span>
                        {top.map((sector) => (
                          <span key={sector} className="chip chip-line">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${sectorColour(sector).fill}`} aria-hidden="true" />
                            {sector}
                          </span>
                        ))}
                      </div>
                    )
                  })()}
                  <button
                    type="button"
                    onClick={() => setAddPicksToWatchlist(!addPicksToWatchlist)}
                    aria-pressed={addPicksToWatchlist}
                    className="flex w-fit items-center gap-2.5 text-left text-sm text-forest-900"
                  >
                    <span
                      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors ${
                        addPicksToWatchlist ? 'border-forest-700 bg-forest-700 text-lime-500' : 'border-forest-900/25 bg-white'
                      }`}
                      aria-hidden="true"
                    >
                      {addPicksToWatchlist && <Check size={12} strokeWidth={3} />}
                    </span>
                    Also add {familiarAssets.length === 1 ? 'this' : 'these'} to my watchlist
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── STEP 3: assessment ── */}
          {step === 3 && (
            <div key="step3" className="animate-fade-up flex flex-col gap-4">
              {/* Only the pill sticks, a little below the top edge. Solid white with
                  a hairline and a soft shadow, so it stays legible over the white
                  question cards scrolling under it. */}
              <div className="sticky top-3 z-5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[16px] border border-forest-900/10 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(17,35,32,0.10)] sm:rounded-full sm:px-5">
                  <span className="text-sm">
                    <b className="text-forest-900">Assessment progress</b>
                    <span className="text-brand-muted-fg"> · {answeredCount} of {totalQuestions} answered</span>
                  </span>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-forest-900/10 sm:w-40"
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Assessment progress"
                  >
                    <div
                      className="h-full rounded-full bg-forest-700 transition-[width] duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Goals: asked before the risk questions because they are the
                  easier ones and they frame what follows. Stored separately
                  from the survey answers so they cannot reach the risk score. */}
              <SectionHead title="Your goals" count={`${goalsAnswered} of ${GOAL_QUESTIONS.length}`}>
                These four answers decide which fund categories we can show you, using the
                risk profiles and minimum terms fund managers publish themselves.
              </SectionHead>

              {/* Shared with Settings, where the same answers are revised. */}
              <GoalQuestions answers={goalAnswers} onAnswer={handleGoalAnswer} />

              <SectionHead title="Risk and literacy" count={`${answeredCount} of ${totalQuestions}`} />

              {SURVEY_QUESTIONS.map((q) => (
                <QuestionBlock
                  key={q.id}
                  question={q}
                  value={formData.surveyAnswers[q.id]}
                  onAnswer={handleSurveyAnswer}
                />
              ))}

              <div className="as-card p-5 sm:p-6">
                <p className="text-base font-bold tracking-[-0.01em] text-forest-900">Target sectors</p>
                <p className="mt-1 text-sm text-brand-muted-fg">
                  {formData.universe.length > 0 && !universeTouched
                    ? 'Pre-filled from your picks, adjust as needed.'
                    : 'Select sectors where you want the Swarm to look.'}
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {UNIVERSE_OPTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleUniverse(item)}
                      aria-pressed={formData.universe.includes(item)}
                      className="as-fchip"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${sectorColour(item).fill}`} aria-hidden="true" />
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: profile ── */}
          {step === 4 && (
            <div key="step4" className="animate-fade-up flex flex-col gap-4">
              <div className="as-card flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-700 text-sm font-bold text-white" aria-hidden="true">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-forest-900">
                        {firstName} {lastName}
                      </p>
                      <p className="text-xs text-brand-muted-fg">Investor profile</p>
                    </div>
                  </div>
                  <span className="chip chip-up shrink-0">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Ready
                  </span>
                </div>
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    ['Risk profile', psychometrics.riskTolerance],
                    ['Experience', capitalise(psychometrics.calculatedExpertise)],
                    ['Path', pathLabel],
                  ].map(([label, value]) => (
                    <div key={label} className="as-inset flex flex-col gap-1 p-3 sm:p-4">
                      <dt className="text-xs text-brand-muted-fg">{label}</dt>
                      <dd className="text-xl font-bold tracking-[-0.01em] text-forest-900">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <p className="text-xs text-brand-muted-fg">Sectors your analysis will look at</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sectors.map((sector) => (
                      <span key={sector} className="chip chip-line">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${sectorColour(sector).fill}`} aria-hidden="true" />
                        {sector}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* What the classification means, in the Sparkles box every
                  explanation on the platform uses. */}
              <div className="as-inset p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900">
                  <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  What this means
                </p>
                <p className="text-sm leading-relaxed text-forest-900">
                  You're classified as <span className="font-bold">{psychometrics.riskTolerance}</span>, worked out
                  from your answers. What the Swarm shows you is filtered through it. You can revisit your answers any
                  time in Settings.
                </p>
              </div>

              {/* The goal answers read back, so the profile shown is the whole
                  profile and not only the part the risk questions produced. */}
              {describeGoals(goals) && (
                <div className="as-card p-5 sm:p-6">
                  <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">Your goals</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-forest-900">{capitalise(describeGoals(goals) ?? '')}</p>
                  <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg">
                    We use these to narrow fund categories to the ones whose published risk
                    profile and minimum term fit what you told us.
                  </p>
                </div>
              )}

              {/* Which categories those answers actually open, computed by the
                  same matcher the Funds page uses. Absent if the flag is off or
                  the request fails — it is an extra at the end of a form that
                  has already done its job. */}
              {FUNDS_ENABLED && (
                <BracketPanel
                  riskTolerance={psychometrics.riskTolerance}
                  goals={Object.keys(goalAnswers).length ? goalAnswers : null}
                />
              )}
            </div>
          )}

          {/* ── Navigation ── */}
          {step === 3 && assessmentGaps && (
            <p className="-mb-2 text-center text-sm text-brand-muted-fg" aria-live="polite">
              {assessmentGaps}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-forest-900/8 pt-5">
            {step > 1 ? (
              <button type="button" onClick={prevStep} disabled={loading} className="as-btn as-btn-secondary h-11">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
            ) : (
              <span />
            )}

            <div className="ml-auto flex items-center gap-2">
              {step === 2 && familiarAssets.length === 0 && (
                <button type="submit" className="as-btn as-btn-text h-11 px-3">
                  Skip
                </button>
              )}
              <button
                type="submit"
                disabled={loading || (step === 3 && Boolean(assessmentGaps))}
                className="as-btn as-btn-primary h-11 px-6"
              >
                {loading
                  ? 'Setting up AlphaSwarm…'
                  : step === 1
                    ? 'Continue'
                    : step === 2
                      ? familiarAssets.length > 0
                        ? `Continue with ${familiarAssets.length} ${familiarAssets.length === 1 ? 'pick' : 'picks'}`
                        : 'Continue'
                      : step === 3
                        ? 'Generate my profile'
                        : 'Enter your dashboard'}
                {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// The platform's selectable tile (the artifacts' .tile): a fine outline, and when
// chosen a forest outline on light green with a tick in the corner.
const TILE = 'relative rounded-[14px] border text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700'
const TILE_ON = 'border-forest-700 bg-forest-50'
const TILE_OFF = 'border-forest-900/12 bg-white hover:border-forest-900/30'

function TileCheck() {
  return (
    <span className="absolute right-2.5 top-2.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-forest-700 text-lime-500" aria-hidden="true">
      <Check size={11} strokeWidth={3} />
    </span>
  )
}

function StepDot({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  return (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors duration-300 ${
        done
          ? 'border-lime-500 bg-lime-500 text-forest-800'
          : current
            ? 'border-lime-500 text-lime-500'
            : 'border-white/25 text-white/70'
      }`}
      aria-hidden="true"
    >
      {done ? <Check size={13} strokeWidth={3} /> : n}
    </span>
  )
}

function SectionHead({ title, count, children }: { title: string; count: string; children?: React.ReactNode }) {
  return (
    <div className="pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-0.01em] text-forest-900">{title}</h2>
        <span className="chip tabular-nums">{count}</span>
      </div>
      {children && <p className="mt-1 text-sm leading-relaxed text-brand-muted-fg">{children}</p>}
    </div>
  )
}
