import { useState } from "react";
import {
  Waves,
  Cpu,
  Zap,
  TrendingUp,
  Bot,
  Heart,
  ArrowLeft,
  ChevronRight,
  Building2,
  Layers,
} from "lucide-react";
import { useUniverseAssets } from "../hooks/useUniverseAssets";
import WhaleWatching from "../components/research/WhaleWatching";
import InstitutionalOwners from "../components/research/InstitutionalOwners";
import FundHoldingsView from "../components/research/FundHoldingsView";

// Mirrors the universe tiles used in Settings' Investment Preferences.
const UNIVERSE_TILES = [
  { id: "Technology", Icon: Cpu, desc: "Software, hardware & semiconductors" },
  { id: "Green Energy", Icon: Zap, desc: "Solar, wind & clean infrastructure" },
  { id: "Finance", Icon: TrendingUp, desc: "Banks, fintech & asset management" },
  { id: "AI & Robotics", Icon: Bot, desc: "Machine learning & automation" },
  { id: "Healthcare", Icon: Heart, desc: "Biotech, pharma & medical devices" },
] as const;

export default function WhaleWatchingPage() {
  const { byUniverse, isLoading, error } = useUniverseAssets();
  const [section, setSection] = useState<"universes" | "funds">("universes");
  const [universe, setUniverse] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [tickerTab, setTickerTab] = useState<"insiders" | "institutions">(
    "insiders",
  );

  // DB universe values match the tile ids, but match case-insensitively to be safe.
  const assetsFor = (u: string) => {
    const key = Object.keys(byUniverse).find(
      (k) => k.toLowerCase() === u.toLowerCase(),
    );
    return key ? byUniverse[key] : [];
  };

  const goToUniverses = () => {
    setTicker(null);
    setUniverse(null);
  };
  const goToUniverse = (u: string) => {
    setTicker(null);
    setUniverse(u);
  };
  const goToTicker = (t: string) => {
    setTickerTab("insiders");
    setTicker(t);
  };

  return (
    <div className="max-w-5xl mx-auto pt-10 px-8 pb-20 space-y-6 animate-fade-in-up">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-brand-fg flex items-center gap-3">
          <Waves className="w-7 h-7 text-brand-primary" />
          Whale Watching
        </h1>
        <p className="text-sm text-brand-muted-fg mt-1 max-w-2xl">
          Follow the big money — insider dealings, the institutions and funds
          that own each stock, and what famous investors are buying.
          Informational only; this never affects your recommendations.
        </p>
      </div>

      {/* Top-level tabs */}
      <div className="inline-flex items-center gap-1 rounded-full border border-brand-border/50 bg-brand-bg/60 p-1 flex-wrap">
        {(
          [
            { id: "universes", label: "Universes", Icon: Layers },
            { id: "funds", label: "Top Funds", Icon: Building2 },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              section === s.id
                ? "bg-brand-primary text-brand-bg"
                : "text-brand-muted-fg hover:text-brand-fg"
            }`}
          >
            <s.Icon className="w-3.5 h-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {section === "funds" ? (
        <FundHoldingsView />
      ) : (
        <div className="space-y-6">
          {/* Breadcrumb (only when drilled into a universe/ticker) */}
          {(universe || ticker) && (
            <nav className="flex items-center gap-2 text-sm text-brand-muted-fg flex-wrap">
              <button
                onClick={goToUniverses}
                className="font-semibold text-brand-fg hover:text-brand-primary transition-colors"
              >
                Universes
              </button>
              {universe && (
                <>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                  <button
                    onClick={() => goToUniverse(universe)}
                    className={`transition-colors hover:text-brand-fg ${
                      ticker ? "" : "text-brand-fg font-semibold"
                    }`}
                  >
                    {universe}
                  </button>
                </>
              )}
              {ticker && (
                <>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                  <span className="text-brand-fg font-semibold">{ticker}</span>
                </>
              )}
            </nav>
          )}

          {/* ── Level 3: ticker whale panel ─────────────────────────── */}
          {ticker && universe ? (
        <div className="space-y-6">
          <button
            onClick={() => goToUniverse(universe)}
            className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to {universe}
          </button>

          {/* Tabs: insider dealings vs institutional owners */}
          <div className="inline-flex items-center gap-1 rounded-full border border-brand-border/50 bg-brand-bg/60 p-1">
            {(
              [
                { id: "insiders", label: "Insider Dealings", Icon: Waves },
                {
                  id: "institutions",
                  label: "Institutional Owners",
                  Icon: Building2,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTickerTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  tickerTab === t.id
                    ? "bg-brand-primary text-brand-bg"
                    : "text-brand-muted-fg hover:text-brand-fg"
                }`}
              >
                <t.Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {tickerTab === "insiders" ? (
            <WhaleWatching ticker={ticker} />
          ) : (
            <InstitutionalOwners ticker={ticker} />
          )}
        </div>
      ) : universe ? (
        /* ── Level 2: tickers within a universe ────────────────── */
        <div className="space-y-6">
          <button
            onClick={goToUniverses}
            className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> All universes
          </button>
          <div>
            <h1 className="text-3xl font-bold text-brand-fg">{universe}</h1>
            <p className="text-sm text-brand-muted-fg mt-1">
              Pick a company to see its insider dealings and institutional
              owners.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {assetsFor(universe).map((a) => (
              <button
                key={a.ticker}
                onClick={() => goToTicker(a.ticker)}
                className="text-left p-4 rounded-2xl border border-brand-border/60 bg-brand-card hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.98]"
              >
                <p className="text-lg font-bold font-mono text-brand-fg">
                  {a.ticker}
                </p>
                <p className="text-xs text-brand-muted-fg mt-0.5 truncate">
                  {a.name}
                </p>
              </button>
            ))}
          </div>
          {assetsFor(universe).length === 0 && (
            <p className="text-sm text-brand-muted-fg italic">
              No companies found in this universe.
            </p>
          )}
        </div>
      ) : (
        /* ── Level 1: universes ────────────────────────────────── */
        <div className="space-y-6">
          {error ? (
            <p className="text-sm text-brand-muted-fg italic">{error}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {UNIVERSE_TILES.map(({ id, Icon, desc }) => {
                const count = assetsFor(id).length;
                return (
                  <button
                    key={id}
                    onClick={() => goToUniverse(id)}
                    disabled={isLoading || count === 0}
                    className="group text-left p-5 rounded-2xl border border-brand-border/60 bg-brand-card hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center mb-4">
                        <Icon className="w-5 h-5 text-brand-primary" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-brand-muted-fg group-hover:text-brand-primary transition-colors" />
                    </div>
                    <p className="text-base font-semibold text-brand-fg">{id}</p>
                    <p className="text-xs text-brand-muted-fg mt-0.5">{desc}</p>
                    <p className="text-[11px] text-brand-muted-fg mt-3 font-medium">
                      {isLoading ? "Loading…" : `${count} companies`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
