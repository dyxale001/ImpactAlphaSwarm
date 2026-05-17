import { Link } from 'react-router-dom'
import { useLogin } from '../hooks/useLogin'
import { Terminal, LockKeyhole, ArrowRight, ShieldAlert, Eye, EyeOff} from 'lucide-react'
import { useState } from 'react'


export default function Login() {
  const { email, setEmail, password, setPassword, error, loading, handleLogin } = useLogin()

  const [showPassword, setShowPassword] = useState(false)

  const inputBorderClass = error 
    ? "border-semantic-danger focus:border-semantic-danger focus:ring-1 focus:ring-semantic-danger/50" 
    : "border-brand-border/60 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50";

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-bg auth-bg relative selection:bg-brand-primary selection:text-white">

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-primary/10 rounded-full blur-[100px] -z-10 lg:hidden pointer-events-none"></div>

        <div className="w-full max-w-md flex flex-col z-10">
          <div className="mb-4">
            <Link to="/" className="text-sm text-brand-muted-fg hover:text-brand-primary transition-colors font-medium">← Go back</Link>
          </div>

          <form 
            onSubmit={handleLogin} 
            className="flex flex-col gap-6"
          >
            <div className="mb-2">
              <h1 className="text-3xl font-bold text-brand-fg tracking-tight mb-2">Welcome Back</h1>
              <p className="text-brand-muted-fg font-medium">Enter your credentials to access your dashboard.</p>
            </div>

            {error && (
              <div className="text-semantic-danger text-sm font-medium bg-semantic-danger/10 border border-semantic-danger/30 p-4 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-primary font-bold tracking-widest uppercase ml-1">Email Address</label>
              <input 
                type="email" 
                placeholder="investor@example.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                className={`bg-brand-bg/50 border text-brand-fg placeholder:text-brand-muted-fg/40 px-4 py-3.5 rounded-xl outline-none transition-all shadow-sm ${inputBorderClass}`} 
                required 
                disabled={loading} 
              />
            </div>

            <div className="relative group">
              <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
              <input 
                type={showPassword ? "text" : "password"} 
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
            
            <button 
              type="submit" 
              disabled={loading} 
              className="mt-2 w-full flex items-center justify-center gap-2 bg-accent/95 hover:shadow-glow-accent text-brand-fg hover:bg-accent/70 py-4 rounded-xl font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(var(--brand-primary),0.3)] disabled:opacity-70 disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticating...
                </span>
              ) : (
                <>Sign In Securely <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <div className="h-px w-full bg-brand-border/40 my-2"></div>
            <p className="text-center text-sm text-brand-muted-fg">
              Don't have an account? <Link to="/signup" className="text-brand-primary hover:underline font-bold transition-all ml-1">Open an account</Link>
            </p>
          </form>
          
        </div>
      </div>
    </div>
  )
}