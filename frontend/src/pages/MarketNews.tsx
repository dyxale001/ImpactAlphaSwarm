import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Info, Newspaper } from "lucide-react";
import { getMacroNews, type MacroFeed } from "../services/api/macroNews";
import MacroArticleCard, { TagChip } from "../components/macroNews/MacroArticleCard";
import FundsNotice from "../components/funds/FundsNotice";
import { filterByTag, groupByDay, tagCounts } from "../utils/macroNews";

// World and market news, three updates a day, each story with the model's
// probability that it is relevant to every investment universe (D-223).
//
// The page lists only stories tagged to at least one universe or as market-wide;
// everything else sits in a collapsed section underneath, numbers and all, so
// nothing is hidden, only ordered. Relevance only: no story is called good or bad
// for anything, and none of it feeds the rankings.

function HowToRead({ threshold }: { threshold: number }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(threshold * 100);
  return (
    <section className="soft-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-[13px] font-bold text-brand-primary">
          <Info className="h-4 w-4 shrink-0 text-forest-500" aria-hidden />
          How to read this page
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-brand-muted-fg transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-brand-secondary">
          <p>
            Each story is read by a decision model, Jev from TypeSafe AI. It answers one yes-or-no
            question per investment universe, such as "Does this news directly concern healthcare
            companies?", and gives the probability that the answer is yes. A separate question asks
            whether the story affects markets broadly, such as interest rates, inflation, trade or oil.
          </p>
          <p>
            The bars show every one of those probabilities, including the low ones. A story is tagged
            with a universe when its probability reaches {pct}%, marked by the thin line on each bar.
            One story can carry several tags, or none.
          </p>
          <p>
            These numbers say how relevant a story is, not whether it is good or bad news. The model
            only sees the headline and the publisher's short summary, so it can be wrong; the link to
            the full story is always there. Nothing on this page changes AlphaSwarm's rankings or
            signals.
          </p>
        </div>
      )}
    </section>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="soft-card h-64 animate-pulse p-5">
          <div className="h-3 w-24 rounded bg-brand-border/50" />
          <div className="mt-4 h-4 w-3/4 rounded bg-brand-border/50" />
          <div className="mt-6 flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="h-1.5 rounded-full bg-brand-border/40" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MarketNewsPage() {
  const [feed, setFeed] = useState<MacroFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
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
  const days = useMemo(
    () => (feed ? groupByDay(filterByTag(feed.tagged, filter)) : []),
    [feed, filter],
  );
  const otherDays = useMemo(() => (feed ? groupByDay(feed.other) : []), [feed]);

  const filters = feed ? [feed.market_wide_label, ...feed.universes] : [];
  const updated = feed?.updated_at
    ? new Date(feed.updated_at).toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const cardProps = feed
    ? { universes: feed.universes, marketWideLabel: feed.market_wide_label, threshold: feed.threshold }
    : null;

  return (
    <div className="animate-fade-up mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      {/* ── Header ── */}
      <div className="hero-card overflow-hidden px-5 pb-8 pt-8 sm:px-7">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">
          Current affairs
        </span>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-brand-bg lg:text-3xl">
          <Newspaper className="h-7 w-7 shrink-0 text-brand-accent" />
          Market News
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
          World and market news from Reuters, CNBC and Bloomberg, updated three times a day. Each story
          shows how likely it is to be relevant to each investment universe.
        </p>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-brand-bg/60">
          Relevance, not direction: nothing here says whether news is good or bad, and these stories do
          not affect AlphaSwarm's rankings.
          {updated && <> Last updated {updated}.</>}
        </p>
      </div>

      <div className="mt-6">
        <HowToRead threshold={feed?.threshold ?? 0.6} />
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
        <>
          {/* ── Filters ── */}
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by universe">
            <button
              type="button"
              onClick={() => setFilter(null)}
              aria-pressed={filter === null}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                filter === null
                  ? "border-brand-primary bg-brand-primary text-brand-bg"
                  : "border-brand-border bg-brand-surface text-brand-primary hover:border-brand-primary/40"
              }`}
            >
              All · {feed.tagged.length}
            </button>
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(filter === f ? null : f)}
                aria-pressed={filter === f}
                className={`rounded-full border text-xs transition-colors ${
                  filter === f ? "border-brand-primary ring-1 ring-brand-primary" : "border-transparent"
                }`}
              >
                <TagChip label={f} count={counts[f] ?? 0} marketWide={f === feed.market_wide_label} />
              </button>
            ))}
          </div>

          {/* ── Tagged stories ── */}
          {days.length === 0 ? (
            <div className="mt-6">
              <FundsNotice
                icon={Newspaper}
                title={filter ? `No ${filter} news in the last ${feed.days} days` : "No tagged news yet"}
                body={
                  filter
                    ? "Nothing in this period was tagged to this universe. Market-wide news, which touches every universe, is under its own filter."
                    : "Stories appear here once they have been read and tagged. The next update is within a few hours."
                }
              />
            </div>
          ) : (
            days.map((day) => (
              <section key={day.key} className="mt-8 flex flex-col gap-3">
                <h2 className="text-sm font-bold text-brand-primary">{day.label}</h2>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {day.articles.map((a) => (
                    <MacroArticleCard key={a.id} article={a} {...cardProps} />
                  ))}
                </div>
              </section>
            ))
          )}

          {/* ── Everything else ── */}
          {feed.other.length > 0 && (
            <section className="mt-10">
              <button
                type="button"
                onClick={() => setShowOther((s) => !s)}
                aria-expanded={showOther}
                className="flex items-center gap-2 text-xs font-semibold text-brand-secondary hover:text-brand-primary"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showOther ? "rotate-180" : ""}`} aria-hidden />
                {feed.other.length} other {feed.other.length === 1 ? "story wasn't" : "stories weren't"} tagged to
                any universe
              </button>
              {showOther &&
                otherDays.map((day) => (
                  <div key={day.key} className="mt-4 flex flex-col gap-3">
                    <h3 className="text-xs font-bold text-brand-muted-fg">{day.label}</h3>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {day.articles.map((a) => (
                        <MacroArticleCard key={a.id} article={a} {...cardProps} />
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
