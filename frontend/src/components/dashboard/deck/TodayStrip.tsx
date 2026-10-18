import { useEffect, useState } from "react";
import { BookOpen, Pencil, RefreshCw, Terminal } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import { useSignals } from "../../../dashboard/DashboardDataContext";
import { useAnalysisRefresh } from "../../../hooks/useAnalysisRefresh";
import { useSentimentLastUpdated } from "../../../hooks/useSentimentLastUpdated";
import { getUsdZarExchangeRate } from "../../../services/api/analysis";
import { MarketClock } from "../../research/MarketClock";
import LearnPopover from "../../learning/LearnPopover";

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
 * The footing pill and the two freshness tiles are the same facts every price and
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

  const stamp = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : null;

  // The hub header every page uses, with no motif. Left: the greeting, what the
  // board holds, the rand and market footing every price here rests on, and the
  // two ways into editing. Right: how fresh the run and the sentiment are, as the
  // stat tiles Learning and Settings use, and the book button for this page's
  // lessons, with Refresh in the card's bottom-right corner.
  return (
    <div data-spotlight="dashboard" className="hero-card px-5 py-6 sm:px-8 sm:py-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="band-eyebrow mb-2">Your dashboard</p>
            <LearnPopover context="dashboard" onDark className="shrink-0 lg:hidden" />
          </div>
          {/* The product's own >_ mark rather than a page glyph: the dashboard is
              the app's front door, and its title is a greeting. */}
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl">
            <Terminal className="h-7 w-7 shrink-0 text-brand-accent" />
            {greeting()}
            {profile?.first_name ? `, ${profile.first_name}` : ""}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">{description}</p>

          {!isEditing ? (
            <>
              {/* Market and FX footing for every price on the board. */}
              <div className="mt-3 flex w-full max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-[14px] bg-white/8 px-3.5 py-2 text-xs text-brand-bg/70 sm:w-fit sm:rounded-full">
                {exchangeRate !== null ? (
                  <>
                    US Stock Exchanges · FX (USD/ZAR) from {exchangeRateSource}:{" "}
                    <span className="font-semibold text-brand-bg">1 USD = R{exchangeRate.toFixed(2)}</span>
                  </>
                ) : (
                  <span className="animate-pulse">US Stock Exchanges · Fetching USD/ZAR rate...</span>
                )}
                <span className="text-brand-bg/30" aria-hidden="true">·</span>
                <MarketClock tone="dark" bare />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={onCustomise} className="as-btn as-btn-sm as-btn-lime">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Customise
                </button>
                {onOpenGuide ? (
                  <button type="button" onClick={onOpenGuide} className="as-btn as-btn-sm as-btn-ghost-dark">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    How to set this up
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {!isEditing ? (
          <div className="flex shrink-0 flex-col gap-2 sm:items-end lg:self-stretch lg:justify-between">
            <div className="flex w-full items-start gap-2 sm:w-auto">
              <dl className="grid flex-1 grid-cols-2 gap-2 sm:flex-none">
                <div className="min-w-0 rounded-[14px] bg-white/8 px-3 py-2.5 sm:px-4">
                  <dt className="text-xs text-brand-bg/60">Last AI run</dt>
                  <dd className="text-sm font-bold tabular-nums text-brand-bg sm:text-base">{stamp(latestRunCreatedAt) ?? "—"}</dd>
                </div>
                <div className="min-w-0 rounded-[14px] bg-white/8 px-3 py-2.5 sm:px-4">
                  <dt className="text-xs text-brand-bg/60">Sentiment updated</dt>
                  <dd className="text-sm font-bold tabular-nums text-brand-bg sm:text-base">
                    {stamp(sentimentUpdatedAt) ?? (isSentimentUpdatedLoading ? "…" : "—")}
                  </dd>
                </div>
              </dl>
              <LearnPopover context="dashboard" onDark className="hidden shrink-0 lg:block" />
            </div>
            <button
              type="button"
              onClick={() => void runAnalysis()}
              disabled={busy}
              className="as-btn as-btn-sm as-btn-lime w-full sm:w-auto"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
              {busy ? "Running…" : "Refresh"}
            </button>
          </div>
        ) : (
          <LearnPopover context="dashboard" onDark className="hidden shrink-0 lg:block" />
        )}
      </div>
    </div>
  );
}
