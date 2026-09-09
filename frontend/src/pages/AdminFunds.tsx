import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Landmark, RotateCcw } from "lucide-react";
import AddFundForm from "../components/admin/AddFundForm";
import AdminTabs from "../components/admin/AdminTabs";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import {
  listAdminFunds,
  updateAdminFund,
  type AdminFund,
  type AdminFundList,
  type Staleness,
} from "../services/api/adminFundCatalogue";

/**
 * The catalogue's maintenance list.
 *
 * Ordered by staleness, not by name, because the page exists to answer one
 * question: what needs re-reading. Funds with no fact sheet at all come first —
 * they are listed but can never be matched to anyone until their figures are
 * recorded, which is a worse state than merely being out of date.
 *
 * Retired funds are shown rather than hidden. There is no delete anywhere in
 * this feature: the tables grant none, because a catalogue of published
 * documents is evidence. Reviving a fund is how one comes back, so the list has
 * to show what is retired for that to be possible.
 *
 * It wears the admin section's shell — the same ground, the same header block,
 * the same tab strip — because it is one tab of that section and was the only
 * one that did not look like it. On its own container and with no strip, opening
 * Funds left the section: the tabs vanished and the browser's back button was
 * the only way to Users or Badges. That is what made a tab read as a separate
 * product.
 */
export default function AdminFunds() {
  const [data, setData] = useState<AdminFundList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { setSession } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore sign out errors
    }
    setSession(null);
    navigate("/", { replace: true });
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await listAdminFunds());
    } catch (e) {
      console.error("Error loading the admin fund list:", e);
      setError("Unable to load the fund catalogue.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(fund: AdminFund) {
    setBusyId(fund.id);
    try {
      await updateAdminFund(fund.id, { is_active: !fund.is_active });
      await load();
    } catch (e) {
      console.error("Error changing whether a fund is listed:", e);
      setError("That change did not save.");
    } finally {
      setBusyId(null);
    }
  }

  const needsAttention =
    data?.funds.filter((f) => f.staleness.status === "stale" || f.staleness.status === "missing")
      .length ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-brand-bg text-brand-fg">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* The section's header block, matching its siblings: same ground, same
            eyebrow, same title scale, same count pill and sign-out. */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-brand-primary font-semibold">
              Admin
            </p>
            <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold tracking-tight">
              <Landmark className="h-6 w-6 shrink-0 text-brand-primary" />
              Fund catalogue
            </h1>
            <p className="text-sm text-brand-muted-fg max-w-3xl">
              Ordered by how old each fund's newest fact sheet is. Fact sheets are reissued at
              least quarterly, so the ones at the top are the ones to re-read.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {data && (
              <div className="text-sm font-medium text-brand-muted-fg bg-brand-secondary px-4 py-2 rounded-full border border-brand-border">
                Total Funds: {data.count}
              </div>
            )}
            {/* Only when there is something to attend to. A "0 need attention"
                pill is a permanent fixture that stops being read. */}
            {needsAttention > 0 && (
              <div className="text-sm font-medium text-warning-strong bg-warning/15 px-4 py-2 rounded-full border border-warning/30">
                {needsAttention} need attention
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-danger/30 border border-danger hover:border-danger hover:text-background hover:bg-danger text-danger text-sm font-medium"
            >
              Sign out
            </button>
          </div>
        </div>

        <AdminTabs />

        <AddFundForm onCreated={load} />

        {error && (
          <div className="soft-card flex items-center gap-2 p-4 text-sm text-brand-primary">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            {error}
          </div>
        )}

        {isLoading && <div className="soft-card p-6 text-sm text-brand-secondary">Loading…</div>}

        {!isLoading && data && (
          <div className="space-y-2">
            {/* The thresholds the ordering is graded by, next to the ordering
                they grade. No negative margin: `space-y-*` is wrapped in
                `:where()` in Tailwind v4 and so carries zero specificity, which
                means any margin utility on a child wins outright — an `-mb-3`
                here turned a 32px gap into a -12px one and slid the "Add a
                fund" button up over this line. */}
            <p className="px-1 text-xs text-brand-muted-fg">
              Flagged after {data.soft_stale_days} days · stale after {data.stale_days}
            </p>
            <div className="soft-card overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-brand-border/40 text-[11px] uppercase tracking-[0.06em] text-brand-secondary/70">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fund</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Fact sheet</th>
                    <th className="px-4 py-3 font-semibold">Listed</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.funds.map((fund) => (
                    <tr key={fund.id} className="border-b border-brand-border/20 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/funds/${fund.id}`}
                          className="font-semibold text-brand-primary hover:underline"
                        >
                          {fund.name}
                        </Link>
                        <div className="text-brand-secondary/70">{fund.manco}</div>
                        <div className="font-mono text-[10px] text-brand-secondary/60">{fund.isin}</div>
                      </td>
                      <td className="px-4 py-3 text-brand-secondary">{fund.asisa_category}</td>
                      <td className="px-4 py-3">
                        <StalenessBadge staleness={fund.staleness} />
                      </td>
                      <td className="px-4 py-3">
                        {fund.is_active ? (
                          <span className="text-brand-secondary">Yes</span>
                        ) : (
                          <span className="font-semibold text-brand-secondary/60">Retired</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void toggleActive(fund)}
                          disabled={busyId === fund.id}
                          className="inline-flex items-center gap-1 rounded-md border border-brand-border/60 px-2 py-1 text-[11px] font-semibold text-brand-primary hover:bg-brand-bg disabled:opacity-50"
                        >
                          {!fund.is_active && <RotateCcw className="h-3 w-3" />}
                          {fund.is_active ? "Retire" : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Said once, here, because it is the thing most likely to be looked
            for and not found. */}
        <p className="px-1 text-[11px] leading-relaxed text-brand-muted-fg">
          Nothing in the catalogue can be deleted. A fund is retired, which takes it off the
          public list and keeps its record; a fact sheet is corrected by recording another one,
          and the newer reading is the one shown. Both are deliberate: every figure the product
          publishes has to remain traceable to the document it came from.
        </p>
      </div>
    </div>
  );
}

function StalenessBadge({ staleness }: { staleness: Staleness }) {
  const tone =
    staleness.status === "stale" || staleness.status === "missing"
      ? "bg-amber-100 text-amber-900"
      : staleness.status === "ageing" || staleness.status === "unreadable"
        ? "bg-brand-bg text-brand-secondary"
        : "bg-emerald-50 text-emerald-800";

  const label =
    staleness.status === "missing"
      ? "None on file"
      : staleness.status === "unreadable"
        ? "Date unreadable"
        : `${staleness.as_of} · ${staleness.age_days}d`;

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>
  );
}
