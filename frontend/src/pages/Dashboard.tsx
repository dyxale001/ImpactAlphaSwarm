import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, TrendingUp, Search, Sparkles, BarChart3, Radio, Calendar, Download, ChevronDown } from "lucide-react";
import { type AssetRecommendation } from "../data/mockData";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useAuthStore } from "../store/authStore";

import ConfidenceRing from "../components/dashboard/ConfidenceRing";
import DualBar from "../components/dashboard/DualBar";
import RecommendationCard from "../components/dashboard/RecommendationCard";

export default function DashboardPage() {
  const { search, setSearch, topPick, filteredRecs, avgConfidence, hypeCount, strong, moderate, cautious, pct, sparkPoints } = useDashboardStats();
    
  const { profile, isLoading, isProfileLoading } = useAuthStore()
  const navigate = useNavigate();

  useEffect(() => {
    const currentlyLoading = isProfileLoading !== undefined ? isProfileLoading : isLoading;
    if (!currentlyLoading && profile?.role === 'admin') {
      navigate('/admin', { replace: true })
    }
  }, [profile, isProfileLoading, isLoading, navigate]);

  const currentlyLoading = isProfileLoading !== undefined ? isProfileLoading : isLoading;
  
  if (currentlyLoading) {
    return <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg">Loading workspace...</div>
  }

  if (profile?.role === 'admin') return null;



  return (
    <div className="space-y-6 pt-10 px-8 pb-10 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-fg">Dashboard</h1>
            <p className="text-brand-muted-fg text-sm mt-1">Here's what your AI Investment Committee recommends today.</p>
          </div>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-xs font-semibold text-brand-accent">
            <Radio className="w-3 h-3 animate-pulse" /> Market Online
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets..." className="w-full bg-brand-secondary/60 border border-brand-border rounded-full pl-10 pr-4 py-2.5 text-sm text-brand-fg focus:ring-2 focus:ring-brand-primary/40 focus:outline-none transition" />
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-secondary/60 border border-brand-border text-sm font-medium hover:bg-brand-secondary text-brand-fg">
            <Calendar className="w-4 h-4 text-brand-muted-fg" /> This Week <ChevronDown className="w-3 h-3 text-brand-muted-fg" />
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-primary text-brand-bg text-sm font-semibold hover:opacity-90 shadow-lg shadow-brand-primary/20">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Hero Stat Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        
        {/* Confidence Stats */}
        <div className="soft-card p-6 relative overflow-hidden">
          <div className="flex items-start justify-between mb-4 relative">
             <p className="text-xs uppercase tracking-widest text-brand-muted-fg font-semibold flex items-center gap-1.5">
               <Sparkles className="w-3 h-3 text-brand-primary" /> Avg Confidence
             </p>
          </div>
          <div className="flex items-end justify-between gap-6 relative">
            <div>
              <p className="text-5xl font-bold gradient-text font-mono leading-none">{avgConfidence}</p>
              <p className="text-xs text-brand-accent font-mono mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +4 vs last week</p>
            </div>
            <svg viewBox="0 0 110 44" className="w-40 h-12 opacity-90">
               <polyline points={sparkPoints} fill="none" stroke="var(--color-brand-primary)" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        {/* Signal Distribution */}
        <div className="soft-card p-6">
          <div className="flex items-start justify-between mb-4">
            <p className="text-xs uppercase text-brand-muted-fg font-semibold flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3 text-brand-accent" /> Signal Distribution
            </p>
            {hypeCount > 0 && <span className="chip bg-semantic-warning/15 text-semantic-warning"><AlertTriangle className="w-3 h-3" /> {hypeCount} Hypes</span>}
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-brand-secondary/60 mb-4">
            <div className="bg-brand-primary/80" style={{ width: `${pct(strong)}%` }} />
            <div className="bg-brand-accent/70" style={{ width: `${pct(moderate)}%` }} />
            <div className="bg-brand-muted-fg/40" style={{ width: `${pct(cautious)}%` }} />
          </div>
        </div>
      </div>

      {/* Top Pick */}
      <Link to={`/asset/${topPick?.ticker}`} className="glass-card glow-primary p-6 hover:border-brand-primary/40 block">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-brand-primary" /><span className="text-xs uppercase text-brand-primary font-semibold">Top Pick Today</span>
        </div>
        <div className="flex flex-col md:flex-row gap-6">
          <ConfidenceRing score={topPick?.confidenceScore || 0} label="Unified Score" />
          <div className="flex-1 space-y-3">
             <div className="flex items-center gap-3"><h2 className="text-2xl font-bold">{topPick?.ticker}</h2></div>
             <DualBar sentimentScore={topPick?.sentimentScore || 0} fundamentalsScore={topPick?.fundamentalsScore || 0} />
          </div>
        </div>
      </Link>

      {/* Grid */}
      <div>
        <h2 className="text-lg font-semibold text-brand-fg mb-4">Personalized Recommendations</h2>
        <div className="bento-grid">
          {filteredRecs.map((asset: AssetRecommendation, i: number) => {
            const sizes = [
              "col-span-6 md:col-span-3 lg:col-span-3", "col-span-6 md:col-span-3 lg:col-span-3", 
              "col-span-6 md:col-span-3 lg:col-span-2", "col-span-6 md:col-span-3 lg:col-span-2", "col-span-6 md:col-span-6 lg:col-span-2"
            ];
            return <RecommendationCard key={asset.ticker} asset={asset} sizeClass={sizes[i % sizes.length]} delay={i} />;
          })}
        </div>
      </div>
    </div>
  );
}