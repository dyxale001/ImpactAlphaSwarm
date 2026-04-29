import { Link } from 'react-router-dom'
import { useSignup } from '../hooks/useSignup'

export default function Signup() {
  const { email, setEmail, password, setPassword, error, loading, handleSignup } = useSignup()

  return (
    <div className="flex h-screen items-center justify-center bg-brand-bg p-4 flex-col">
        
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-primary rounded-full blur-[100px] opacity-10 pointer-events-none"></div>

      <form 
        onSubmit={handleSignup} 
        className="relative z-10 flex w-full max-w-sm flex-col gap-5 p-8 rounded-brand shadow-card bg-gradient-card border border-brand-border"
      >
        <div className="text-center mb-2">
          <h1 className="text-3xl font-bold text-brand-fg tracking-tight">AlphaSwarm</h1>
          <p className="text-brand-muted-fg mt-2">Create an account to start analyzing</p>
        </div>

        {error && (
          <div className="text-semantic-danger text-sm bg-semantic-danger/10 border border-semantic-danger/20 p-3 rounded-lg">
            {error}
          </div>
        )}
        
        <div className="flex flex-col gap-1">
          <label className="text-xs text-brand-muted-fg font-medium tracking-wide uppercase">Email</label>
          <input 
            type="email" 
            placeholder="investor@example.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            className="bg-brand-secondary border border-brand-border text-brand-fg placeholder:text-brand-border p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-all" 
            required 
            disabled={loading} 
          />
        </div>

        <div className="flex flex-col gap-1 mb-2">
          <label className="text-xs text-brand-muted-fg font-medium tracking-wide uppercase">Password</label>
          <input 
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            className="bg-brand-secondary border border-brand-border text-brand-fg placeholder:text-brand-border p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-all" 
            required 
            disabled={loading} 
          />
        </div>
        
        <button 
          type="submit" 
          disabled={loading} 
          className="bg-gradient-primary hover:shadow-glow-primary text-brand-fg p-3 rounded-lg font-medium tracking-wide transition-all disabled:opacity-50 disabled:hover:shadow-none"
        >
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>
        
        <p className="text-center text-sm text-brand-muted-fg mt-2">
          Already have an account? <Link to="/login" className="text-brand-primary hover:text-brand-primary-glow font-medium transition-colors">Log In</Link>
        </p>
      </form>
    </div>
  )
}