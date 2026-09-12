import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, Loader2, RotateCcw } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { parseLayout } from "../dashboard/layoutSchema";
import { WIDGET_SPEC, widgetById } from "../dashboard/widgetRegistry";
import { clearDashboardLayout } from "../services/supabase/dashboardLayoutService";
import SettingsCard, { CardChip } from "./settings/SettingsCard";
import { DangerButton, SecondaryButton, TextButton } from "./settings/SettingsButtons";
import { DASHBOARD_CARD_LEAD, DASHBOARD_CARD_TITLE } from "../utils/settingsCopy";

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

  const count = layout?.widgets.length ?? 0;

  return (
    <SettingsCard
      id="dashboard"
      title={DASHBOARD_CARD_TITLE}
      lead={DASHBOARD_CARD_LEAD}
      chip={
        layout !== null ? (
          <CardChip>
            <LayoutGrid className="h-2.5 w-2.5" />
            <span className="tabular-nums">
              {count} widget{count === 1 ? "" : "s"}
            </span>
          </CardChip>
        ) : undefined
      }
      error={error}
      success={done}
      consequence={
        layout !== null ? (
          confirming ? (
            <span className="text-brand-fg">
              This clears your layout and takes you back to a blank dashboard with the setup guide.
              Your watchlist, holdings and learning progress are not affected.
            </span>
          ) : (
            <Link to="/dashboard" className="font-semibold text-brand-primary hover:underline">
              Open the dashboard to rearrange it →
            </Link>
          )
        ) : (
          <span />
        )
      }
      actions={
        layout !== null ? (
          confirming ? (
            <>
              <TextButton onClick={() => setConfirming(false)} disabled={isResetting}>
                Cancel
              </TextButton>
              <DangerButton onClick={() => void handleReset()} disabled={isResetting}>
                {isResetting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Resetting
                  </>
                ) : (
                  "Yes, reset my dashboard"
                )}
              </DangerButton>
            </>
          ) : (
            <SecondaryButton
              onClick={() => {
                setConfirming(true);
                setDone(null);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reset my dashboard
            </SecondaryButton>
          )
        ) : undefined
      }
    >
      {layout === null ? (
        <div className="flex items-start gap-3">
          <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted-fg" />
          <p className="text-sm text-brand-muted-fg">
            You have not set a dashboard up yet.{" "}
            <Link to="/dashboard" className="font-semibold text-brand-primary hover:underline">
              Build it now
            </Link>
            .
          </p>
        </div>
      ) : count > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {layout.widgets.map((w) => {
            const def = widgetById(w.id);
            const ticker =
              def?.needsTicker && typeof w.settings?.ticker === "string"
                ? w.settings.ticker
                : null;
            return def ? (
              <span
                key={w.instanceId}
                className="rounded-full border border-brand-border/60 px-2 py-0.5 text-[11px] text-brand-muted-fg"
              >
                {def.title}
                {ticker ? ` · ${ticker}` : ""}
              </span>
            ) : null;
          })}
        </div>
      ) : (
        <p className="text-sm text-brand-muted-fg">Your dashboard is empty.</p>
      )}
    </SettingsCard>
  );
}
