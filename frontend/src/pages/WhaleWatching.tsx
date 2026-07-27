import { useMemo, useState } from "react";
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
  Activity,
} from "lucide-react";
import { useUniverseAssets, type UniverseAsset } from "../hooks/useUniverseAssets";
import WhaleWatching from "../components/research/WhaleWatching";
import InstitutionalOwners from "../components/research/InstitutionalOwners";
import WhaleActivityOverview from "../components/research/WhaleActivityOverview";
import CompanySearch from "../components/research/CompanySearch";
import FundHoldingsView, {
  FundHoldingsDetail,
} from "../components/research/FundHoldingsView";
import type { FundHolding } from "../services/api/analysis";

// Mirrors the universe tiles used in Settings' Investment Preferences.
const UNIVERSE_TILES = [
  { id: "Technology", Icon: Cpu, desc: "Software, hardware & semiconductors" },
  { id: "Green Energy", Icon: Zap, desc: "Solar, wind & clean infrastructure" },
  { id: "Finance", Icon: TrendingUp, desc: "Banks, fintech & asset management" },
  { id: "AI & Robotics", Icon: Bot, desc: "Machine learning & automation" },
  { id: "Healthcare", Icon: Heart, desc: "Biotech, pharma & medical devices" },
] as const;

type Section = "activity" | "universes" | "funds";

// Small "New" pill for companies the asset-discovery agent added in the last
// week. Deliberately unexplained: it marks the row without turning the card
// into a readout of the agent's internals.
function NewBadge() {
  return (
    <span className="shrink-0 rounded-full bg-brand-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-primary">
      New
    </span>
  );
}

export default function WhaleWatchingPage() {
  const { byUniverse, all, isLoading, error } = useUniverseAssets();
  const [section, setSection] = useState<Section>("activity");
  const [openFund, setOpenFund] = useState<FundHolding | null>(null);
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

  const assetByTicker = useMemo(() => {
    const map: Record<string, UniverseAsset> = {};
    for (const a of all) map[a.ticker] = a;
    return map;
  }, [all]);

  const openCompany = (t: string, u: string | null) => {
    setTickerTab("insiders");
    if (u) setUniverse(u);
    setTicker(t);
  };

  const closeCompany = () => setTicker(null);

  const goToSection = (s: Section) => {
    setSection(s);
    setTicker(null);
    setUniverse(null);
    setOpenFund(null);
  };

  const selected = ticker ? assetByTicker[ticker] : undefined;

  return (
    <div className="max-w-5xl mx-auto pt-10 px-8 pb-20 space-y-6 animate-fade-in-up">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-fg flex items-center gap-3">
            <Waves className="w-7 h-7 text-brand-primary" />
            Whale Watching
          </h1>
          <p className="text-sm text-brand-muted-fg mt-1 max-w-2xl">
            Follow the big money: insider dealings, the institutions and funds
            that own each stock, and what the largest investors are buying.
            Informational only; this never affects your recommendations.
          </p>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[18rem]">
          <CompanySearch
            assets={all}
            onSelect={openCompany}
            disabled={isLoading || all.length === 0}
          />
        </div>
      </div>

      {/* Top-level tabs */}
      <div className="inline-flex items-center gap-1 rounded-full border border-brand-border/50 bg-brand-bg/60 p-1 flex-wrap">
        {(
          [
            { id: "activity", label: "Activity", Icon: Activity },
            { id: "universes", label: "Universes", Icon: Layers },
            { id: "funds", label: "Top Funds", Icon: Building2 },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            onClick={() => goToSection(s.id)}
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

      {/* A company panel opens over whichever section you came from, so it is
          reachable from search, the activity feed and the universe grid alike. */}
      {ticker ? (
        <div className="space-y-6">
          <button
            onClick={closeCompany}
            className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {universe && section === "universes"
              ? `Back to ${universe}`
              : "Back"}
          </button>

          <div className="soft-card p-5 space-y-2">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2 className="text-2xl font-bold font-mono text-brand-fg">
                {ticker}
              </h2>
              <p className="text-sm text-brand-muted-fg">{selected?.name}</p>
              {selected?.isNew && <NewBadge />}
            </div>
            {selected?.description && (
              <p className="text-sm text-brand-muted-fg leading-relaxed max-w-2xl">
                {selected.description}
              </p>
            )}
          </div>

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
      ) : section === "activity" ? (
        <WhaleActivityOverview
          onOpenCompany={openCompany}
          onBrowseFunds={() => goToSection("funds")}
        />
      ) : section === "funds" ? (
        openFund ? (
          <FundHoldingsDetail
            fund={openFund}
            onBack={() => setOpenFund(null)}
            onOpenCompany={openCompany}
          />
        ) : (
          <FundHoldingsView onOpenFund={setOpenFund} />
        )
      ) : universe ? (
        /* Companies within a universe */
        <div className="space-y-6">
          <button
            onClick={() => setUniverse(null)}
            className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> All universes
          </button>
          <div>
            <h2 className="text-2xl font-bold text-brand-fg">{universe}</h2>
            <p className="text-sm text-brand-muted-fg mt-1">
              Pick a company to see its insider dealings and institutional
              owners.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assetsFor(universe).map((a) => (
              <button
                key={a.ticker}
                onClick={() => openCompany(a.ticker, a.universe)}
                className="text-left p-4 rounded-2xl border border-brand-border/60 bg-brand-card hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.98]"
              >
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold font-mono text-brand-fg">
                    {a.ticker}
                  </p>
                  {a.isNew && <NewBadge />}
                </div>
                <p className="text-xs text-brand-muted-fg mt-0.5 truncate">
                  {a.name}
                </p>
                {a.description && (
                  <p className="text-xs text-brand-muted-fg mt-2 leading-snug line-clamp-3">
                    {a.description}
                  </p>
                )}
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
        /* Universe tiles */
        <div className="space-y-6">
          {error ? (
            <p className="text-sm text-brand-muted-fg italic">{error}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {UNIVERSE_TILES.map(({ id, Icon, desc }) => {
                const assets = assetsFor(id);
                const newCount = assets.filter((a) => a.isNew).length;
                return (
                  <button
                    key={id}
                    onClick={() => setUniverse(id)}
                    disabled={isLoading || assets.length === 0}
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
                    <p className="text-[11px] text-brand-muted-fg mt-3 font-medium flex items-center gap-1.5">
                      {isLoading ? "Loading…" : `${assets.length} companies`}
                      {newCount > 0 && <NewBadge />}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
