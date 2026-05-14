import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Sparkles,
  BarChart3,
  Download,
  MessageSquare,
  Eye,
  Flame,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useAuthStore } from "../store/authStore";
import { type AssetRecommendation } from "../hooks/useDashboardStats";
import { supabase } from "../lib/supabase";

import ConfidenceRing from "../components/dashboard/ConfidenceRing";
import DualBar from "../components/dashboard/DualBar";
import RecommendationCard from "../components/dashboard/RecommendationCard";

export default function DashboardPage() {
  const {
    search,
    setSearch,
    topPick,
    filteredRecs,
    recommendationError,
    latestRunCreatedAt,
  } = useDashboardStats();

  type PreviewTab = "overview" | "sentiment" | "fundamentals" | "hype";
  const [topPickTab, setTopPickTab] = useState<PreviewTab>("overview");

  // Temporary toggle to hide header controls during this iteration
  const hideHeaderControls = true;

  function getTimeGreeting(): string {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    return "Good evening";
  }

  function getTopPickPreview(tab: PreviewTab) {
    if (!topPick) return { title: "Quick Take", body: "" };

    switch (tab) {
      case "sentiment":
        return {
          title: "Market Vibe",
          body:
            topPick.sentimentScore >= 70
              ? `Strong social momentum. With a score of ${topPick.sentimentScore}/100, the internet is highly bullish on ${topPick.ticker}.`
              : `Neutral chatter. A score of ${topPick.sentimentScore}/100 indicates balanced or quiet discussion online.`,
        };
      case "fundamentals":
        return {
          title: "Hard Numbers",
          body: `Quantitative Score: ${topPick.fundamentalsScore}/100. Higher quant scores indicate stronger technical signals and healthier financials backing the AI's decision.`,
        };
      case "hype":
        return {
          title: "Hype Risk Assessment",
          body:
            topPick.hypePenalty > 0
              ? `Hype Penalty Applied: The AI deducted ${topPick.hypePenalty} points from ${topPick.ticker}'s final score because social hype is outpacing the math.`
              : `Clear Signal. No hype penalties were applied (${topPick.hypePenalty} points deducted).`,
        };
      default:
        return { title: "AlphaSwarm Thesis", body: topPick.reasoning };
    }
  }

  const topPickPreview = getTopPickPreview(topPickTab);

  const { profile, isLoading, isProfileLoading, setSession } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {

    }
    setSession(null)
    navigate('/', { replace: true })
  }

  const currentlyLoading =
    isProfileLoading !== undefined ? isProfileLoading : isLoading;

  useEffect(() => {
    if (!currentlyLoading && profile?.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [profile, currentlyLoading, navigate]);

  if (currentlyLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg">
        Loading workspace...
      </div>
    );
  }

  if (profile?.role === "admin") return null;

  return (
    <div className="space-y-6 pt-10 px-8 pb-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-l-4 border-brand-primary bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-fg">
              {getTimeGreeting()}
              {profile?.first_name ? `, ${profile.first_name}` : ""}
            </h1>
            <p className="text-brand-muted-fg text-sm mt-1">
              Here's what your AI Investment Committee recommends today.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-brand-muted-fg">
          <span>
            Last AI run:{" "}
            {latestRunCreatedAt
              ? new Date(latestRunCreatedAt).toLocaleString()
              : "—"}
          </span>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-semantic-danger/10 border border-semantic-danger/20 text-sm font-medium text-semantic-danger hover:bg-semantic-danger/20"
          >
            Sign out
          </button>
          <div
            className={
              hideHeaderControls
                ? "hidden"
                : "flex items-center gap-2 flex-wrap"
            }
          >
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search assets..."
                className="w-full bg-brand-secondary/60 border border-brand-border rounded-full pl-10 pr-4 py-2.5 text-sm text-brand-fg focus:ring-2 focus:ring-brand-primary/40 focus:outline-none transition"
              />
            </div>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-secondary/60 border border-brand-border text-sm font-medium hover:bg-brand-secondary text-brand-fg">
              <RefreshCw className="w-4 h-4 text-brand-muted-fg" /> Refresh
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-primary text-brand-bg text-sm font-semibold hover:opacity-90 shadow-lg shadow-brand-primary/20">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>
      </div>

      {/* Top Pick */}
      <div className="bg-brand-bg/60 backdrop-blur-xl border border-brand-border/50 border-l-4 border-l-brand-primary rounded-lg p-6 relative z-50 overflow-visible hover:border-brand-border/60 transition-colors">
        <Link
          to={`/asset/${topPick?.ticker}`}
          className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity w-fit"
        >
          <Sparkles className="w-4 h-4 text-brand-primary" />
          <span className="text-xs uppercase text-brand-primary font-semibold">
            Top Pick Today
          </span>
        </Link>
        <div className="flex flex-col md:flex-row gap-6">
          <Link
            to={`/asset/${topPick?.ticker}`}
            className="hover:opacity-80 transition-opacity relative z-50"
          >
            <ConfidenceRing
              score={topPick?.confidenceScore || 0}
              label="Confidence Score"
            />
          </Link>
          <div className="flex-1 space-y-3 w-full min-w-0">
            <Link
              to={`/asset/${topPick?.ticker}`}
              className="flex items-start gap-3 hover:opacity-80 transition-opacity w-fit"
            >
              <div>
                <h2 className="text-2xl font-bold font-mono">
                  {topPick?.ticker}
                </h2>
                <span className="px-3 py-1 bg-brand-secondary rounded-full text-xs font-mono text-brand-muted-fg">
                  {topPick?.name}
                </span>
                <div className="text-sm font-mono text-brand-muted-fg mt-1">
                  R{" "}
                  <span className="font-mono">
                    {topPick?.currentPrice?.toFixed(2)}
                  </span>
                </div>
              </div>
            </Link>
            <DualBar
              sentimentScore={topPick?.sentimentScore || 0}
              quantitativeScore={topPick?.fundamentalsScore || 0}
            />
            <div className="flex items-center gap-1 bg-brand-bg/60 border border-brand-border/50 rounded-full p-1 backdrop-blur-md">
              {[
                { id: "overview" as PreviewTab, label: "Overview", icon: Eye },
                {
                  id: "sentiment" as PreviewTab,
                  label: "Vibe",
                  icon: MessageSquare,
                },
                {
                  id: "fundamentals" as PreviewTab,
                  label: "Numbers",
                  icon: BarChart3,
                },
                { id: "hype" as PreviewTab, label: "Hype", icon: Flame },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopPickTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-colors ${topPickTab === t.id ? "bg-brand-primary text-brand-bg" : "text-brand-muted-fg hover:text-brand-fg"}`}
                >
                  <t.icon className="w-3 h-3" />{" "}
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="bg-brand-bg/60 backdrop-blur-md rounded-2xl p-3 border border-brand-border/50 w-full h-auto">
              <p className="text-[10px] text-brand-muted-fg uppercase tracking-widest mb-2 font-semibold">
                {topPickPreview.title}
              </p>
              <p className="text-xs text-brand-fg/85 leading-relaxed w-full">
                {topPickPreview.body}
              </p>
            </div>
            <div className="flex items-center justify-start">
              <Link
                to={`/asset/${topPick?.ticker}`}
                className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold"
              >
                Full analysis <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div>
        <h2 className="text-lg font-semibold text-brand-fg mb-4">
          Personalized Recommendations
        </h2>
        {recommendationError ? (
          <div className="bg-brand-bg/60 backdrop-blur-xl border border-brand-border/50 border-l-4 border-l-semantic-danger p-6 rounded-lg text-sm text-brand-muted-fg">
            <p className="font-semibold text-brand-fg mb-2">
              No dashboard data available
            </p>
            <p>{recommendationError}</p>
          </div>
        ) : filteredRecs.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-brand-muted-fg">
            No recommendations available right now.
          </div>
        ) : (
          <div className="bento-grid">
            {filteredRecs.map((asset: AssetRecommendation, i: number) => {
              const cardSize = "col-span-6 md:col-span-3 lg:col-span-3";
              return (
                <RecommendationCard
                  key={asset.ticker}
                  asset={asset}
                  sizeClass={cardSize}
                  delay={i}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Disclaimer Footer */}
      <div className="mt-12 pt-8 border-t border-brand-border/30">
        <div className="bg-brand-bg/60 backdrop-blur-xl border border-brand-border/50 rounded-lg p-4">
          <p className="text-xs text-brand-muted-fg leading-relaxed">
            <strong className="text-brand-fg block mb-2">Disclaimer:</strong>
            AlphaSwarm is an AI-powered analytical tool designed for
            informational and educational purposes only. The "Confidence,"
            "Quant," and "Sentiment" scores are generated by automated
            algorithms and do not constitute professional financial, investment,
            or legal advice. All trading involves risk; past performance is not
            indicative of future results. Please consult with a licensed
            financial advisor before making any investment decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
