import { useEffect, useRef } from 'react'
import { Mail, ShieldAlert, X, Check, ArrowRight } from 'lucide-react'
import { useForgotPassword } from '../hooks/useForgotPassword'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-brand-bg border border-brand-border/60 rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-brand-muted-fg/60 hover:text-brand-fg transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {sent ? (
          <div className="text-center py-2">
            <div className="mx-auto w-14 h-14 bg-semantic-success/20 rounded-full flex items-center justify-center mb-5 border border-semantic-success/30">
              <Check className="w-7 h-7 text-semantic-success" />
            </div>
            <h2 className="text-xl font-bold text-brand-fg mb-2">Check your inbox</h2>
            <p className="text-brand-muted-fg text-sm leading-relaxed">
              We sent a password reset link to <span className="text-brand-fg font-semibold">{email}</span>.
              The link expires in 1 hour.
            </p>
            <button
              onClick={handleClose}
              className="mt-6 w-full py-3 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 font-bold tracking-wide transition-all text-sm"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-brand-fg mb-1">Reset your password</h2>
              <p className="text-brand-muted-fg text-sm">
                Enter your account email and we'll send you a reset link.
              </p>
            </div>

            {error && (
              <div className="text-semantic-danger text-sm font-medium bg-semantic-danger/10 border border-semantic-danger/30 p-3 rounded-xl flex items-start gap-3 mb-5 animate-in fade-in duration-300">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <form onSubmit={handleSendReset} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                  <input
                    ref={inputRef}
                    type="email"
                    placeholder="investor@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-brand-bg/50 border border-brand-border/60 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 text-brand-fg placeholder:text-brand-muted-fg/40 pl-11 pr-4 py-3.5 w-full rounded-xl outline-none transition-all shadow-sm"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-accent/95 hover:bg-accent/70 hover:shadow-glow-accent text-brand-fg py-3.5 rounded-xl font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(var(--brand-primary),0.3)] disabled:opacity-70 disabled:shadow-none"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </span>
                ) : (
                  <>Send Reset Link <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
