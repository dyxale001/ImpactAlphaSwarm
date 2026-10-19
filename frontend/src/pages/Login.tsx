import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useLogin } from '../hooks/useLogin'
import ForgotPasswordModal from '../components/ForgotPasswordModal'
import AuthLayout, {
  AuthError,
  AuthHeading,
  AuthSpinner,
  PasswordField,
  authInputClass,
  AUTH_LABEL,
  AUTH_SUBMIT,
} from '../components/AuthLayout'

export default function Login() {
  const {
    email, setEmail,
    password, setPassword,
    error, loading, handleLogin,
  } = useLogin()

  const [showForgotPassword, setShowForgotPassword] = useState(false)

  return (
    <AuthLayout view="login">
      {showForgotPassword && <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />}

      <form onSubmit={handleLogin} className="animate-fade-up flex flex-col gap-5">
        <AuthHeading eyebrow="Welcome back" title="Sign in to your Swarm" lead="Your ranked, explained picks are waiting." />

        {error && <AuthError>{error}</AuthError>}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-email" className={AUTH_LABEL}>
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            placeholder="investor@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass(!!error)}
            autoComplete="email"
            required
            disabled={loading}
          />
        </div>

        <PasswordField
          id="login-password"
          label="Password"
          value={password}
          onChange={setPassword}
          hasError={!!error}
          disabled={loading}
          autoComplete="current-password"
          // Under the box rather than beside the label, where it is met at the
          // moment a password will not come to mind.
          extra={
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="self-end text-xs font-bold text-forest-700 hover:underline"
            >
              Forgot password?
            </button>
          }
        />

        <button type="submit" disabled={loading} className={AUTH_SUBMIT}>
          {loading ? (
            <>
              <AuthSpinner />
              Signing in…
            </>
          ) : (
            <>
              Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>

        <p className="border-t border-forest-900/8 pt-5 text-center text-sm text-brand-muted-fg">
          Don't have an account?{' '}
          <Link to="/signup" className="font-bold text-forest-700 hover:underline">
            Open an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
