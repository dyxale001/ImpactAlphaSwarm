import { useEffect, useRef } from 'react'
import { X, Check, ArrowRight } from 'lucide-react'
import { useForgotPassword } from '../hooks/useForgotPassword'
import { AuthError, AuthSpinner, authInputClass, AUTH_LABEL, AUTH_SUBMIT } from './AuthLayout'

interface ForgotPasswordModalProps {
  onClose: () => void
}

export default function ForgotPasswordModal({ onClose }: ForgotPasswordModalProps) {
  const { email, setEmail, loading, error, sent, handleSendReset, reset } = useForgotPassword()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-forest-950/40 p-4 backdrop-blur-[2px]"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-title"
        className="animate-fade-up relative my-auto w-full max-w-[420px] rounded-[20px] bg-white p-6 shadow-float sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 flex rounded-full p-1.5 text-brand-muted-fg transition-colors hover:bg-forest-50 hover:text-forest-900"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {sent ? (
          <div className="py-2 text-center">
            <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-up-bg text-up">
              <Check className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 id="forgot-title" className="mb-2 text-xl font-bold tracking-[-0.01em] text-forest-900">Check your inbox</h2>
            <p className="text-sm leading-relaxed text-brand-muted-fg">
              We sent a password reset link to <span className="font-semibold text-forest-900">{email}</span>.
              The link expires in 1 hour.
            </p>
            <button
              onClick={handleClose}
              className="as-btn as-btn-secondary mt-6 w-full"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <h2 id="forgot-title" className="mb-1.5 text-xl font-bold tracking-[-0.01em] text-forest-900">Reset your password</h2>
            <p className="mb-5 text-sm leading-relaxed text-brand-muted-fg">
              Enter your account email and we'll send you a reset link.
            </p>

            {error && (
              <div className="mb-5">
                <AuthError>{error}</AuthError>
              </div>
            )}

            <form onSubmit={handleSendReset} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="forgot-email" className={AUTH_LABEL}>Email address</label>
                <input
                  id="forgot-email"
                  ref={inputRef}
                  type="email"
                  placeholder="investor@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={authInputClass(!!error)}
                  required
                  disabled={loading}
                />
              </div>

              <button type="submit" disabled={loading} className={AUTH_SUBMIT}>
                {loading ? (
                  <>
                    <AuthSpinner />
                    Sending…
                  </>
                ) : (
                  <>
                    Send reset link <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
