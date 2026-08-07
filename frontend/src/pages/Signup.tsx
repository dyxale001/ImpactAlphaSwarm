import { Link } from 'react-router-dom'
import { Check, ArrowRight, ShieldAlert, Eye, EyeOff } from 'lucide-react'
import { useSignup } from '../hooks/useSignup'
import { useState } from 'react'
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

export default function Signup() {
  const { formData, setFormData, error, successMessage, loading, handleSubmit } = useSignup()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const passwordCriteria = [
    { label: 'At least 8 characters', met: formData.password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(formData.password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(formData.password) },
    { label: 'Number', met: /[0-9]/.test(formData.password) },
    { label: 'Special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password) },
  ]

  const mismatch = !!formData.confirmPassword && formData.password !== formData.confirmPassword

  return (
    <AuthLayout view="signup">
      {successMessage ? (
        <div className="animate-fade-up rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-lime-500 bg-lime-500/15">
            <Check className="h-8 w-8 text-forest-700" />
          </div>
          <h2 className="mb-3 text-2xl font-medium tracking-tight text-forest-700">Verification Required</h2>
          <p className="mb-6 leading-relaxed text-muted">{successMessage}</p>
          <Link
            to="/login"
            className="mx-auto inline-flex items-center justify-center gap-2 rounded-full bg-forest-700 px-7 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-85"
          >
            Return to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="animate-fade-up flex flex-col gap-5">
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-eyebrow text-forest-700">Join The Swarm</p>
            <h1 className="mb-2.5 text-[30px] sm:text-[34px] lg:text-[40px] font-medium leading-[1.1] tracking-tight text-forest-700">
              Open Your Account
            </h1>
            <p className="text-[15px] leading-relaxed text-muted">Set up in minutes. Your first explained pick today.</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm font-medium text-danger">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className={AUTH_LABEL}>First Name</label>
              <input
                type="text"
                placeholder="Thabo"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className={authInputClass(!!error)}
                required
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className={AUTH_LABEL}>Last Name</label>
              <input
                type="text"
                placeholder="Ndawula"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className={authInputClass(!!error)}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL}>Email Address</label>
            <input
              type="email"
              placeholder="investor@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={authInputClass(!!error)}
              required
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL}>Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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

          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL}>Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.confirmPassword || ''}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={`${authInputClass(!!error)} pr-12`}
                required
                disabled={loading}
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                onMouseDown={() => setShowConfirmPassword(true)}
                onMouseUp={() => setShowConfirmPassword(false)}
                onMouseLeave={() => setShowConfirmPassword(false)}
                onBlur={() => setShowConfirmPassword(false)}
                className="absolute right-4 top-1/2 flex -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-forest-700"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {mismatch && <p className="ml-1 text-[13px] text-danger">Passwords do not match.</p>}
          </div>

          {/* Live criteria checklist: dots turn lime when met */}
          <div className="grid grid-cols-1 gap-2 rounded-lg bg-white px-4 py-3.5 shadow-sm sm:grid-cols-2">
            {passwordCriteria.map((criterion) => (
              <div key={criterion.label} className="flex items-center gap-2">
                <span
                  className={`h-3.5 w-3.5 shrink-0 rounded-full border transition-colors ${
                    criterion.met ? 'border-lime-500 bg-lime-500' : 'border-forest-900/20 bg-transparent'
                  }`}
                />
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                    criterion.met ? 'text-forest-900' : 'text-muted-foreground'
                  }`}
                >
                  {criterion.label}
                </span>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || !passwordCriteria.every((c) => c.met)}
            className={`${AUTH_SUBMIT} disabled:opacity-50`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Creating account...
              </span>
            ) : (
              <>
                Create Your Account <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-sm font-bold text-forest-700 hover:underline">
              Sign In
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
