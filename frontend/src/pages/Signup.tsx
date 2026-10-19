import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useSignup } from '../hooks/useSignup'
import AuthLayout, {
  AuthError,
  AuthHeading,
  AuthNotice,
  AuthSpinner,
  PasswordChecklist,
  PasswordField,
  authInputClass,
  passwordCriteria,
  AUTH_LABEL,
  AUTH_SUBMIT,
} from '../components/AuthLayout'

export default function Signup() {
  const { formData, setFormData, error, successMessage, loading, handleSubmit } = useSignup()

  const allMet = passwordCriteria(formData.password).every((c) => c.met)
  const mismatch = !!formData.confirmPassword && formData.password !== formData.confirmPassword

  return (
    <AuthLayout view="signup">
      {successMessage ? (
        <AuthNotice
          tone="up"
          title="Check your email"
          action={
            <Link to="/login" className="as-btn as-btn-primary">
              Back to sign in
            </Link>
          }
        >
          {successMessage}
        </AuthNotice>
      ) : (
        <form onSubmit={handleSubmit} className="animate-fade-up flex flex-col gap-5">
          <AuthHeading eyebrow="Join the Swarm" title="Open your account" lead="Set up in minutes. Your first explained pick today." />

          {error && <AuthError>{error}</AuthError>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-first" className={AUTH_LABEL}>
                First name
              </label>
              <input
                id="signup-first"
                type="text"
                placeholder="Thabo"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className={authInputClass(!!error)}
                autoComplete="given-name"
                required
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-last" className={AUTH_LABEL}>
                Last name
              </label>
              <input
                id="signup-last"
                type="text"
                placeholder="Ndawula"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className={authInputClass(!!error)}
                autoComplete="family-name"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-email" className={AUTH_LABEL}>
              Email address
            </label>
            <input
              id="signup-email"
              type="email"
              placeholder="investor@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={authInputClass(!!error)}
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          <PasswordField
            id="signup-password"
            label="Password"
            value={formData.password}
            onChange={(password) => setFormData({ ...formData, password })}
            hasError={!!error}
            disabled={loading}
            autoComplete="new-password"
          />

          <PasswordField
            id="signup-confirm"
            label="Confirm password"
            value={formData.confirmPassword || ''}
            onChange={(confirmPassword) => setFormData({ ...formData, confirmPassword })}
            hasError={!!error || mismatch}
            disabled={loading}
            autoComplete="new-password"
            extra={mismatch && <p className="text-xs text-down">Passwords do not match.</p>}
          />

          <PasswordChecklist password={formData.password} />

          <button type="submit" disabled={loading || !allMet} className={AUTH_SUBMIT}>
            {loading ? (
              <>
                <AuthSpinner />
                Creating your account…
              </>
            ) : (
              <>
                Create your account <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-brand-muted-fg">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-forest-700 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
