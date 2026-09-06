import { useEffect, useState } from "react";
import { BookOpen, Pencil, Pin, RefreshCw } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import { useSignals } from "../../../dashboard/DashboardDataContext";
import { useAnalysisRefresh } from "../../../hooks/useAnalysisRefresh";
import { useSentimentLastUpdated } from "../../../hooks/useSentimentLastUpdated";
import { getUsdZarExchangeRate } from "../../../services/api/analysis";
import { MarketClock } from "../../research/MarketClock";
import DashboardGridMotif from "./DashboardGridMotif";

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
  pinnedTicker,
  onCustomise,
  onOpenGuide,
  isEditing,
}: {
  widgetCount: number;
  pinnedTicker: string | null;
  onCustomise: () => void;
  /** Reopens the setup manual. Null while it is already on screen, which is
   *  what keeps the banner from offering to show something already shown. */
  onOpenGuide: (() => void) | null;
  isEditing: boolean;
}) {
  const { profile } = useAuthStore();

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
      <DashboardGridMotif className="h-full" />

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
          <h1 className="flex items-center gap-3 text-2xl font-bold text-brand-bg lg:text-3xl">
            {greeting()}
            {profile?.first_name ? `, ${profile.first_name}` : ""}
          </h1>
          {/* Market and FX footing for every price this dashboard shows,
              exactly the pill Assets.tsx anchors under its own subtitle. */}
          {!isEditing ? (
            <div className="-ml-1 mt-2 flex flex-wrap items-center gap-2">
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

              {pinnedTicker ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-brand-bg/80">
                  <Pin className="h-3 w-3 text-brand-accent" />
                  Pinned to{" "}
                  <span className="font-mono font-semibold text-brand-bg">
                    {pinnedTicker}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Description, the Customise entry point and the way back to the
              manual share one line, divided by hairlines: three short facts
              read left to right rather than a sentence with a button
              somewhere else on the card and a link somewhere else again. */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm leading-relaxed text-brand-bg/75">
            <span className="max-w-2xl">{description}</span>

            {!isEditing ? (
              <>
                <span
                  className="hidden h-4 w-px bg-white/15 sm:block"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={onCustomise}
                  className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                >
                  <Pencil className="h-3 w-3" />
                  Customise
                </button>

                {onOpenGuide ? (
                  <>
                    <span
                      className="hidden h-4 w-px bg-white/15 sm:block"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={onOpenGuide}
                      className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-accent transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                    >
                      <BookOpen className="h-3 w-3" />
                      How to set this up
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
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
