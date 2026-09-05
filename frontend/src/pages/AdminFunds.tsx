import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Landmark, RotateCcw } from "lucide-react";
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
 */
export default function AdminFunds() {
  const [data, setData] = useState<AdminFundList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    <div className="max-w-6xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-5">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand-primary">
          <Landmark className="h-5 w-5 text-brand-accent" />
          Fund catalogue
        </h1>
        <p className="text-sm text-brand-secondary">
          Ordered by how old each fund's newest fact sheet is. Fact sheets are reissued at least
          quarterly, so the ones at the top are the ones to re-read.
        </p>
        {data && (
          <p className="text-xs text-brand-secondary/70">
            {data.count} funds · flagged after {data.soft_stale_days} days · stale after{" "}
            {data.stale_days}
            {needsAttention > 0 && ` · ${needsAttention} need attention`}
          </p>
        )}
      </header>

      {error && (
        <div className="soft-card flex items-center gap-2 p-4 text-sm text-brand-primary">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          {error}
        </div>
      )}

      {isLoading && <div className="soft-card p-6 text-sm text-brand-secondary">Loading…</div>}

      {!isLoading && data && (
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
      )}

      {/* Said once, here, because it is the thing most likely to be looked for
          and not found. */}
      <p className="px-1 text-[11px] leading-relaxed text-brand-secondary/60">
        Nothing in the catalogue can be deleted. A fund is retired, which takes it off the public
        list and keeps its record; a fact sheet is corrected by recording another one, and the newer
        reading is the one shown. Both are deliberate: every figure the product publishes has to
        remain traceable to the document it came from.
      </p>
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
