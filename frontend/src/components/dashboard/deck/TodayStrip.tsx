import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, LogOut, Pencil, RefreshCw, Terminal } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../lib/supabase";
import { useSignals } from "../../../dashboard/DashboardDataContext";
import { useAnalysisRefresh } from "../../../hooks/useAnalysisRefresh";
import { useSentimentLastUpdated } from "../../../hooks/useSentimentLastUpdated";
import { getUsdZarExchangeRate } from "../../../services/api/analysis";
import { MarketClock } from "../../research/MarketClock";
import RallyMotif from "./RallyMotif";

function greeting(hour: number = new Date().getHours()): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The dashboard's fixed header band.
 *
 * Deliberately not a widget. Who you are, what the dashboard is currently
 * pointed at, and the way into editing it are the page's own chrome; making them
 * removable would let someone strip out the only route back to the customise
 * controls and strand themselves on an empty page.
 *
 * The two freshness pills below the title are the same facts every price and
 * every AI-derived number on this page depends on: what the rand is worth
 * against the dollar, whether the exchange behind these prices is even open,
 * and how old the analysis and sentiment reads are. Assets.tsx has always put
 * exactly this at the top of its own hero for the same reason — it is footing
 * for the page, not a widget someone should be able to remove and leave the
 * rest of the numbers unexplained.
 */
export default function TodayStrip({
  widgetCount,
  onCustomise,
  onOpenGuide,
  isEditing,
}: {
  widgetCount: number;
  onCustomise: () => void;
  /** Reopens the setup manual. Null while it is already on screen, which is
   *  what keeps the banner from offering to show something already shown. */
  onOpenGuide: (() => void) | null;
  isEditing: boolean;
}) {
  const { profile, setSession } = useAuthStore();
  const navigate = useNavigate();

  /**
   * Clear the Supabase session as well as the local store.
   *
   * setSession(null) alone only empties this tab's state: the token stays in
   * storage and the next load signs straight back in. The admin pages already
   * pair the two, and this follows them. The swallow is deliberate — a failed
   * network call must not strand someone on a page they asked to leave, and
   * the local session is cleared either way.
   */
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* leaving anyway */
    }
    setSession(null);
    navigate("/", { replace: true });
  };

  const description = isEditing
    ? "Drag a widget to move it, or use the arrows. The letter button changes how wide it is."
    : widgetCount === 0
      ? "Nothing here yet. Everything on this page is something you put there."
      : `${widgetCount} widget${widgetCount === 1 ? "" : "s"}, arranged your way`;

  const { latestRunCreatedAt, isRunInProgress, refreshRecommendations } =
    useSignals();
  const { refresh, isRunning } = useAnalysisRefresh();
  const { updatedAt: sentimentUpdatedAt, isLoading: isSentimentUpdatedLoading } =
    useSentimentLastUpdated();

  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [exchangeRateSource, setExchangeRateSource] = useState("Yahoo Finance");

  useEffect(() => {
    let cancelled = false;
    getUsdZarExchangeRate()
      .then((res) => {
        if (cancelled) return;
        setExchangeRate(res.rate);
        setExchangeRateSource(res.source);
      })
      .catch((e) => {
        console.error("Failed to load USD/ZAR exchange rate:", e);
        if (!cancelled) setExchangeRate(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // useAnalysisRefresh refetches the profile, but the dashboard's own ranked
  // feed is keyed off profile.id, which does not change across a run. Re-read
  // it explicitly afterwards, the same pairing RunStatusWidget uses.
  const runAnalysis = async () => {
    await refresh();
    await refreshRecommendations();
  };

  const busy = isRunning || isRunInProgress;

  return (
    <div className="hero-card overflow-hidden px-5 py-6 sm:px-7">
      <RallyMotif className="h-full" />

      {/* Same proportions as the Assets hero: a title column that owns the FX
          pill directly beneath its own subtitle, and a right-hand column,
          vertically centred against it on wide screens, that owns the run's
          own freshness. Two facts about two different things, so they stay two
          pills rather than one row trying to say both. */}
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-brand-accent">
            Your dashboard
          </p>
          {/* Accent icon then the title, the lockup every other hub header
              uses: CandlestickChart on Assets, Waves on Whale Watching, Eye on
              Watchlist. This one takes the product's own >_ mark rather than a
              page glyph — the dashboard is the app's front door, and the title
              beside it is a greeting rather than a section name, so the brand
              is what belongs in the slot. Same mark as the sidebar. */}
          <h1 className="flex items-center gap-3 text-2xl font-bold text-brand-bg lg:text-3xl">
            <Terminal className="h-7 w-7 shrink-0 text-brand-accent" />
            {greeting()}
            {profile?.first_name ? `, ${profile.first_name}` : ""}
          </h1>

          {/* Description sits on its own line directly under the title, the
              same plain paragraph the sibling heroes use, rather than sharing a
              row with the buttons. */}
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
            {description}
          </p>

          {/* Market and FX footing for every price this dashboard shows,
              exactly the pill Assets.tsx anchors under its own subtitle. */}
          {!isEditing ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-brand-bg/70">
                {exchangeRate !== null ? (
                  <>
                    US Stock Exchanges · FX (USD/ZAR) from {exchangeRateSource}:{" "}
                    <span className="font-medium text-brand-bg">
                      1 USD = R{exchangeRate.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="animate-pulse">
                    US Stock Exchanges · Fetching USD/ZAR rate...
                  </span>
                )}
                <span className="text-brand-bg/30" aria-hidden="true">
                  ·
                </span>
                <MarketClock tone="dark" bare />
              </div>
            </div>
          ) : null}

          {/* The two ways into editing, on their own row beneath the footing
              pill so the title block reads straight down: name, what it is,
              what it is built on, what you can do to it. */}
          {!isEditing ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onCustomise}
                className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
              >
                <Pencil className="h-3 w-3" />
                Customise
              </button>

              {onOpenGuide ? (
                <button
                  type="button"
                  onClick={onOpenGuide}
                  className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-accent transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                >
                  <BookOpen className="h-3 w-3" />
                  How to set this up
                </button>
              ) : null}

              {/* Outlined in the hero's own white-on-forest, not the lime that
                  Customise wears: leaving is always available but never the
                  thing being encouraged, and two accent buttons side by side
                  would read as two equal invitations. */}
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-brand-bg/80 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-brand-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>

        {/* Run time and its refresh share one pill: the button acts on the
            timestamp beside it. Sentiment joins it rather than getting a pill
            of its own, matching Assets.tsx exactly — a run can be hours old
            while sentiment was topped up an hour ago, and a reader needs both
            dates to know which answers which. Right-aligned and shrink-shy,
            the same as the single pill on Assets. */}
        {!isEditing ? (
          <div className="flex w-fit max-w-full flex-wrap items-center gap-3 rounded-full border border-white/10 bg-white/5 py-2 pl-5 pr-1.5 lg:shrink-0">
            <div className="grid grid-cols-[auto_auto] gap-y-0.5 text-xs leading-tight text-brand-bg/60">
              <span className="mr-2 border-r border-brand-bg/15 pr-2">
                Last AI run
              </span>
              <span className="font-semibold text-brand-bg">
                {latestRunCreatedAt
                  ? new Date(latestRunCreatedAt).toLocaleString()
                  : "—"}
              </span>
              <span className="mr-2 border-r border-brand-bg/15 pr-2">
                Sentiment updated
              </span>
              <span className="font-semibold text-brand-bg">
                {sentimentUpdatedAt
                  ? new Date(sentimentUpdatedAt).toLocaleString()
                  : isSentimentUpdatedLoading
                    ? "…"
                    : "—"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void runAnalysis()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-accent px-4 py-2 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
              />
              {busy ? "Running…" : "Refresh"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
