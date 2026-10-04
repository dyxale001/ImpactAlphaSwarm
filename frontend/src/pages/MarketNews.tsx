import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, Info, Newspaper } from "lucide-react";
import { getMacroNews, type MacroFeed } from "../services/api/macroNews";
import MacroArticleCard from "../components/macroNews/MacroArticleCard";
import WireMotif from "../components/macroNews/WireMotif";
import { universeIcon } from "../components/macroNews/universeIcons";
import FundsNotice from "../components/funds/FundsNotice";
import { sectorColour } from "../utils/sectorColours";
import { filterByTag, groupByDay, tagCounts } from "../utils/macroNews";

// World and market news, three updates a day, each story with the model's
// probability that it is relevant to every investment universe (D-223).
//
// The page lists only stories tagged to at least one universe or as market-wide;
// everything else sits in a collapsed section underneath, numbers and all, so
// nothing is hidden, only ordered. Relevance only: no story is called good or bad
// for anything, and none of it feeds the rankings.

// Verdant's press and focus states: a small press-in, and the lime focus outline the
// rest of the app uses.
const PRESSABLE =
  "transition-transform duration-[120ms] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent";

function AboutPanel({ threshold }: { threshold: number }) {
  const pct = Math.round(threshold * 100);
  return (
    <section className="soft-card animate-fade-up flex flex-col gap-2 p-5 text-xs leading-relaxed text-brand-secondary [&>p]:max-w-3xl">
      <h2 className="text-[13px] font-bold text-brand-primary">How to read this page</h2>
      <p>
        Each story is read by a decision model, Jev from TypeSafe AI. It answers one yes-or-no question per
        investment universe, such as "Does this news directly concern healthcare companies?", and gives the
        probability that the answer is yes. A separate question asks whether the story affects markets broadly,
        such as interest rates, inflation, trade or oil.
      </p>
      <p>
        Every story shows all seven of those probabilities. A filled box means the story is tagged with that
        universe, which happens at {pct}% or more; the line along the bottom of each box shows how high the score
        is. Scores under 10% are listed on one line underneath. One story can carry several tags, or none.
      </p>
      <p>
        These numbers say how relevant a story is, not whether it is good or bad news. The model only sees the
        headline and the publisher's short summary, so it can be wrong; the link to the full story is always
        there. Nothing on this page changes AlphaSwarm's rankings or signals.
      </p>
    </section>
  );
}

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
  const Icon = universeIcon(label);
  // The icon sits on its sector's tint, the same wash the watchlist and Settings use.
  const tint = marketWide ? "bg-neutral-100" : sectorColour(label).tint;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${PRESSABLE} inline-flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-xs font-semibold shadow-sm ${
        active ? "bg-brand-primary text-brand-bg" : "bg-brand-surface text-brand-primary hover:bg-brand-surface/70"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full ${active ? "bg-white/15" : tint}`}
        aria-hidden
      >
        <Icon className="h-3 w-3" />
      </span>
      {label}
      <span
        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums ${
          active ? "bg-white/15" : "bg-brand-bg text-brand-muted-fg"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="soft-card h-56 animate-pulse p-5">
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

export default function MarketNewsPage() {
  const [feed, setFeed] = useState<MacroFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showOther, setShowOther] = useState(false);

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

  return (
    <div className="animate-fade-up mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      {/* ── Header ── */}
      <div className="hero-card overflow-hidden px-5 pb-10 pt-8 sm:px-7">
        {/* Right-hand artwork, as on the other hub pages; a phone has no free side for it. */}
        <WireMotif className="hidden h-full md:block" />
        <div className="relative">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">
              Current affairs
            </span>
            <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl">
              <Newspaper className="h-7 w-7 shrink-0 text-brand-accent" />
              Market News
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
              World and market news from Reuters, CNBC and Bloomberg, updated three times a day. Each story shows
              how likely it is to be relevant to each investment universe.
            </p>
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-brand-bg/60">
              Relevance, not direction: nothing here says whether news is good or bad, and these stories do not
              affect AlphaSwarm's rankings.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {updated && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-brand-bg">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" aria-hidden />
                Updated {updated}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowAbout((s) => !s)}
              aria-expanded={showAbout}
              className={`${PRESSABLE} inline-flex items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1.5 text-[11px] font-bold text-brand-fg hover:bg-lime-400`}
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
              About this page
            </button>
          </div>
        </div>
      </div>

      {showAbout && (
        <div className="mt-4">
          <AboutPanel threshold={feed?.threshold ?? 0.6} />
        </div>
      )}

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
        <>
          {/* ── Filters: one scrolling row on a phone, wrapping from tablet up ── */}
          <div
            className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Filter by universe"
          >
            <button
              type="button"
              onClick={() => setFilter(null)}
              aria-pressed={filter === null}
              className={`${PRESSABLE} inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${
                filter === null ? "bg-brand-primary text-brand-bg" : "bg-brand-surface text-brand-primary"
              }`}
            >
              All
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums ${
                  filter === null ? "bg-white/15" : "bg-brand-bg text-brand-muted-fg"
                }`}
              >
                {feed.tagged.length}
              </span>
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

          {/* ── Tagged stories, by day. Keyed on the filter so a change fades in. ── */}
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
                <section key={day.key} className="mt-10 flex flex-col gap-4">
                  <h2 className="flex items-baseline gap-2 text-base font-bold tracking-[-0.01em] text-brand-primary">
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
                className={`${PRESSABLE} mt-8 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-forest-500 hover:underline`}
              >
                Market-wide news touches every universe too: {storyCount(counts[mw] ?? 0)}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          {/* ── Everything else ── */}
          {feed.other.length > 0 && (
            <section className="mt-12 border-t border-brand-border/60 pt-6">
              <button
                type="button"
                onClick={() => setShowOther((s) => !s)}
                aria-expanded={showOther}
                className={`${PRESSABLE} flex items-center gap-2 rounded-full text-xs font-semibold text-brand-secondary hover:text-brand-primary`}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showOther ? "rotate-180" : ""}`} aria-hidden />
                {feed.other.length} other {feed.other.length === 1 ? "story wasn't" : "stories weren't"} tagged to any
                universe
              </button>
              {showOther && (
                <div className="animate-fade-up">
                  {otherDays.map((day) => (
                    <div key={day.key} className="mt-6 flex flex-col gap-3">
                      <h3 className="flex items-baseline gap-2 text-sm font-bold text-brand-secondary">
                        {day.label}
                        <span className="text-xs font-medium text-brand-muted-fg">{storyCount(day.articles.length)}</span>
                      </h3>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {day.articles.map((a) => (
                          <MacroArticleCard key={a.id} article={a} {...cardProps} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
