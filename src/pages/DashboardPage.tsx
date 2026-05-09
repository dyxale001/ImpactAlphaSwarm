import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MOCK_RECOMMENDATIONS, type AssetRecommendation } from "@/data/mockData";
import ConfidenceRing from "@/components/ConfidenceRing";
import DualBar from "@/components/DualBar";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Search,
  Sparkles,
  MessageSquare,
  BarChart3,
  Flame,
  Eye,
  Radio,
  Calendar,
  Download,
  ChevronDown,
  LogIn,
  LogOut,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

type PreviewTab = "overview" | "sentiment" | "fundamentals" | "hype";

function getPreview(asset: AssetRecommendation, tab: PreviewTab): { title: string; body: string } {
  switch (tab) {
    case "sentiment":
      return {
        title: "Market Vibe",
        body:
          asset.sentimentScore >= 75
            ? `Social channels are loudly bullish on ${asset.ticker}. Reddit and Telegram chatter is spiking with positive mentions.`
            : asset.sentimentScore >= 50
            ? `Sentiment is mixed-to-positive. Some buzz online but no clear consensus among retail investors yet.`
            : `Quiet or skeptical sentiment. Few people are talking about ${asset.ticker} right now.`,
      };
    case "fundamentals":
      return {
        title: "Hard Numbers",
        body:
          asset.fundamentalsScore >= 75
            ? `Strong financials: healthy revenue growth, solid margins, and reasonable valuation versus peers.`
            : asset.fundamentalsScore >= 50
            ? `Decent fundamentals with some mixed signals. Earnings are stable but growth or valuation has caveats.`
            : `Weak or stretched fundamentals. Earnings or valuation metrics raise concerns at current price.`,
      };
    case "hype":
      return {
        title: "Hype Check",
        body: asset.hypeAlert
          ? `Caution: social hype is significantly outpacing the underlying numbers. Easy to get caught buying the top.`
          : `Balanced. Sentiment and fundamentals are roughly in sync — no obvious hype-driven mispricing.`,
      };
    default:
      return {
        title: "Quick Take",
        body: asset.reasoning.split(". ").slice(0, 2).join(". ") + ".",
      };
  }
}

function MiniSparkline({ seed, positive }: { seed: number; positive: boolean }) {
  // Deterministic pseudo-random points based on seed
  const points = Array.from({ length: 14 }, (_, i) => {
    const v = Math.sin((seed + i) * 1.7) * 8 + Math.cos((seed + i) * 0.9) * 6;
    return `${i * 8},${20 - v}`;
  }).join(" ");
  const stroke = positive ? "hsl(var(--accent))" : "hsl(var(--primary))";
  return (
    <svg viewBox="0 0 112 40" className="w-full h-10">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RecommendationCard({ asset, sizeClass, delay }: { asset: AssetRecommendation; sizeClass: string; delay: number }) {
  const [tab, setTab] = useState<PreviewTab>("overview");
  const preview = getPreview(asset, tab);

  const tabs: { id: PreviewTab; label: string; icon: typeof Eye }[] = [
    { id: "overview", label: "Overview", icon: Eye },
    { id: "sentiment", label: "Vibe", icon: MessageSquare },
    { id: "fundamentals", label: "Numbers", icon: BarChart3 },
    { id: "hype", label: "Hype", icon: Flame },
  ];

  return (
    <div
      className={`soft-card p-5 space-y-4 hover:border-primary/40 transition-all ${sizeClass}`}
      style={{ animation: `slide-up ${0.4 + delay * 0.08}s ease-out forwards` }}
    >
      {/* Chip-style header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-background/70 border border-border/60 flex items-center justify-center text-[10px] font-bold font-mono shrink-0">
            {asset.ticker.slice(0, 3)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{asset.ticker}</p>
            <p className="text-[11px] text-muted-foreground truncate">{asset.category}</p>
          </div>
        </div>
        <div className={`chip ${asset.change >= 0 ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
          {asset.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {asset.change >= 0 ? "+" : ""}{asset.change}%
        </div>
      </div>

      {/* Price + sparkline row */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Price</p>
          <p className="text-xl font-bold font-mono leading-tight">${asset.price.toFixed(2)}</p>
        </div>
        <div className="flex-1 max-w-[140px]">
          <MiniSparkline seed={asset.confidenceScore + asset.ticker.length} positive={asset.change >= 0} />
        </div>
      </div>

      <DualBar sentimentScore={asset.sentimentScore} fundamentalsScore={asset.fundamentalsScore} />

      {/* Pill tab switcher */}
      <div className="flex items-center gap-1 bg-background/60 border border-border/60 rounded-full p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTab(t.id);
              }}
              className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Preview content */}
      <div className="bg-background/50 rounded-2xl p-3 border border-border/50 min-h-[88px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 font-semibold">{preview.title}</p>
        <p className="text-xs text-foreground/85 leading-relaxed">{preview.body}</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`chip ${
            asset.confidenceScore >= 70 ? "bg-primary/15 text-primary" :
            asset.confidenceScore >= 50 ? "bg-warning/15 text-warning" :
            "bg-muted-foreground/20 text-muted-foreground"
          }`}>
            Score {asset.confidenceScore}
          </span>
          {asset.hypeAlert && (
            <span className="chip bg-warning/15 text-warning">
              <AlertTriangle className="w-3 h-3" /> Hype
            </span>
          )}
        </div>
        <Link
          to={`/asset/${asset.ticker}`}
          className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
        >
          Full analysis <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
export default function DashboardPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    navigate("/login");
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const topPick = MOCK_RECOMMENDATIONS[0];

  const filteredRecs = MOCK_RECOMMENDATIONS.slice(1).filter(
    (a) =>
      a.ticker.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase())
  );

  const avgConfidence = Math.round(
    MOCK_RECOMMENDATIONS.reduce((s, a) => s + a.confidenceScore, 0) /
      MOCK_RECOMMENDATIONS.length
  );

  const hypeCount = MOCK_RECOMMENDATIONS.filter((a) => a.hypeAlert).length;
  const strong = MOCK_RECOMMENDATIONS.filter((a) => a.confidenceScore >= 70).length;
  const moderate = MOCK_RECOMMENDATIONS.filter(
    (a) => a.confidenceScore >= 50 && a.confidenceScore < 70
  ).length;
  const cautious = MOCK_RECOMMENDATIONS.filter((a) => a.confidenceScore < 50).length;
  const total = MOCK_RECOMMENDATIONS.length;
  const pct = (n: number) => Math.round((n / total) * 100);

  const sparkPoints = MOCK_RECOMMENDATIONS.map(
    (a, i) => `${i * 18},${40 - (a.confidenceScore / 100) * 32}`
  ).join(" ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Here's what your AI Investment Committee recommends today.
            </p>
          </div>

          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/15 border border-accent/30 text-xs font-semibold text-accent">
            <Radio className="w-3 h-3 animate-pulse" />
            Market Online
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
         {!session ? (
  <Link
    to="/login"
    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-secondary/60 border border-border text-sm font-medium hover:bg-secondary transition"
  >
    <LogIn className="w-4 h-4 text-muted-foreground" />
    Login
  </Link>
) : (
  <button
    type="button"
    onClick={handleLogout}
    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-secondary/60 border border-border text-sm font-medium hover:bg-secondary transition"
  >
    <LogOut className="w-4 h-4 text-muted-foreground" />
    Logout
  </button>
)}

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets..."
              className="w-full bg-secondary/60 border border-border rounded-full pl-10 pr-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none transition"
            />
          </div>

          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-secondary/60 border border-border text-sm font-medium hover:bg-secondary transition">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            This Week
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>

          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition shadow-lg shadow-primary/20">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        style={{ animation: "slide-up 0.4s ease-out forwards" }}
      >
        <div className="soft-card p-6 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between mb-4 relative">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary" /> Avg Confidence
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Across {total} live recommendations
              </p>
            </div>

            <span className="chip bg-background/60 text-muted-foreground border border-border">
              LIVE
            </span>
          </div>

          <div className="flex items-end justify-between gap-6 relative">
            <div>
              <p className="text-5xl font-bold gradient-text font-mono leading-none">
                {avgConfidence}
              </p>
              <p className="text-xs text-accent font-mono mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> +4 vs last week
              </p>
            </div>

            <svg viewBox="0 0 110 44" className="w-40 h-12 opacity-90">
              <defs>
                <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>

              <polyline
                points={sparkPoints}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <polygon points={`0,44 ${sparkPoints} 110,44`} fill="url(#sparkFill)" />
            </svg>
          </div>
        </div>

        <div className="soft-card p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
                <BarChart3 className="w-3 h-3 text-accent" /> Signal Distribution
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Confidence buckets across your feed
              </p>
            </div>

            {hypeCount > 0 && (
              <span className="chip bg-warning/15 text-warning border border-warning/30">
                <AlertTriangle className="w-3 h-3" /> {hypeCount} Hype Alert
                {hypeCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary/60 border border-border/60 mb-4">
            <div className="bg-primary/80" style={{ width: `${pct(strong)}%` }} />
            <div className="bg-accent/70" style={{ width: `${pct(moderate)}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${pct(cautious)}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-primary/80" />
                <span className="text-muted-foreground">Strong</span>
              </div>
              <p className="font-mono font-semibold">
                {strong}{" "}
                <span className="text-muted-foreground font-normal">· {pct(strong)}%</span>
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-accent/70" />
                <span className="text-muted-foreground">Moderate</span>
              </div>
              <p className="font-mono font-semibold">
                {moderate}{" "}
                <span className="text-muted-foreground font-normal">· {pct(moderate)}%</span>
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground">Cautious</span>
              </div>
              <p className="font-mono font-semibold">
                {cautious}{" "}
                <span className="text-muted-foreground font-normal">· {pct(cautious)}%</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <Link
        to={`/asset/${topPick.ticker}`}
        className="glass-card glow-primary p-6 hover:border-primary/40 transition-colors block group relative overflow-hidden"
        style={{ animation: "slide-up 0.5s ease-out forwards" }}
      >
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="flex items-center gap-2 mb-4 relative">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">
            Top Pick Today
          </span>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center relative">
          <ConfidenceRing score={topPick.confidenceScore} label="Unified Score" />

          <div className="flex-1 space-y-3 w-full">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold">{topPick.ticker}</h2>
              <span className="text-sm text-muted-foreground">{topPick.name}</span>
              <span className="ml-auto text-sm font-mono flex items-center gap-1 text-primary">
                <TrendingUp className="w-4 h-4" /> +{topPick.change}%
              </span>
            </div>

            <DualBar
              sentimentScore={topPick.sentimentScore}
              fundamentalsScore={topPick.fundamentalsScore}
            />

            <div className="bg-background/50 rounded-2xl p-4 border border-border/60">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 font-semibold">
                Why This Pick?
              </p>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {topPick.reasoning}
              </p>
            </div>
          </div>
        </div>
      </Link>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Personalized Recommendations</h2>
          <Link to="/research" className="text-xs text-primary flex items-center gap-1 hover:underline">
            View Research <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="bento-grid">
          {filteredRecs.map((asset, i) => {
            const sizes = [
              "col-span-6 md:col-span-3 lg:col-span-3",
              "col-span-6 md:col-span-3 lg:col-span-3",
              "col-span-6 md:col-span-3 lg:col-span-2",
              "col-span-6 md:col-span-3 lg:col-span-2",
              "col-span-6 md:col-span-6 lg:col-span-2",
            ];

            return (
              <RecommendationCard
                key={asset.ticker}
                asset={asset}
                sizeClass={sizes[i % sizes.length]}
                delay={i}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
