import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, Loader2, RotateCcw } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { parseLayout } from "../dashboard/layoutSchema";
import { WIDGET_SPEC, widgetById } from "../dashboard/widgetRegistry";
import { clearDashboardLayout } from "../services/supabase/dashboardLayoutService";

/**
 * What the dashboard currently looks like, and a way back to a blank slate.
 *
 * The escape hatch for someone who has removed every widget and cannot find
 * their way back: clearing the layout to null is what puts the setup manual in
 * front of them again, the same screen a brand new user sees.
 *
 * Reads the layout out of the auth store rather than through useDashboardLayout.
 * That hook owns edit state, debounced writes and drag bookkeeping, none of
 * which mean anything on a settings page.
 */
export default function DashboardPreferencesSection() {
  const { profile, analysis, fetchProfile } = useAuthStore();
  const [isResetting, setIsResetting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const layout = useMemo(
    () => parseLayout(analysis?.dashboard_layout, WIDGET_SPEC),
    [analysis?.dashboard_layout],
  );

  const handleReset = async () => {
    if (!profile?.id) return;
    setIsResetting(true);
    setError(null);
    setDone(null);
    try {
      await clearDashboardLayout(profile.id);
      await fetchProfile(profile.id);
      setConfirming(false);
      setDone("Your dashboard has been reset. Open it to build a new one.");
    } catch (e) {
      console.error("Failed to reset dashboard:", e);
      setError("We could not reset your dashboard. Please try again.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-brand-fg">Dashboard</h2>
        <p className="mt-0.5 text-xs text-brand-muted-fg">
          How your dashboard is laid out. Rearranging is done on the dashboard
          itself.
        </p>
      </div>

      <div className="glass-card space-y-4 p-4 sm:p-6">
        {layout === null ? (
          <div className="flex items-start gap-3">
            <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted-fg" />
            <p className="text-sm text-brand-muted-fg">
              You have not set a dashboard up yet.{" "}
              <Link
                to="/dashboard"
                className="font-semibold text-brand-primary hover:underline"
              >
                Build it now
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-brand-primary/10 text-brand-primary">
                <LayoutGrid className="h-2.5 w-2.5" />
                Your layout
              </span>
              <span className="chip">
                {layout.widgets.length} widget
                {layout.widgets.length === 1 ? "" : "s"}
              </span>
            </div>

            {layout.widgets.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {layout.widgets.map((w) => {
                  const def = widgetById(w.id);
                  return def ? (
                    <span
                      key={w.id}
                      className="rounded-full border border-brand-border/60 px-2 py-0.5 text-[11px] text-brand-muted-fg"
                    >
                      {def.title}
                    </span>
                  ) : null;
                })}
              </div>
            ) : (
              <p className="text-sm text-brand-muted-fg">
                Your dashboard is empty.
              </p>
            )}

            <Link
              to="/dashboard"
              className="inline-block text-xs font-semibold text-brand-primary hover:underline"
            >
              Open the dashboard to rearrange it →
            </Link>
          </>
        )}

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-semantic-danger/20 bg-semantic-danger/10 p-4 text-sm text-semantic-danger"
          >
            {error}
          </div>
        ) : null}
        {done ? (
          <div
            role="status"
            className="rounded-lg border border-semantic-success/20 bg-semantic-success/10 p-4 text-sm text-semantic-success"
          >
            {done}
          </div>
        ) : null}

        {layout !== null ? (
          <div className="border-t border-brand-border/40 pt-4">
            {confirming ? (
              <div className="space-y-3">
                <p className="text-sm text-brand-fg">
                  This clears your layout and takes you back to a blank
                  dashboard with the setup guide. Your watchlist, holdings and
                  learning progress are not affected.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void handleReset()}
                    disabled={isResetting}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-semantic-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {isResetting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Resetting
                      </>
                    ) : (
                      "Yes, reset my dashboard"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={isResetting}
                    className="flex-1 rounded-full border border-brand-border bg-brand-surface px-4 py-2 text-sm transition-colors hover:bg-brand-border/30 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirming(true);
                  setDone(null);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-4 py-2 text-sm transition-colors hover:bg-brand-border/30"
              >
                <RotateCcw className="h-4 w-4" />
                Reset my dashboard
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
