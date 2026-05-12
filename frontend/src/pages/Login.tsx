import { Link } from 'react-router-dom'
import { useLogin } from '../hooks/useLogin'
import { Terminal, LockKeyhole, ArrowRight, ShieldAlert } from 'lucide-react'

export default function Login() {
  const { email, setEmail, password, setPassword, error, loading, handleLogin } = useLogin()

  const inputBorderClass = error 
    ? "border-semantic-danger focus:border-semantic-danger focus:ring-1 focus:ring-semantic-danger/50" 
    : "border-brand-border/60 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50";

  return (
    <div className="flex min-h-screen bg-brand-bg relative selection:bg-brand-primary selection:text-white">
      
     
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#0a0d13]">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity"
          style={{
            backgroundImage: 'url("/backgrounds/abstract-dark.jpg")'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-bg via-brand-bg/50 to-transparent"></div>
        <div className="absolute inset-0 bg-brand-primary/5 mix-blend-color-dodge"></div>
        <div className="relative z-10 flex flex-col justify-between p-12 h-full w-full">
          <Link to="/" className="w-fit">
            <span className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand-fg to-brand-muted-fg flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Terminal size={24} className="text-brand-primary" /> AlphaSwarm
            </span>
          </Link>
          
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary text-xs font-mono uppercase tracking-widest mb-6">
              System Secured
            </div>
            <h2 className="text-4xl font-bold text-white leading-tight tracking-tight mb-4">
              Return to the <br />Swarm.
            </h2>
            <p className="text-brand-muted-fg text-lg font-light leading-relaxed">
              Log in to review your AI Investment Committee's latest reasoning traces, assess hype alerts, and manage your simulated portfolio.
            </p>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-primary/10 rounded-full blur-[100px] -z-10 lg:hidden pointer-events-none"></div>

        <div className="w-full max-w-md flex flex-col z-10">

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
              <label className="text-xs text-brand-muted-fg font-bold tracking-widest uppercase ml-1">Email Address</label>
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

            <div className="flex flex-col gap-1.5 mb-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-xs text-brand-muted-fg font-bold tracking-widest uppercase">Password</label>
              </div>
              <div className="relative group">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg/50 group-focus-within:text-brand-primary transition-colors" />
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className={`bg-brand-bg/50 border text-brand-fg placeholder:text-brand-muted-fg/40 pl-11 pr-4 py-3.5 w-full rounded-xl outline-none transition-all shadow-sm ${inputBorderClass}`} 
                  required 
                  disabled={loading} 
                />
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={loading} 
              className="mt-2 w-full flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary/90 text-white py-4 rounded-xl font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(var(--brand-primary),0.3)] hover:shadow-[0_0_20px_rgba(var(--brand-primary),0.4)] disabled:opacity-70 disabled:shadow-none"
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