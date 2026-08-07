import { Link } from 'react-router-dom'
import { Terminal } from 'lucide-react'

// Pill input styling shared by the auth forms; error keeps the danger
// semantics from the previous design, default focuses with the lime halo.
export function authInputClass(hasError: boolean) {
  return `w-full rounded-full border bg-white px-[22px] py-3.5 font-sans text-[15px] text-forest-900 outline-none transition-[box-shadow,border-color] duration-200 placeholder:text-muted-foreground ${
    hasError
      ? 'border-danger focus:border-danger focus:ring-4 focus:ring-danger/25'
      : 'border-forest-900/14 focus:border-lime-500 focus:ring-4 focus:ring-lime-500/45'
  }`
}

export const AUTH_LABEL = 'ml-1 text-xs font-semibold uppercase tracking-eyebrow text-forest-700'

export const AUTH_SUBMIT =
  'flex w-full items-center justify-center gap-2 rounded-full bg-forest-700 p-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-85 active:scale-[0.98] disabled:cursor-not-allowed'

function SwitcherTab({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`whitespace-nowrap rounded-full px-3 py-2 text-xs sm:px-[18px] sm:text-[13px] font-semibold transition-colors ${
        active ? 'bg-forest-700 text-white' : 'text-forest-900'
      }`}
    >
      {children}
    </Link>
  )
}

interface AuthLayoutProps {
  view: 'login' | 'signup'
  children: React.ReactNode
}

export default function AuthLayout({ view, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-neutral-100 font-sans text-forest-900 selection:bg-lime-500 selection:text-forest-900 lg:grid-cols-2">
      {/* ── Left: form column ── */}
      <div className="flex min-h-screen flex-col px-6 py-8 sm:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-[-0.04em] text-forest-900">
            <Terminal size={20} className="text-forest-700" strokeWidth={2} />
            AlphaSwarm
          </Link>
          <div className="inline-flex items-center gap-1 rounded-full border border-forest-900/14 bg-white/60 p-1">
            <SwitcherTab to="/login" active={view === 'login'}>
              Sign In
            </SwitcherTab>
            <SwitcherTab to="/signup" active={view === 'signup'}>
              Open Account
            </SwitcherTab>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px]">
            {children}
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Research and education only, not financial advice.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right: sticky lime brand panel ── */}
      <div className="sticky top-0 hidden h-screen p-6 lg:block">
        <div className="relative flex h-full flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-b from-lime-500 to-lime-200 p-12">
          <svg viewBox="0 0 700 900" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <path
              id="rb-auth"
              pathLength={1}
              d="M-60,120 C160,220 340,60 520,180 C700,300 620,420 540,470 C480,510 560,620 760,640"
              fill="none"
              className="ribbon-draw stroke-forest-700"
              strokeWidth={54}
              strokeLinecap="round"
              strokeDasharray="1"
            />
            <text
              className="ribbon-text fill-lime-200 font-sans font-semibold uppercase"
              style={{ fontSize: 19, letterSpacing: '0.14em' }}
              dominantBaseline="middle"
            >
              <textPath href="#rb-auth" startOffset="3%">
                Emotionless Research · Explainable Signals · One Committee · Zero Emotions · Emotionless Research
              </textPath>
            </text>
          </svg>

          <div className="animate-fade-up-delayed relative z-2 flex max-w-[340px] flex-col gap-3 rounded-2xl bg-white p-[22px] shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Today's Top Pick</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-forest-900/10 bg-neutral-100/70 text-[10px] font-bold">
                  NVD
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-forest-700">NVDA</p>
                  <p className="text-xs text-muted">NVIDIA Corp</p>
                </div>
              </div>
              <span className="inline-flex rounded-sm bg-forest-700/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-forest-700">
                Rank 1
              </span>
            </div>
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-700">Sentiment Score</span>
                <span className="text-xs font-semibold text-forest-900">72%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full w-[72%] bg-forest-700" />
              </div>
            </div>
            <p className="text-xs leading-[1.55] text-muted">
              "Positive coverage tone and top-quartile momentum agree, with no hype gap detected."
            </p>
          </div>

          <div className="relative z-2 mt-5">
            <h2 className="mb-2 max-w-[380px] text-[32px] font-medium leading-[1.15] tracking-tight text-forest-700">
              Let the Swarm Do the Homework
            </h2>
            <p className="max-w-[360px] text-sm leading-relaxed text-forest-900">
              Every pick arrives ranked, explained, and shaped to your profile.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
