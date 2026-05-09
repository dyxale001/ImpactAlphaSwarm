import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { useSignup } from '../hooks/useSignup'

export default function Signup() {
  const { formData, setFormData, error, successMessage, loading, handleSubmit } = useSignup()

  const defaultInput = "bg-brand-secondary border border-brand-border text-brand-fg placeholder:text-brand-border p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-all w-full"

  const passwordCriteria = [
    { label: 'At least 8 characters', met: formData.password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(formData.password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(formData.password) },
    { label: 'Number', met: /[0-9]/.test(formData.password) },
    { label: 'Special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password) }
  ]

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg p-4 flex-col relative overflow-hidden">
        
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-primary rounded-full blur-[120px] opacity-10 pointer-events-none"></div>

      {/* Wrapping the content in the card styles */}
      <div className="relative z-10 flex w-full max-w-md flex-col gap-5 p-8 rounded-brand shadow-card bg-gradient-card border border-brand-border">
        
        {successMessage ? (
          <div className="text-center py-8">
            <div className="mx-auto w-16 h-16 bg-semantic-success/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-semantic-success" />
            </div>
            <h2 className="text-2xl font-bold text-brand-fg mb-4">Check your email</h2>
            <p className="text-brand-muted-fg leading-relaxed">
              {successMessage}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="text-center mb-2">
              <h1 className="text-3xl font-bold text-brand-fg tracking-tight">AlphaSwarm</h1>
              <p className="text-brand-muted-fg mt-2">Create an account to start analyzing</p>
            </div>

            {error && (
              <div className="text-semantic-danger text-sm bg-semantic-danger/10 border border-semantic-danger/20 p-3 rounded-lg">
                {error}
              </div>
            )}
            
            {/* FIRST & LAST NAME GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-brand-muted-fg font-medium tracking-wide uppercase">First Name</label>
                <input 
                  type="text" 
                  placeholder="Thabo" 
                  value={formData.firstName} 
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})} 
                  className={defaultInput}
                  required 
                  disabled={loading} 
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-brand-muted-fg font-medium tracking-wide uppercase">Last Name</label>
                <input 
                  type="text" 
                  placeholder="Ndawula" 
                  value={formData.lastName} 
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})} 
                  className={defaultInput}
                  required 
                  disabled={loading} 
                />
              </div>
            </div>

            {/* EMAIL */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-brand-muted-fg font-medium tracking-wide uppercase">Email</label>
              <input 
                type="email" 
                placeholder="investor@example.com" 
                value={formData.email} 
                onChange={(e) => setFormData({...formData, email: e.target.value})} 
                className={defaultInput}
                required 
                disabled={loading} 
              />
            </div>

            {/* PASSWORD */}
            <div className="flex flex-col gap-1 mb-2">
              <label className="text-xs text-brand-muted-fg font-medium tracking-wide uppercase">Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={formData.password} 
                onChange={(e) => setFormData({...formData, password: e.target.value})} 
                className={defaultInput}
                required 
                disabled={loading} 
              />
              
              {/* PASSWORD CRITERIA CHECKLIST */}
              <div className="mt-2 grid grid-cols-1 gap-1.5 p-2 bg-brand-bg rounded border border-brand-border/50">
                {passwordCriteria.map((criterion, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    {criterion.met ? (
                      <Check className="w-3.5 h-3.5 text-semantic-success" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-brand-muted-fg/50" />
                    )}
                    <span className={criterion.met ? "text-brand-fg" : "text-brand-muted-fg"}>
                      {criterion.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={loading || !passwordCriteria.every(c => c.met)} 
              className="bg-gradient-primary hover:shadow-glow-primary text-brand-fg p-3 rounded-lg font-medium tracking-wide transition-all disabled:opacity-50 disabled:hover:shadow-none"
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
            
            <p className="text-center text-sm text-brand-muted-fg mt-2">
              Already have an account? <Link to="/login" className="text-brand-primary hover:text-brand-primary-glow font-medium transition-colors">Log In</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}