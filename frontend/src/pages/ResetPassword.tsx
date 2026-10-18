import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useResetPassword } from '../hooks/useResetPassword'
import AuthLayout, {
  AuthError,
  AuthHeading,
  AuthNotice,
  AuthSpinner,
  PasswordChecklist,
  PasswordField,
  passwordCriteria,
  AUTH_SUBMIT,
} from '../components/AuthLayout'

// The reset link lands here. It used to be a page of its own, older design;
// it now sits in the sign-in layout so the whole way in looks the same.
export default function ResetPassword() {
  const {
    password, setPassword,
    confirmPassword, setConfirmPassword,
    loading, error, success, isRecoverySession, leaving,
    handleReset, cancelReset,
  } = useResetPassword()

  const allMet = passwordCriteria(password).every((c) => c.met)
  const mismatch = !!confirmPassword && password !== confirmPassword

  // Signing out on the way to the login page briefly clears the recovery flag,
  // so hold the render rather than flashing the expired link screen.
  if (leaving) return null

  return (
    <AuthLayout view="reset">
      {success ? (
        <AuthNotice
          tone="up"
          title="Password updated"
          action={
            <Link to="/login" className="as-btn as-btn-primary">
              Go to sign in
            </Link>
          }
        >
          Your password has been changed. Taking you to sign in…
        </AuthNotice>
      ) : !isRecoverySession ? (
        <AuthNotice
          tone="down"
          title="This link has expired"
          action={
            <button type="button" onClick={cancelReset} className="as-btn as-btn-primary">
              Back to sign in
            </button>
          }
        >
          This password reset link is invalid or has expired. Request a new one from the sign-in page.
        </AuthNotice>
      ) : (
        <form onSubmit={handleReset} className="animate-fade-up flex flex-col gap-5">
          <button
            type="button"
            onClick={cancelReset}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-muted-fg transition-colors hover:text-forest-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to sign in
          </button>

          <AuthHeading eyebrow="Reset password" title="Set a new password" lead="Choose a strong password for your account." />

          {error && <AuthError>{error}</AuthError>}

          <PasswordField
            id="reset-password"
            label="New password"
            value={password}
            onChange={setPassword}
            hasError={!!error}
            disabled={loading}
            autoComplete="new-password"
          />

          <PasswordField
            id="reset-confirm"
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            hasError={!!error || mismatch}
            disabled={loading}
            autoComplete="new-password"
            extra={mismatch && <p className="text-xs text-down">Passwords do not match.</p>}
          />

          <PasswordChecklist password={password} />

          <button type="submit" disabled={loading || !allMet} className={AUTH_SUBMIT}>
            {loading ? (
              <>
                <AuthSpinner />
                Updating your password…
              </>
            ) : (
              <>
                Update password <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
