import { Link } from 'react-router-dom'
import { Check, X, Terminal, LockKeyhole, ArrowRight, ShieldAlert, User, Mail, Eye, EyeOff } from 'lucide-react'
import { useSignup } from '../hooks/useSignup'
import { useState } from 'react'

export default function Signup() {
  const { formData, setFormData, error, successMessage, loading, handleSubmit } = useSignup()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const passwordCriteria = [
    { label: 'At least 8 characters', met: formData.password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(formData.password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(formData.password) },
    { label: 'Number', met: /[0-9]/.test(formData.password) },
    { label: 'Special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password) }
  ]

  const inputBorderClass = error 
    ? "border-semantic-danger focus:border-semantic-danger focus:ring-1 focus:ring-semantic-danger/50" 
    : "border-brand-border/60 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50";

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-bg auth-bg relative selection:bg-brand-primary selection:text-white">

      {/* Right side form panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-y-auto">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-primary/10 rounded-full blur-[100px] -z-10 lg:hidden pointer-events-none"></div>

        <div className="w-full max-w-md flex flex-col z-10 py-10">
          <div className="mb-4">
            <Link to="/" className="text-sm text-brand-muted-fg hover:text-brand-primary transition-colors font-medium">← Go back</Link>
          </div>

          {successMessage ? (
             <div className="text-center bg-brand-bg/60 border border-brand-border/60 p-8 rounded-2xl shadow-lg backdrop-blur-md animate-in zoom-in-95 duration-500">
               <div className="mx-auto w-16 h-16 bg-semantic-success/20 rounded-full flex items-center justify-center mb-6 border border-semantic-success/30 shadow-[0_0_15px_rgba(var(--semantic-success),0.2)]">
                 <Check className="w-8 h-8 text-semantic-success" />
               </div>
               <h2 className="text-2xl font-bold text-brand-fg mb-3">Verification Required</h2>
               <p className="text-brand-muted-fg leading-relaxed mb-6 font-medium">
                 {successMessage}
               </p>
               <Link 
                 to="/login"
                 className="inline-flex mx-auto items-center justify-center gap-2 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 py-3 px-6 rounded-xl font-bold tracking-wide transition-all"
               >
                 Return to Login
               </Link>
             </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="mb-2">
                <h1 className="text-3xl font-bold text-brand-fg tracking-tight mb-2">Create Account</h1>
                <p className="text-brand-muted-fg font-medium">Fill in your details below to get started securely.</p>
              </div>

              {error && (
                <div className="text-semantic-danger text-sm font-medium bg-semantic-danger/10 border border-semantic-danger/30 p-4 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}
              
              {/* FIRST & LAST NAME GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1">First Name</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Thabo" 
                      value={formData.firstName} 
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})} 
                      className={`bg-brand-bg/50 border text-brand-fg placeholder:text-brand-muted-fg/40 pl-11 pr-4 py-3.5 w-full rounded-xl outline-none transition-all shadow-sm ${inputBorderClass}`}
                      required 
                      disabled={loading} 
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1">Last Name</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Ndawula" 
                      value={formData.lastName} 
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})} 
                      className={`bg-brand-bg/50 border text-brand-fg placeholder:text-brand-muted-fg/40 pl-11 pr-4 py-3.5 w-full rounded-xl outline-none transition-all shadow-sm ${inputBorderClass}`}
                      required 
                      disabled={loading} 
                    />
                  </div>
                </div>
              </div>

              {/* EMAIL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                  <input 
                    type="email" 
                    placeholder="investor@example.com" 
                    value={formData.email} 
                    onChange={(e) => setFormData({...formData, email: e.target.value})} 
                    className={`bg-brand-bg/50 border text-brand-fg placeholder:text-brand-muted-fg/40 pl-11 pr-4 py-3.5 w-full rounded-xl outline-none transition-all shadow-sm ${inputBorderClass}`}
                    required 
                    disabled={loading} 
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1">Password</label>
                <div className="relative group">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    value={formData.password} 
                    onChange={(e) => setFormData({...formData, password: e.target.value})} 
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

                <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1 mt-3">Confirm Password</label>
                <div className="relative group">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword || ''}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    className={`bg-brand-bg/50 border text-brand-fg placeholder:text-brand-muted-fg/40 pl-11 pr-10 py-3.5 w-full rounded-xl outline-none transition-all shadow-sm ${inputBorderClass}`}
                    required
                    disabled={loading}
                  />
                  <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  onMouseDown={() => setShowConfirmPassword(true)}
                  onMouseUp={() => setShowConfirmPassword(false)}
                  onMouseLeave={() => setShowConfirmPassword(false)}
                  onBlur={() => setShowConfirmPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg/60 hover:text-brand-primary transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                </div>

                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-semantic-danger text-sm mt-2">Passwords do not match.</p>
                )}

                {/* PASSWORD CRITERIA CHECKLIST */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 p-3 bg-brand-bg/40 rounded-xl border border-brand-border/40">
                  {passwordCriteria.map((criterion, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[11px] font-bold tracking-wide uppercase">
                      {criterion.met ? (
                        <Check className="w-3.5 h-3.5 text-semantic-success" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-brand-muted-fg/50" />
                      )}
                      <span className={criterion.met ? "text-brand-fg" : "text-brand-muted-fg/60"}>
                        {criterion.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={loading || !passwordCriteria.every(c => c.met)} 
                className="mt-3 w-full flex items-center justify-center gap-2 bg-accent/95 hover:shadow-glow-accent text-brand-fg hover:bg-accent/70 py-4 rounded-xl font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(var(--brand-primary),0.3)] disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating account...
                  </span>
                ) : (
                  <>Sign Up <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
              
              <div className="h-px w-full bg-brand-border/40 my-3"></div>
              
              <p className="text-center text-sm text-brand-muted-fg">
                Already have an account? <Link to="/login" className="text-brand-primary hover:underline font-bold transition-all ml-1">Log In</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}