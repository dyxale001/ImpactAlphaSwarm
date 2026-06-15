import { Link } from 'react-router-dom'
import { LockKeyhole, ArrowRight, ShieldAlert, Eye, EyeOff, Check, X } from 'lucide-react'
import { useState } from 'react'
import { useResetPassword } from '../hooks/useResetPassword'

export default function ResetPassword() {
  const {
    password, setPassword,
    confirmPassword, setConfirmPassword,
    loading, error, success, isRecoverySession,
    handleReset,
  } = useResetPassword()

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const passwordCriteria = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
    { label: 'Special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ]

  const inputBorderClass = error
    ? 'border-semantic-danger focus:border-semantic-danger focus:ring-1 focus:ring-semantic-danger/50'
    : 'border-brand-border/60 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50'

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-brand-bg auth-bg relative selection:bg-brand-primary selection:text-white">
        <div className="w-full max-w-md mx-6 text-center bg-brand-bg/60 border border-brand-border/60 p-10 rounded-2xl shadow-lg backdrop-blur-md animate-in zoom-in-95 duration-500">
          <div className="mx-auto w-16 h-16 bg-semantic-success/20 rounded-full flex items-center justify-center mb-6 border border-semantic-success/30 shadow-[0_0_15px_rgba(var(--semantic-success),0.2)]">
            <Check className="w-8 h-8 text-semantic-success" />
          </div>
          <h2 className="text-2xl font-bold text-brand-fg mb-3">Password Updated</h2>
          <p className="text-brand-muted-fg leading-relaxed mb-6 font-medium">
            Your password has been changed successfully. Redirecting you to login…
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 py-3 px-6 rounded-xl font-bold tracking-wide transition-all"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  if (!isRecoverySession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-brand-bg auth-bg relative selection:bg-brand-primary selection:text-white">
        <div className="w-full max-w-md mx-6 text-center bg-brand-bg/60 border border-brand-border/60 p-10 rounded-2xl shadow-lg backdrop-blur-md">
          <div className="mx-auto w-16 h-16 bg-semantic-danger/20 rounded-full flex items-center justify-center mb-6 border border-semantic-danger/30">
            <ShieldAlert className="w-8 h-8 text-semantic-danger" />
          </div>
          <h2 className="text-2xl font-bold text-brand-fg mb-3">Invalid or Expired Link</h2>
          <p className="text-brand-muted-fg leading-relaxed mb-6 font-medium">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 py-3 px-6 rounded-xl font-bold tracking-wide transition-all"
          >
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-bg auth-bg relative selection:bg-brand-primary selection:text-white">
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-primary/10 rounded-full blur-[100px] -z-10 lg:hidden pointer-events-none" />

        <div className="w-full max-w-md flex flex-col z-10">
          <div className="mb-4">
            <Link to="/login" className="text-sm text-brand-muted-fg hover:text-brand-primary transition-colors font-medium">
              ← Back to Login
            </Link>
          </div>

          <form onSubmit={handleReset} className="flex flex-col gap-6">
            <div className="mb-2">
              <h1 className="text-3xl font-bold text-brand-fg tracking-tight mb-2">Set New Password</h1>
              <p className="text-brand-muted-fg font-medium">Choose a strong password for your account.</p>
            </div>

            {error && (
              <div className="text-semantic-danger text-sm font-medium bg-semantic-danger/10 border border-semantic-danger/30 p-4 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1">New Password</label>
              <div className="relative group">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`bg-brand-bg/50 border text-brand-fg placeholder:text-brand-muted-fg/40 pl-11 pr-10 py-3.5 w-full rounded-xl outline-none transition-all shadow-sm ${inputBorderClass}`}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg/60 hover:text-brand-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1">Confirm Password</label>
              <div className="relative group">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`bg-brand-bg/50 border text-brand-fg placeholder:text-brand-muted-fg/40 pl-11 pr-10 py-3.5 w-full rounded-xl outline-none transition-all shadow-sm ${inputBorderClass}`}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label="Show confirm password while holding"
                  onMouseDown={() => setShowConfirmPassword(true)}
                  onMouseUp={() => setShowConfirmPassword(false)}
                  onMouseLeave={() => setShowConfirmPassword(false)}
                  onBlur={() => setShowConfirmPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg/60 hover:text-brand-primary transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {confirmPassword && password !== confirmPassword && (
                <p className="text-semantic-danger text-sm mt-1">Passwords do not match.</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 bg-brand-bg/40 rounded-xl border border-brand-border/40">
              {passwordCriteria.map((criterion, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[11px] font-bold tracking-wide uppercase">
                  {criterion.met ? (
                    <Check className="w-3.5 h-3.5 text-semantic-success" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-brand-muted-fg/50" />
                  )}
                  <span className={criterion.met ? 'text-brand-fg' : 'text-brand-muted-fg/60'}>
                    {criterion.label}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !passwordCriteria.every((c) => c.met)}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-accent/95 hover:shadow-glow-accent text-brand-fg hover:bg-accent/70 py-4 rounded-xl font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(var(--brand-primary),0.3)] disabled:opacity-70 disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Updating Password...
                </span>
              ) : (
                <>Update Password <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
