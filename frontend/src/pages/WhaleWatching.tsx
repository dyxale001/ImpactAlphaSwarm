import AboutThisPage from "../components/guidance/AboutThisPage";
import { useMemo, useState } from "react";
import {
  Waves,
  Cpu,
  Zap,
  TrendingUp,
  Bot,
  Heart,
  Tv,
  ArrowLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  useUniverseAssets,
  type UniverseAsset,
} from "../hooks/useUniverseAssets";
import WhaleWatching from "../components/research/WhaleWatching";
import InstitutionalOwners from "../components/research/InstitutionalOwners";
import CompanySearch from "../components/research/CompanySearch";
import { ListingLine } from "../components/research/ListingLine";
import { useListing } from "../hooks/useListing";
import WhaleWatchingSkeleton from "../components/research/WhaleWatchingSkeleton";
import FundHoldingsView, {
  FundHoldingsDetail,
} from "../components/research/FundHoldingsView";
import type { FundHolding } from "../services/api/analysis";

// Mirrors the universe tiles used in Settings' Investment Preferences.
const UNIVERSE_TILES = [
  { id: "Technology", Icon: Cpu, desc: "Software, hardware & semiconductors" },
  { id: "Green Energy", Icon: Zap, desc: "Solar, wind, water & clean infrastructure" },
  {
    id: "Finance",
    Icon: TrendingUp,
    desc: "Banks, fintech & asset management",
  },
  { id: "AI & Robotics", Icon: Bot, desc: "Machine learning & automation" },
  { id: "Healthcare", Icon: Heart, desc: "Biotech, pharma & medical devices" },
  { id: "Media & Communications", Icon: Tv, desc: "Streaming, social media & telecoms" },
] as const;

type Section = "universes" | "funds";

// The clickable card every level of the page uses (universe tiles, the companies in
// a universe), lifting on hover as the platform's other clickable cards do.
const CARD_BUTTON =
  "as-card group text-left transition-shadow hover:shadow-float focus-visible:shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-50";

// The back link the stock page and the fund page use.
const BACK_LINK =
  "inline-flex items-center gap-2 text-sm font-semibold text-brand-muted-fg transition-colors hover:text-brand-fg";

// Pill for companies the asset-discovery agent added in the last week: the lime
// accent chip, which marks the same thing on the dashboard's discovered pick.
function NewBadge() {
  return (
    <span className="chip chip-accent shrink-0">
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      New
    </span>
  );
}

// The platform's tab bar, as on the stock page: full size, and on a phone an even
// grid across the width.
function Tabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="as-tabs grid w-full grid-cols-2 rounded-[20px] sm:inline-flex sm:w-auto sm:self-start sm:rounded-full"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className="as-tab"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function WhaleWatchingPage() {
  const { byUniverse, all, isLoading, error } = useUniverseAssets();
  const [section, setSection] = useState<Section>("universes");
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
  // The exchange beside the universe, looked up the way the stock page does.
  const exchangeName = useListing(ticker ?? undefined, null);

  if (isLoading && all.length === 0) {
    return <WhaleWatchingSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-6 animate-fade-in-up">
      {/* ── Header ──
          The same title card as Stocks, Funds, Compare and Market News: no motif,
          and the caveat (this never changes the rankings) and the lessons live in
          About this page. */}
      <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="band-eyebrow mb-2">Big money</p>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl">
              <Waves className="h-7 w-7 shrink-0 text-brand-accent" />
              Whale Watching
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
              Follow the big money: insider dealings, the institutions and funds
              that own each stock, and what the largest investors are buying.
            </p>
          </div>
          <AboutThisPage page="whales" learnContext="whales" className="shrink-0 self-start" />
        </div>
      </div>

      {/* Tabs and search share a row, so search sits with the content it
          filters rather than competing with the header. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          label="Whale Watching sections"
          value={section}
          onChange={goToSection}
          options={[
            { id: "universes", label: "Universes" },
            { id: "funds", label: "Top Funds" },
          ]}
        />
        <div className="w-full sm:w-auto sm:min-w-[18rem]">
          <CompanySearch
            assets={all}
            onSelect={openCompany}
            disabled={isLoading || all.length === 0}
          />
        </div>
      </div>

      {/* A company panel opens over whichever section you came from, so it is
          reachable from search and the universe grid alike. */}
      {ticker ? (
        <div className="space-y-6">
          <button type="button" onClick={closeCompany} className={BACK_LINK}>
            <ArrowLeft className="w-4 h-4" />
            {universe && section === "universes"
              ? `Back to ${universe}`
              : "Back"}
          </button>

          {/* The stock page's header, so a company reads the same way in both
              places: the ticker, its name in an outline chip, the universe, and
              the same cached one-line description. */}
          <header className="as-card p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-forest-900">
                {ticker}
              </h2>
              {selected?.name && (
                <span className="chip chip-line max-w-full truncate">{selected.name}</span>
              )}
              {selected?.isNew && <NewBadge />}
            </div>
            <ListingLine universe={selected?.universe} exchange={exchangeName} className="mt-2" />
            {selected?.description && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted-fg">
                {selected.description}
              </p>
            )}
          </header>

          {/* The stock page's tab names and tab bar. */}
          <Tabs
            label="Company research"
            value={tickerTab}
            onChange={setTickerTab}
            options={[
              { id: "insiders", label: "Insider Trading" },
              { id: "institutions", label: "Big Investors" },
            ]}
          />

          {tickerTab === "insiders" ? (
            <WhaleWatching
              ticker={ticker}
              showTradeDate
              showSummary
            />
          ) : (
            <InstitutionalOwners ticker={ticker} showSummary />
          )}
        </div>
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
        /* Companies within a universe: the tiles' card, with the same chevron. */
        <div className="space-y-6">
          <button type="button" onClick={() => setUniverse(null)} className={BACK_LINK}>
            <ArrowLeft className="w-4 h-4" /> All universes
          </button>
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-forest-900">{universe}</h2>
            <p className="text-sm text-brand-muted-fg mt-1">
              Pick a company to see its insider dealings and institutional
              owners.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assetsFor(universe).map((a) => (
              <button
                key={a.ticker}
                type="button"
                onClick={() => openCompany(a.ticker, a.universe)}
                className={`${CARD_BUTTON} flex flex-col gap-2 p-5`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="text-lg font-bold text-forest-900">{a.ticker}</span>
                      {a.isNew && <NewBadge />}
                    </p>
                    <p className="truncate text-xs text-brand-muted-fg">{a.name}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-brand-muted-fg transition-colors group-hover:text-forest-900" />
                </div>
                {a.description && (
                  <p className="line-clamp-3 text-sm leading-relaxed text-brand-muted-fg">
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
                  // A row on a phone (icon, text, chevron), a card from sm. As
                  // one-column cards each tile was about 170px tall for a name
                  // and a line of copy, and the six filled two screens.
                  <button
                    key={id}
                    type="button"
                    onClick={() => setUniverse(id)}
                    disabled={isLoading || assets.length === 0}
                    className={`${CARD_BUTTON} flex items-center gap-4 p-4 sm:block sm:p-5`}
                  >
                    <div className="flex shrink-0 items-start justify-between sm:mb-4">
                      {/* Solid forest tile with the icon knocked out in the page
                          background, the weight the dashboard gives its primary
                          actions. */}
                      <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-forest-800">
                        <Icon className="h-5 w-5 text-brand-bg" />
                      </div>
                      <ChevronRight className="hidden h-4 w-4 text-brand-muted-fg transition-colors group-hover:text-forest-900 sm:block" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-forest-900">{id}</p>
                      <p className="mt-0.5 text-xs text-brand-muted-fg">{desc}</p>
                      <p className="mt-2 flex items-center gap-2 text-xs font-bold text-forest-700 sm:mt-3">
                        {isLoading
                          ? "Loading…"
                          : `${assets.length} ${assets.length === 1 ? "company" : "companies"}`}
                        {newCount > 0 && <NewBadge />}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-brand-muted-fg transition-colors group-hover:text-forest-900 sm:hidden" />
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
