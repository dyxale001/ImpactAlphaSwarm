import { Link } from 'react-router-dom';
import { ChevronRight, Activity, Terminal, CheckCircle2, ShieldAlert, Cpu, } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Landing() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-bg landing-auth-bg relative selection:bg-brand-primary selection:text-white">
      
      {/*Background */}
      <div 
        className="fixed inset-0 z-0 opacity-15 bg-cover bg-center bg-background pointer-events-none mix-blend-luminosity"
      />
      
      <div className="relative z-10 w-full min-h-screen flex flex-col">
        
        {/* Navigation Bar */}
        <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full sticky top-0 z-50">
          <div className="absolute inset-0 bg-brand-bg/60 backdrop-blur-md border-b border-brand-border/30 rounded-b-2xl"></div>
          
          <div className="flex items-center relative z-10">
            <span className="text-2xl font-black tracking-tighter bg-clip-text text-primary flex items-center gap-2">
              <Terminal size={24} className="text-brand-primary" /> AlphaSwarm
            </span>
          </div>
          <div className="flex items-center gap-6 relative z-10">
            <Link to="/login" className="text-brand-muted-fg font-medium hover:text-brand-primary transition-colors text-sm uppercase tracking-wider">
              Sign In
            </Link>
            <Link 
              to="/signup" 
              className="bg-accent/95 hover:shadow-glow-accent text-brand-fg hover:bg-accent/70 px-6 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(var(--brand-primary),0.3)] text-sm uppercase tracking-wider"
            >
              Open Account
            </Link>
          </div>
        </nav>

        {/* Hero Section*/}
        <main className="max-w-4xl mx-auto px-8 pt-24 pb-32 flex flex-col items-center text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-brand-bg/50 backdrop-blur-sm text-brand-primary border-l-4 border-brand-primary w-fit text-xs font-mono uppercase tracking-widest">
              <Activity size={14} /> Swarm Intelligence Network Active
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-black leading-[1.1] tracking-tighter drop-shadow-2xl">
              Institutional Grade.<br />
              <span className="text-primary font-medium">Retail Access.</span> 
            </h1>
            
            <p className="text-xl text-primary/80 max-w-2xl leading-relaxed font-light drop-shadow-md">
              Navigate the markets with an AI Investment Committee. 
              We synthesize massive sets of qualitative sentiment and quantitative data to execute logic-driven, emotionless research.
            </p>
            
            <div className="flex items-center justify-center gap-4 pt-6">
              <Link 
                to="/signup" 
                className="bg-accent/95 hover:shadow-glow-accent text-brand-fg hover:bg-accent/70 px-8 py-4 rounded-lg font-bold hover:opacity-90 transition-all flex items-center gap-2 active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
                Launch Platform <ChevronRight size={20} />
              </Link>
              <Link 
                to="#platform-tour" 
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('platform-tour')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-8 py-4 rounded-lg font-bold border border-brand-border/50 bg-brand-bg/50 backdrop-blur-sm text-brand-fg hover:bg-primary/80 hover:text-background transition-all"
              >
                View Platform
              </Link>
            </div>
          </motion.div>
        </main>

        {/* Platform Screenshots*/}
        <section id="platform-tour" className="pt-12 pb-24 relative">
          
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4/5 h-20 bg-brand-primary/10 blur-[100px] rounded-full -z-10 pointer-events-none"></div>

          <div className="max-w-7xl mx-auto px-8 space-y-32">
            
            {/* Feature 1: The Command Center (Dashboard) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="order-2 lg:order-1 relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-accent to-brand-accent rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <img 
                  src="/screenshots/as_dashboard.png" 
                  alt="AlphaSwarm Dashboard" 
                  className="relative rounded-xl border border-brand-border/50 shadow-2xl object-cover backdrop-blur-sm bg-brand-bg/40"
                />
              </div>
              <div className="order-1 lg:order-2 flex flex-col gap-6 lg:pl-10 p-6 rounded-2xl bg-brand-bg/30 backdrop-blur-sm border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent border border-accent/20 backdrop-blur-md">
                  <Activity size={24} />
                </div>
                <h3 className="text-3xl font-bold tracking-tight drop-shadow-md">The Command Center</h3>
                <p className="text-primary leading-relaxed">
                  Your personalized dashboard centralizes the intelligence of the Swarm. View your top daily pick, unified confidence scores, and real-time signal distributions at a single glance.
                </p>
                <ul className="space-y-3 mt-2">
                  <li className="flex items-center gap-3 text-sm text-primary"><CheckCircle2 className="text-primary w-5 h-5" /> Unified Confidence Scoring</li>
                  <li className="flex items-center gap-3 text-sm text-primary"><CheckCircle2 className="text-primary w-5 h-5" /> Instant Risk & Hype Alerts</li>
                  <li className="flex items-center gap-3 text-sm text-primary"><CheckCircle2 className="text-primary w-5 h-5" /> Personalized Asset Recommendations</li>
                </ul>
              </div>
            </div>

            {/* Feature 2: Explainable AI (Research Deep Dive) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="flex flex-col gap-6 lg:pr-10 p-6 rounded-2xl bg-brand-bg/30 backdrop-blur-sm border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent border border-accent/20 backdrop-blur-md">
                  <Cpu size={24} />
                </div>
                <h3 className="text-3xl font-bold tracking-tight drop-shadow-md">Explainable AI (XAI)</h3>
                <p className="text-primary leading-relaxed">
                  Never blindly trust a black box again. The Research Deep Dive breaks down exactly how the AI arrived at its conclusion, pitting Social Sentiment against actual Quantitative Fundamentals.
                </p>
                <ul className="space-y-3 mt-2">
                  <li className="flex items-center gap-3 text-sm text-primary"><CheckCircle2 className="text-primary w-5 h-5" /> Transparent Reasoning Traces</li>
                  <li className="flex items-center gap-3 text-sm text-primary"><CheckCircle2 className="text-primary w-5 h-5" /> Real-time "Hype Gap" detection</li>
                  <li className="flex items-center gap-3 text-sm text-primary"><CheckCircle2 className="text-primary w-5 h-5" /> Breakdown of sub-agent (Quant vs Scout) logic</li>
                </ul>
              </div>
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-accent to-accent rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <img 
                  src="/screenshots/as_detailed_asset.png" 
                  alt="Research Deep Dive" 
                  className="relative rounded-xl border border-brand-border/50 shadow-2xl object-cover backdrop-blur-sm bg-brand-bg/40"
                />
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}