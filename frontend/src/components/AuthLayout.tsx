import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye, EyeOff, ShieldAlert, Terminal } from 'lucide-react'

// The way in: sign in, open an account and reset a password share this one
// split layout, the platform's fields and buttons, and the lime brand panel.

/** The way in keeps its own pill fields, focusing with the lime halo. Error
 *  keeps the down tone. */
export function authInputClass(hasError: boolean) {
  return `h-12 w-full min-w-0 rounded-full border bg-white px-[22px] text-sm text-forest-900 outline-none transition-[box-shadow,border-color] duration-200 placeholder:text-brand-muted-fg disabled:opacity-60 ${
    hasError
      ? 'border-down focus:border-down focus:ring-4 focus:ring-down/25'
      : 'border-forest-900/14 focus:border-lime-500 focus:ring-4 focus:ring-lime-500/45'
  }`
}

export const AUTH_LABEL = 'text-sm font-semibold text-forest-900'

export const AUTH_SUBMIT = 'as-btn as-btn-primary h-12 w-full'

export function AuthSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

/** The form's heading: a quiet label, the 32px title and one line under it. */
export function AuthHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-brand-muted-fg">{eyebrow}</p>
      <h1 className="mt-1.5 text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-forest-900">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-brand-muted-fg">{lead}</p>
    </div>
  )
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-[12px] bg-down-bg px-4 py-3 text-sm text-down">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="leading-relaxed">{children}</span>
    </div>
  )
}

/** A password box whose eye shows the password only while it is held down. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  hasError,
  disabled,
  autoComplete,
  extra,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  hasError: boolean
  disabled: boolean
  autoComplete: string
  /** Anything under the box, such as the forgot-password link or a mismatch note. */
  extra?: ReactNode
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={AUTH_LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${authInputClass(hasError)} pr-12`}
          autoComplete={autoComplete}
          required
          disabled={disabled}
        />
        <button
          type="button"
          aria-label={`Show ${label.toLowerCase()} while holding`}
          onMouseDown={() => setShow(true)}
          onMouseUp={() => setShow(false)}
          onMouseLeave={() => setShow(false)}
          onBlur={() => setShow(false)}
          className="absolute right-3 top-1/2 flex -translate-y-1/2 rounded-full p-1.5 text-brand-muted-fg transition-colors hover:text-forest-700"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {extra}
    </div>
  )
}

/** The five rules a new password must meet, shared by sign-up and reset. */
export function passwordCriteria(password: string) {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
    { label: 'Special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ]
}

/** The live checklist: each rule turns green with a tick once it is met. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-[12px] border border-forest-900/10 bg-white px-3.5 py-3 sm:grid-cols-2">
      {passwordCriteria(password).map((c) => (
        <li key={c.label} className={`flex items-center gap-2 text-xs transition-colors ${c.met ? 'text-up' : 'text-brand-muted-fg'}`}>
          <span
            className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors ${
              c.met ? 'border-up bg-up text-white' : 'border-forest-900/20'
            }`}
            aria-hidden="true"
          >
            {c.met && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
          </span>
          {c.label}
          <span className="sr-only">{c.met ? ' (met)' : ' (not yet)'}</span>
        </li>
      ))}
    </ul>
  )
}

/** A finished or failed step (account created, password updated, link expired). */
export function AuthNotice({
  tone,
  title,
  children,
  action,
}: {
  tone: 'up' | 'down'
  title: string
  children: ReactNode
  action: ReactNode
}) {
  return (
    <div className="as-card animate-fade-up p-6 text-center sm:p-8">
      <span
        className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${
          tone === 'up' ? 'bg-up-bg text-up' : 'bg-down-bg text-down'
        }`}
      >
        {tone === 'up' ? <Check className="h-6 w-6" aria-hidden="true" /> : <ShieldAlert className="h-6 w-6" aria-hidden="true" />}
      </span>
      <h1 className="mt-4 text-xl font-bold tracking-[-0.01em] text-forest-900">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-brand-muted-fg">{children}</p>
      <div className="mt-6 flex justify-center">{action}</div>
    </div>
  )
}

interface AuthLayoutProps {
  /** Which tab is current. A reset has neither selected. */
  view: 'login' | 'signup' | 'reset'
  children: ReactNode
}

export default function AuthLayout({ view, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-brand-bg text-forest-900 selection:bg-lime-500 selection:text-forest-900 lg:grid-cols-2">
      {/* ── Left: form column ── */}
      <div className="flex min-h-screen flex-col px-4 py-6 sm:px-12 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-[-0.04em] text-forest-900">
            <Terminal size={20} className="text-forest-700" strokeWidth={2} aria-hidden="true" />
            AlphaSwarm
          </Link>
          <nav className="as-tabs as-tabs-sm" aria-label="Sign in or open an account">
            <Link to="/login" aria-current={view === 'login' ? 'page' : undefined} className={`as-tab ${view === 'login' ? 'is-on' : ''}`}>
              Sign in
            </Link>
            <Link to="/signup" aria-current={view === 'signup' ? 'page' : undefined} className={`as-tab ${view === 'signup' ? 'is-on' : ''}`}>
              Open account
            </Link>
          </nav>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>

        <p className="text-xs text-brand-muted-fg">Research and education only, not financial advice.</p>
      </div>

      {/* ── Right: sticky lime brand panel ── */}
      <div className="sticky top-0 hidden h-screen p-4 lg:block">
        <div className="relative flex h-full flex-col justify-end gap-6 overflow-hidden rounded-[28px] bg-gradient-to-b from-lime-500 to-lime-200 p-12">
          {/* The ribbon draws itself in across the panel, then its words fade in. */}
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
              className="ribbon-text fill-lime-200 font-semibold uppercase"
              style={{ fontSize: 19, letterSpacing: '0.14em' }}
              dominantBaseline="middle"
            >
              <textPath href="#rb-auth" startOffset="3%">
                Emotionless Research · Explainable Signals · One Committee · Zero Emotions · Emotionless Research
              </textPath>
            </text>
          </svg>

          {/* An example of what the product shows, in the platform's own card. */}
          <div className="animate-fade-up-delayed relative z-2 flex max-w-[360px] flex-col gap-3 rounded-[20px] bg-white p-5 shadow-float" aria-hidden="true">
            <p className="text-xs font-medium text-brand-muted-fg">Today's top pick</p>
            <div className="flex items-center gap-3">
              <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-[11px] bg-forest-700 px-1.5 text-xs font-bold text-white">
                NVDA
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-forest-900">NVDA</p>
                <p className="text-xs text-brand-muted-fg">NVIDIA Corporation</p>
              </div>
              <span className="chip chip-up">Signals agree</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-brand-muted-fg">Sentiment</span>
                <b className="text-sm tabular-nums text-forest-900">72 · Strongly positive</b>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-forest-900/8">
                <div className="h-full w-[72%] rounded-full bg-forest-700" />
              </div>
            </div>
            <p className="text-xs leading-relaxed text-forest-900">
              Positive coverage and top-quartile momentum agree, with no hype gap.
            </p>
          </div>

          <div className="relative z-2">
            <h2 className="max-w-[14ch] text-[40px] font-bold leading-[1.1] tracking-[-0.02em] text-forest-800">
              Let the Swarm Do the Homework
            </h2>
            <p className="mt-3 max-w-[360px] text-sm leading-relaxed text-forest-900">
              Every pick arrives ranked, explained, and shaped to your profile.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
