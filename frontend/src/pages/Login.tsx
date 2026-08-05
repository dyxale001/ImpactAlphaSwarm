import { Link } from 'react-router-dom'
import { useLogin } from '../hooks/useLogin'
import { ArrowRight, ShieldAlert, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import ForgotPasswordModal from '../components/ForgotPasswordModal'
import AuthLayout, { authInputClass, AUTH_LABEL, AUTH_SUBMIT } from '../components/AuthLayout'

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  )
}

export default function Login() {
  const {
    email, setEmail,
    password, setPassword,
    error, loading, handleLogin,
    needsReactivation, handleReactivate, cancelReactivation,
  } = useLogin()

  const [showPassword, setShowPassword] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  return (
    <AuthLayout view="login">
      {showForgotPassword && <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />}

      {needsReactivation ? (
        /* ── Reactivation prompt ─────────────────────────────────── */
        <div className="animate-fade-up flex flex-col gap-6 rounded-2xl bg-white p-7 shadow-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-forest-700/30 bg-forest-700/10">
            <RotateCcw className="h-6 w-6 text-forest-700" />
          </div>

          <div className="text-center">
            <h1 className="mb-2 text-2xl font-medium tracking-tight text-forest-700">Welcome back</h1>
            <p className="text-sm leading-relaxed text-muted">
              This account is currently deactivated. Reactivate it to continue where you left off.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm font-medium text-danger">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button type="button" onClick={handleReactivate} disabled={loading} className={`${AUTH_SUBMIT} disabled:opacity-70`}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Reactivating...
                </span>
              ) : (
                <>
                  Reactivate my account <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={cancelReactivation}
              disabled={loading}
              className="w-full rounded-full border border-forest-900/14 py-3 text-sm font-semibold text-muted transition-colors hover:border-forest-900/28 hover:text-forest-900 disabled:opacity-50"
            >
              Cancel and sign out
            </button>
          </div>
        </div>
      ) : (
        /* ── Login form ──────────────────────────────────────────── */
        <form onSubmit={handleLogin} className="animate-fade-up flex flex-col gap-6">
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-eyebrow text-forest-700">Welcome Back</p>
            <h1 className="mb-2.5 text-[40px] font-medium leading-[1.1] tracking-tight text-forest-700">
              Sign In to Your Swarm
            </h1>
            <p className="text-[15px] leading-relaxed text-muted">Your ranked, explained picks are waiting.</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm font-medium text-danger">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL}>Email Address</label>
            <input
              type="email"
              placeholder="investor@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authInputClass(!!error)}
              required
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="mx-1 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-eyebrow text-forest-700">Password</label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs font-semibold text-forest-700 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${authInputClass(!!error)} pr-12`}
                required
                disabled={loading}
              />
              <button
                type="button"
                aria-label="Show password while holding"
                onMouseDown={() => setShowPassword(true)}
                onMouseUp={() => setShowPassword(false)}
                onMouseLeave={() => setShowPassword(false)}
                onBlur={() => setShowPassword(false)}
                className="absolute right-4 top-1/2 flex -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-forest-700"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className={`${AUTH_SUBMIT} mt-1 disabled:opacity-70`}>
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Authenticating...
              </span>
            ) : (
              <>
                Sign In Securely <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <div className="h-px bg-forest-900/8"></div>
          <p className="text-center text-sm text-muted">
            Don't have an account?{' '}
            <Link to="/signup" className="text-sm font-bold text-forest-700 hover:underline">
              Open an account
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
