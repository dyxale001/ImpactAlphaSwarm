import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Newspaper } from "lucide-react";
import { getMacroNews, type MacroFeed } from "../services/api/macroNews";
import MacroArticleCard, { sectorDot } from "../components/macroNews/MacroArticleCard";
import SectorSummary from "../components/macroNews/SectorSummary";
import AboutMarketNews from "../components/macroNews/AboutMarketNews";
import FundsNotice from "../components/funds/FundsNotice";
import { filterByTag, groupByDay, storiesFor, tagCounts, userSectors } from "../utils/macroNews";
import { useAuthStore } from "../store/authStore";

// World and market news, three updates a day, each story with the model's
// probability that it is relevant to every investment universe (D-223).
//
// Two tabs. Sectors is the summary: what each of the reader's sectors' week adds up
// to (an AI overview and its three most relevant stories) and the same for
// market-wide news, defaulting to the sectors chosen at onboarding (D-127) with a
// switch to all of them. All stories is the evidence: every tagged story with every
// score, and a subtab for the stories that were not tagged, numbers and all, so
// nothing is hidden, only ordered. Relevance only: no story is called good or bad
// for anything, and none of it feeds the rankings.

// A sector filter: the platform's filter chip with the sector's dot and its count,
// as on the conservative design. Market-wide is grey, outside the sector palette.
function FilterPill({
  label,
  count,
  active,
  marketWide,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  marketWide: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="as-fchip">
      <span className={`h-2 w-2 shrink-0 rounded-full ${sectorDot(label, marketWide)}`} aria-hidden />
      {label}
      <span className="tabular-nums text-brand-muted-fg">{count}</span>
    </button>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="as-card h-56 animate-pulse p-5">
          <div className="h-3 w-24 rounded-full bg-brand-border/50" />
          <div className="mt-4 h-4 w-3/4 rounded-full bg-brand-border/50" />
          <div className="mt-2 h-4 w-1/2 rounded-full bg-brand-border/50" />
          <div className="mt-8 grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-7 rounded-xl bg-brand-border/40" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function storyCount(n: number): string {
  return `${n} ${n === 1 ? "story" : "stories"}`;
}

type PageTab = "sectors" | "stories";
type StoriesView = "tagged" | "other";

// The platform's tab bar, as on the stock page and Compare: full size, and on a phone
// an even grid across the width.
function PageTabs({ value, onChange }: { value: PageTab; onChange: (tab: PageTab) => void }) {
  const tabs: { key: PageTab; label: string }[] = [
    { key: "sectors", label: "Sectors" },
    { key: "stories", label: "All stories" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Market news sections"
      className="as-tabs grid w-full grid-cols-2 rounded-[20px] sm:inline-flex sm:w-auto sm:self-start sm:rounded-full"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`tab-${tab.key}`}
          aria-selected={value === tab.key}
          aria-controls={`panel-${tab.key}`}
          onClick={() => onChange(tab.key)}
          className="as-tab"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// The small tray for choices inside a tab (which sectors, tagged or not), one level
// down from the page tabs, so the two levels never look like the same control.
function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
  asTabs = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** A subtab (role tab, aria-selected) rather than a filter (aria-pressed). */
  asTabs?: boolean;
}) {
  return (
    <div className="as-tabs as-tabs-sm self-start" role={asTabs ? "tablist" : "group"} aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          {...(asTabs ? { role: "tab", "aria-selected": value === opt.value } : { "aria-pressed": value === opt.value })}
          className="as-tab"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function MarketNewsPage() {
  const [feed, setFeed] = useState<MacroFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  // ?filter=Finance arrives from a stock's Market news tab. Read once, like ?tab=.
  const [filter, setFilter] = useState<string | null>(() => searchParams.get("filter"));
  const [sectorScope, setSectorScope] = useState<"mine" | "all">("mine");
  // Opens on ?tab=stories (and ?view=other) when asked, like the stock page's ?tab=.
  // Read once on mount; switching afterwards is local state.
  const [tab, setTab] = useState<PageTab>(() => (searchParams.get("tab") === "stories" ? "stories" : "sectors"));
  const [view, setView] = useState<StoriesView>(() => (searchParams.get("view") === "other" ? "other" : "tagged"));
  const tabsRef = useRef<HTMLDivElement>(null);
  const chosen = useAuthStore((s) => s.analysis?.investment_universe);

  useEffect(() => {
    let cancelled = false;
    getMacroNews()
      .then((f) => !cancelled && setFeed(f))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => (feed ? tagCounts(feed.tagged) : {}), [feed]);
  const days = useMemo(() => (feed ? groupByDay(filterByTag(feed.tagged, filter)) : []), [feed, filter]);
  const otherDays = useMemo(() => (feed ? groupByDay(feed.other) : []), [feed]);

  const mw = feed?.market_wide_label ?? "Market-wide";
  const filters = feed ? [mw, ...feed.universes] : [];
  // A single universe's own news is often thin; market-wide news touches it too.
  const pointToMarketWide = feed !== null && filter !== null && filter !== mw && (counts[mw] ?? 0) > 0;
  const updated = feed?.updated_at
    ? new Date(feed.updated_at).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  const cardProps = feed ? { universes: feed.universes, marketWideLabel: mw } : null;

  // The reader's own sectors first; every sector when they chose none or asked for all.
  const mine = feed ? userSectors(chosen, feed.universes) : [];
  const showAll = sectorScope === "all" || mine.length === 0;
  const sectors = feed ? (showAll ? feed.universes : mine) : [];

  // From a sector card to its full list: the All stories tab, filtered.
  const seeAll = (group: string) => {
    setTab("stories");
    setView("tagged");
    setFilter(group);
    tabsRef.current?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="animate-fade-up mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      {/* ── Header ──
          The same title card as Stocks, Funds and Compare: no motif, and the
          relevance caveat lives in About this page with the lessons. */}
      <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="band-eyebrow mb-2">Current affairs</p>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl">
              <Newspaper className="h-7 w-7 shrink-0 text-brand-accent" />
              Market News
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
              World and market news from Reuters, CNBC and Bloomberg, updated three times a day. Each story shows
              how likely it is to be relevant to each investment universe.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
            {updated && (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-semibold text-brand-bg">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" aria-hidden />
                Updated {updated}
              </span>
            )}
            <AboutMarketNews threshold={feed?.threshold ?? 0.6} learnContext="news" />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6">
          <FundsNotice icon={AlertTriangle} tone="warning" title="Market news isn't available right now" body={error} />
        </div>
      )}

      {!feed && !error && (
        <div className="mt-6">
          <FeedSkeleton />
        </div>
      )}

      {feed && cardProps && (
        <div className="mt-6 flex flex-col gap-6">
          <div ref={tabsRef} className="flex scroll-mt-20 flex-col lg:scroll-mt-6">
            <PageTabs value={tab} onChange={setTab} />
          </div>

          {/* ── Sectors: the summary ── */}
          {tab === "sectors" && (
            <div role="tabpanel" id="panel-sectors" aria-labelledby="tab-sectors" className="animate-fade-up flex flex-col gap-8">
              <section className="flex flex-col gap-4" aria-labelledby="sectors-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="sectors-heading" className="text-lg font-bold tracking-[-0.015em] text-forest-900">
                    {showAll ? "Sectors this week" : "Your sectors this week"}
                  </h2>
                  {mine.length > 0 && mine.length < feed.universes.length && (
                    <Toggle
                      label="Which sectors"
                      value={sectorScope}
                      onChange={setSectorScope}
                      options={[
                        { value: "mine", label: `Your sectors · ${mine.length}` },
                        { value: "all", label: "All sectors" },
                      ]}
                    />
                  )}
                </div>
                <div key={sectorScope} className="animate-fade-up grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {sectors.map((group) => (
                    <SectorSummary
                      key={group}
                      group={group}
                      stories={storiesFor(feed.tagged, group, mw)}
                      overview={feed.overviews?.[group]}
                      marketWideLabel={mw}
                      onSeeAll={() => seeAll(group)}
                    />
                  ))}
                  {/* News that touches every sector, whichever ones the reader chose, as
                      the grid's last card: it fills the gap an odd number of sectors
                      leaves, and spans both columns when it would sit alone. */}
                  <SectorSummary
                    group={mw}
                    stories={storiesFor(feed.tagged, mw, mw)}
                    overview={feed.overviews?.[mw]}
                    marketWideLabel={mw}
                    onSeeAll={() => seeAll(mw)}
                    className={sectors.length % 2 === 0 ? "lg:col-span-2" : ""}
                  />
                </div>
              </section>
            </div>
          )}

          {/* ── All stories: the evidence ── */}
          {tab === "stories" && (
            <div role="tabpanel" id="panel-stories" aria-labelledby="tab-stories" className="animate-fade-up flex flex-col gap-4">
              <Toggle
                asTabs
                label="Tagged or untagged stories"
                value={view}
                onChange={setView}
                options={[
                  { value: "tagged", label: `Tagged · ${feed.tagged.length}` },
                  { value: "other", label: `Untagged · ${feed.other.length}` },
                ]}
              />

              {view === "tagged" && (
                <div key="tagged" className="animate-fade-up">
                  <p className="text-sm text-brand-muted-fg">
                    Every story from the last {feed.days} days tagged to a sector or as market-wide, with all of its
                    scores.
                  </p>

                  {/* Filters wrap on a phone too, so none sits past the edge. */}
                  <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by universe">
                    <button
                      type="button"
                      onClick={() => setFilter(null)}
                      aria-pressed={filter === null}
                      className="as-fchip"
                    >
                      All
                      <span className="tabular-nums text-brand-muted-fg">{feed.tagged.length}</span>
                    </button>
                    {filters.map((f) => (
                      <FilterPill
                        key={f}
                        label={f}
                        count={counts[f] ?? 0}
                        active={filter === f}
                        marketWide={f === mw}
                        onClick={() => setFilter(filter === f ? null : f)}
                      />
                    ))}
                  </div>

                  {/* Keyed on the filter so a change fades in. */}
                  <div key={filter ?? "all"} className="animate-fade-up">
                    {days.length === 0 ? (
                      <div className="mt-6">
                        <FundsNotice
                          icon={Newspaper}
                          title={filter ? `No ${filter} news in the last ${feed.days} days` : "No tagged news yet"}
                          body={
                            filter
                              ? "Nothing in this period was tagged to this universe."
                              : "Stories appear here once they have been read and tagged. The next update is within a few hours."
                          }
                          actionLabel={pointToMarketWide ? `See ${storyCount(counts[mw] ?? 0)} of market-wide news` : undefined}
                          onAction={pointToMarketWide ? () => setFilter(mw) : undefined}
                        />
                      </div>
                    ) : (
                      days.map((day) => (
                        <section key={day.key} className="mt-8 flex flex-col gap-4">
                          <h2 className="flex items-baseline gap-2 text-base font-bold tracking-[-0.01em] text-forest-900">
                            {day.label}
                            <span className="text-xs font-medium text-brand-muted-fg">{storyCount(day.articles.length)}</span>
                          </h2>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {day.articles.map((a) => (
                              <MacroArticleCard key={a.id} article={a} {...cardProps} />
                            ))}
                          </div>
                        </section>
                      ))
                    )}

                    {days.length > 0 && pointToMarketWide && (
                      <button
                        type="button"
                        onClick={() => setFilter(mw)}
                        className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                      >
                        Market-wide news touches every universe too: {storyCount(counts[mw] ?? 0)}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {view === "other" && (
                <div key="other" className="animate-fade-up">
                  <p className="max-w-3xl text-sm leading-relaxed text-brand-muted-fg">
                    Stories from the last {feed.days} days that weren't tagged to any sector or as market-wide, usually
                    crime, courts, lifestyle or one-off events. Their scores are shown so you can see why.
                  </p>
                  {otherDays.length === 0 ? (
                    <div className="mt-6">
                      <FundsNotice
                        icon={Newspaper}
                        title="No untagged stories"
                        body="Every story in this period was tagged to a sector or as market-wide."
                      />
                    </div>
                  ) : (
                    otherDays.map((day) => (
                      <section key={day.key} className="mt-8 flex flex-col gap-4">
                        <h2 className="flex items-baseline gap-2 text-base font-bold tracking-[-0.01em] text-forest-900">
                          {day.label}
                          <span className="text-xs font-medium text-brand-muted-fg">{storyCount(day.articles.length)}</span>
                        </h2>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {day.articles.map((a) => (
                            <MacroArticleCard key={a.id} article={a} {...cardProps} />
                          ))}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
