import { useEffect, useRef } from 'react'
import { ShieldAlert, X, Check, ArrowRight } from 'lucide-react'
import { useForgotPassword } from '../hooks/useForgotPassword'
import { authInputClass, AUTH_LABEL, AUTH_SUBMIT } from './AuthLayout'

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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-forest-900/50 p-4"
      onClick={handleClose}
    >
      <div
        className="animate-fade-up relative my-auto w-full max-w-[420px] rounded-2xl bg-white p-6 sm:p-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 flex p-1.5 text-muted-foreground transition-colors hover:text-forest-900"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {sent ? (
          <div className="py-2 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-lime-500 bg-lime-500/15">
              <Check className="h-7 w-7 text-forest-700" />
            </div>
            <h2 className="mb-2 text-[22px] font-semibold text-forest-900">Check your inbox</h2>
            <p className="text-sm leading-relaxed text-muted">
              We sent a password reset link to <span className="font-semibold text-forest-900">{email}</span>.
              The link expires in 1 hour.
            </p>
            <button
              onClick={handleClose}
              className="mt-6 w-full rounded-full border border-forest-900/14 py-3 text-sm font-semibold text-forest-700 transition-colors hover:border-forest-900/28"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <>
            <h2 className="mb-1.5 text-[22px] font-semibold text-forest-900">Reset Your Password</h2>
            <p className="mb-6 text-sm leading-relaxed text-muted">
              Enter your account email and we'll send you a reset link.
            </p>

            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-medium text-danger">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <form onSubmit={handleSendReset} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className={AUTH_LABEL}>Email Address</label>
                <input
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

              <button type="submit" disabled={loading} className={`${AUTH_SUBMIT} disabled:opacity-70`}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Sending...
                  </span>
                ) : (
                  <>
                    Send Reset Link <ArrowRight className="h-4 w-4" />
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
