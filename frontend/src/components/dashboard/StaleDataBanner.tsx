import { RefreshCw } from "lucide-react";
import { describeRunAge } from "../../utils/staleness";

interface StaleDataBannerProps {
  /** ISO timestamp of the latest (stale) run. */
  latestRunCreatedAt: string;
  /** Whether the self-healing refresh is currently running. */
  isRefreshing: boolean;
}

/**
 * Shown when a returning user's data predates the last nightly run. The
 * accompanying auto-refresh swaps in fresh data; this banner explains why the
 * numbers are about to change.
 */
export default function StaleDataBanner({
  latestRunCreatedAt,
  isRefreshing,
}: StaleDataBannerProps) {
  return (
    <div className="bg-brand-bg/60 backdrop-blur-xl border border-brand-border/50 border-l-4 border-l-accent rounded-lg p-4 flex items-center gap-3">
      <RefreshCw
        className={`w-4 h-4 text-brand-primary shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
      />
      <p className="text-xs text-brand-muted-fg leading-relaxed">
        {isRefreshing ? (
          <>
            Your insights are from {describeRunAge(latestRunCreatedAt)} —
            refreshing with the latest market data…
          </>
        ) : (
          <>
            Your insights are from {describeRunAge(latestRunCreatedAt)} and may be
            out of date.
          </>
        )}
      </p>
    </div>
  );
}
