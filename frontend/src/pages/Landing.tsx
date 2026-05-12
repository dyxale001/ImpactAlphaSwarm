import { Link } from 'react-router-dom';
import { ChevronRight, Activity, Terminal, CheckCircle2, ShieldAlert, Cpu, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Landing() {
  return (
    <div className="min-h-screen font-sans selection:bg-brand-primary selection:text-white relative bg-brand-bg text-brand-fg">
      
      {/*Background */}
      <div 
        className="fixed inset-0 z-0 opacity-15 bg-cover bg-center pointer-events-none mix-blend-luminosity"
        style={{
          backgroundImage: 'url("/backgrounds/abstract-dark.jpg")'
        }}
      />
      
      <div className="relative z-10 w-full min-h-screen flex flex-col">
        
        {/* Navigation Bar */}
        <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full sticky top-0 z-50">
          <div className="absolute inset-0 bg-brand-bg/60 backdrop-blur-md border-b border-brand-border/30 rounded-b-2xl"></div>
          
          <div className="flex items-center relative z-10">
            <span className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand-fg to-brand-muted-fg flex items-center gap-2">
              <Terminal size={24} className="text-brand-primary" /> AlphaSwarm
            </span>
          </div>
          <div className="flex items-center gap-6 relative z-10">
            <Link to="/login" className="text-brand-muted-fg font-medium hover:text-brand-primary transition-colors text-sm uppercase tracking-wider">
              Client Portal
            </Link>
            <Link 
              to="/signup" 
              className="bg-brand-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-brand-primary/90 transition-all shadow-[0_0_15px_rgba(var(--brand-primary),0.3)] text-sm uppercase tracking-wider"
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
              <span className="text-brand-muted-fg font-medium">Retail Access.</span>
            </h1>
            
            <p className="text-xl text-brand-muted-fg max-w-2xl leading-relaxed font-light drop-shadow-md">
              Navigate the markets with an AI Investment Committee. 
              We synthesize massive sets of qualitative sentiment and quantitative data to execute logic-driven, emotionless research.
            </p>
            
            <div className="flex items-center justify-center gap-4 pt-6">
              <Link 
                to="/signup" 
                className="bg-brand-fg text-brand-bg px-8 py-4 rounded-lg font-bold hover:opacity-90 transition-all flex items-center gap-2 active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
                Launch Platform <ChevronRight size={20} />
              </Link>
              <Link 
                to="#platform-tour" 
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('platform-tour')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-8 py-4 rounded-lg font-bold border border-brand-border/50 bg-brand-bg/50 backdrop-blur-sm text-brand-fg hover:bg-brand-secondary/50 transition-all"
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
                <div className="absolute -inset-2 bg-gradient-to-r from-brand-primary to-brand-accent rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <img 
                  src="/screenshots/dashboard.png" 
                  alt="AlphaSwarm Dashboard" 
                  className="relative rounded-xl border border-brand-border/50 shadow-2xl object-cover backdrop-blur-sm bg-brand-bg/40"
                />
              </div>
              <div className="order-1 lg:order-2 flex flex-col gap-6 lg:pl-10 p-6 rounded-2xl bg-brand-bg/30 backdrop-blur-sm border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary border border-brand-primary/20 backdrop-blur-md">
                  <Activity size={24} />
                </div>
                <h3 className="text-3xl font-bold tracking-tight drop-shadow-md">The Command Center</h3>
                <p className="text-brand-muted-fg leading-relaxed">
                  Your personalized dashboard centralizes the intelligence of the Swarm. View your top daily pick, unified confidence scores, and real-time signal distributions at a single glance.
                </p>
                <ul className="space-y-3 mt-2">
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-brand-primary w-5 h-5" /> Unified Confidence Scoring</li>
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-brand-primary w-5 h-5" /> Instant Risk & Hype Alerts</li>
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-brand-primary w-5 h-5" /> Personalized Asset Recommendations</li>
                </ul>
              </div>
            </div>

            {/* Feature 2: Explainable AI (Research Deep Dive) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="flex flex-col gap-6 lg:pr-10 p-6 rounded-2xl bg-brand-bg/30 backdrop-blur-sm border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 backdrop-blur-md">
                  <Cpu size={24} />
                </div>
                <h3 className="text-3xl font-bold tracking-tight drop-shadow-md">Explainable AI (XAI)</h3>
                <p className="text-brand-muted-fg leading-relaxed">
                  Never blindly trust a black box again. The Research Deep Dive breaks down exactly how the AI arrived at its conclusion, pitting Social Sentiment against actual Quantitative Fundamentals.
                </p>
                <ul className="space-y-3 mt-2">
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-purple-500 w-5 h-5" /> Transparent Reasoning Traces</li>
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-purple-500 w-5 h-5" /> Real-time "Hype Gap" detection</li>
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-purple-500 w-5 h-5" /> Breakdown of sub-agent (Quant vs Scout) logic</li>
                </ul>
              </div>
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <img 
                  src="/screenshots/research.png" 
                  alt="Research Deep Dive" 
                  className="relative rounded-xl border border-brand-border/50 shadow-2xl object-cover backdrop-blur-sm bg-brand-bg/40"
                />
              </div>
            </div>

            {/* Feature 3: Paper Trading Portfolio */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="order-2 lg:order-1 relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <img 
                  src="/screenshots/portfolio.png" 
                  alt="Paper Trading Portfolio" 
                  className="relative rounded-xl border border-brand-border/50 shadow-2xl object-cover backdrop-blur-sm bg-brand-bg/40"
                />
              </div>
              <div className="order-1 lg:order-2 flex flex-col gap-6 lg:pl-10 p-6 rounded-2xl bg-brand-bg/30 backdrop-blur-sm border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 backdrop-blur-md">
                  <ShieldAlert size={24} />
                </div>
                <h3 className="text-3xl font-bold tracking-tight drop-shadow-md">Zero-Risk Simulation</h3>
                <p className="text-brand-muted-fg leading-relaxed">
                  Put the AI to the test without risking a cent. Our built-in Paper Trading environment allows you to execute the AI's recommendations with virtual capital and track historic P/L performance over time.
                </p>
                <div className="bg-brand-secondary/40 border border-brand-border/50 rounded-lg p-4 mt-2 backdrop-blur-md">
                  <p className="text-sm font-medium text-brand-fg">"Practice builds confidence. Validate the Swarm's intelligence before connecting your real brokerage."</p>
                </div>
              </div>
            </div>

            {/* Feature 4: The War Room / Vault (Onboarding) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="flex flex-col gap-6 lg:pr-10 p-6 rounded-2xl bg-brand-bg/30 backdrop-blur-sm border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 backdrop-blur-md">
                  <Lock size={24} />
                </div>
                <h3 className="text-3xl font-bold tracking-tight drop-shadow-md">The Vault & War Room</h3>
                <p className="text-brand-muted-fg leading-relaxed">
                  The AI works for *you*. During onboarding, establish your financial boundaries in the Vault and psychometrically align the AI's logic with your risk timeline in the War Room. 
                </p>
                <ul className="space-y-3 mt-2">
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-amber-500 w-5 h-5" /> Strict Foundational Risk Limits</li>
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-amber-500 w-5 h-5" /> Custom Liquidity & Mandate Sliders</li>
                  <li className="flex items-center gap-3 text-sm text-brand-muted-fg"><CheckCircle2 className="text-amber-500 w-5 h-5" /> Select target Combat Zones (Sectors)</li>
                </ul>
              </div>
              <div className="relative group">
                 <div className="absolute -inset-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                 <img 
                    src="/screenshots/war-room.png" 
                    alt="The War Room Customization" 
                    className="relative w-full rounded-xl border border-brand-border/50 shadow-2xl object-cover backdrop-blur-sm bg-brand-bg/40"
                  />
              </div>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}