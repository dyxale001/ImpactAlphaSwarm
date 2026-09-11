import { useState } from "react";
import AdminTabs from "../components/admin/AdminTabs";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { adminReportsApi, type ReportRange } from "../services/api/adminReports";
import { useAdminReport } from "../hooks/useAdminReports";

const TABS = ["Overview", "Users", "Learners", "Assets", "Retention", "Chatbot"] as const;
type Tab = (typeof TABS)[number];

const RANGES: { key: ReportRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

const chartAxisProps = {
  tick: { fill: "var(--color-brand-muted-fg)", fontSize: 12 },
  axisLine: false,
  tickLine: false,
};

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs uppercase tracking-wider text-brand-muted-fg font-semibold">{label}</p>
      <p className="text-2xl font-bold text-brand-fg mt-2">{value}</p>
      {sub && <p className="text-xs text-brand-muted-fg mt-1">{sub}</p>}
    </div>
  );
}

function TrendBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return <span className="text-xs text-brand-muted-fg">n/a (no prior window)</span>;
  const positive = deltaPct >= 0;
  return (
    <span className={`text-xs font-semibold ${positive ? "text-success" : "text-danger"}`}>
      {positive ? "+" : ""}
      {deltaPct}%
    </span>
  );
}

function SectionState({ loading, error, empty }: { loading: boolean; error: string | null; empty?: boolean }) {
  if (loading) return <div className="glass-card p-6 text-sm text-brand-muted-fg">Loading report…</div>;
  if (error) return <div className="glass-card p-6 text-sm text-danger">Failed to load report: {error}</div>;
  if (empty) return <div className="glass-card p-6 text-sm text-brand-muted-fg">No data available for the selected range.</div>;
  return null;
}

function SimpleLineChart({ data, dataKey, xKey }: { data: any[]; dataKey: string; xKey: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-brand-muted-fg">Not enough data yet to chart a trend.</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-brand-border)" opacity={0.3} />
          <XAxis dataKey={xKey} {...chartAxisProps} />
          <YAxis {...chartAxisProps} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--color-brand-card)", border: "1px solid var(--color-brand-border)", borderRadius: "8px", fontSize: "12px", color: "var(--color-brand-fg)" }}
          />
          <Line type="monotone" dataKey={dataKey} stroke="var(--color-brand-primary)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankBarChart({ data, dataKey, xKey }: { data: any[]; dataKey: string; xKey: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-brand-muted-fg">No data recorded yet.</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-brand-border)" opacity={0.3} horizontal={false} />
          <XAxis type="number" {...chartAxisProps} allowDecimals={false} />
          <YAxis type="category" dataKey={xKey} {...chartAxisProps} width={70} />
          <Tooltip
            contentStyle={{ background: "var(--color-brand-card)", border: "1px solid var(--color-brand-border)", borderRadius: "8px", fontSize: "12px", color: "var(--color-brand-fg)" }}
          />
          <Bar dataKey={dataKey} fill="var(--color-brand-primary)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function OverviewTab({ range }: { range: ReportRange }) {
  const { data, loading, error } = useAdminReport(adminReportsApi.overview, range);
  if (loading || error || !data) return <SectionState loading={loading} error={error} />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total users" value={data.total_users} />
        <KpiCard label={`New users (${range})`} value={data.new_users} />
        <KpiCard label={`Active users (${data.active_window_days}d sign-in)`} value={data.active_users} />
        <KpiCard label="Inactive users" value={data.inactive_users} />
      </div>
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">New-user trend deltas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(data.new_user_trends).map(([key, t]) => (
            <div key={key} className="flex items-center justify-between border border-brand-border rounded-brand px-4 py-3">
              <div>
                <p className="text-xs text-brand-muted-fg uppercase">{key}</p>
                <p className="text-lg font-semibold text-brand-fg">{t.current}</p>
              </div>
              <TrendBadge deltaPct={t.delta_pct} />
            </div>
          ))}
        </div>
      </div>
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Users by role</h3>
        <div className="flex gap-6 flex-wrap">
          {Object.entries(data.users_by_role).map(([role, count]) => (
            <div key={role}>
              <p className="text-xs text-brand-muted-fg capitalize">{role}</p>
              <p className="text-xl font-bold text-brand-fg">{count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab({ range }: { range: ReportRange }) {
  const { data, loading, error } = useAdminReport(adminReportsApi.users, range);
  if (loading || error || !data) return <SectionState loading={loading} error={error} />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="New users in range" value={data.total_in_range} />
        <KpiCard label="Account active" value={data.account_status.active} />
        <KpiCard label="Account inactive" value={data.account_status.inactive} />
      </div>
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">
          Registration trend ({data.registration_trend_granularity})
        </h3>
        <SimpleLineChart data={data.registration_trend} dataKey="new_users" xKey="period" />
      </div>
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Cohorts by registration week</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-brand-muted-fg border-b border-brand-border">
                <th className="py-2 pr-4">Week</th>
                <th className="py-2">New users</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts_by_registration_week.length === 0 && (
                <tr><td colSpan={2} className="py-3 text-brand-muted-fg">No registrations in this range.</td></tr>
              )}
              {data.cohorts_by_registration_week.map((c) => (
                <tr key={c.week} className="border-b border-brand-border/50">
                  <td className="py-2 pr-4 text-brand-fg">{c.week}</td>
                  <td className="py-2 text-brand-fg">{c.new_users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BadgesSection({ range }: { range: ReportRange }) {
  const { data, loading, error } = useAdminReport(adminReportsApi.badges, range);
  if (loading || error || !data) return <SectionState loading={loading} error={error} />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Badges earned (range)" value={data.total_badges_earned_in_range} sub={`${data.total_badges_earned} all time`} />
        <KpiCard label="Avg badges / learner" value={data.average_badges_per_learner} />
      </div>
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Badge earning trend</h3>
        <SimpleLineChart data={data.earning_trend} dataKey="badges_earned" xKey="date" />
      </div>
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg">Badge leaderboard</h3>
          <p className="text-xs text-brand-muted-fg">{data.rarity_definition}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-brand-muted-fg border-b border-brand-border">
                <th className="py-2 pr-4">Badge</th>
                <th className="py-2 pr-4">Earned</th>
                <th className="py-2">% of learners</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.length === 0 && (
                <tr><td colSpan={3} className="py-3 text-brand-muted-fg">No badges earned yet.</td></tr>
              )}
              {data.leaderboard.map((b) => (
                <tr key={b.badge_id} className="border-b border-brand-border/50">
                  <td className="py-2 pr-4 text-brand-fg">{b.badge_name}</td>
                  <td className="py-2 pr-4 text-brand-fg">{b.earned_count}</td>
                  <td className="py-2 text-brand-fg">{b.pct_of_learners}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LearnersTab({ range }: { range: ReportRange }) {
  const { data, loading, error } = useAdminReport(adminReportsApi.learners, range);
  const xpBuckets = data ? Object.entries(data.learning_xp.distribution).map(([bucket, count]) => ({ bucket, count })) : [];
  return (
    <div className="space-y-8">
      {loading || error || !data ? (
        <SectionState loading={loading} error={error} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard label="Watchlist adds (range)" value={data.watchlist_additions.in_range} sub={`${data.watchlist_additions.total} all time`} />
            <KpiCard
              label="Average XP"
              value={data.learning_xp.average}
              sub={`${data.learning_xp.learner_count} learners — real average of users.learning_xp, not estimated`}
            />
          </div>
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Learning XP distribution</h3>
            <RankBarChart data={xpBuckets} dataKey="count" xKey="bucket" />
          </div>
        </div>
      )}
      <div>
        <h2 className="text-xs uppercase tracking-wider text-brand-muted-fg font-semibold mb-4">Badges &amp; achievements</h2>
        <BadgesSection range={range} />
      </div>
    </div>
  );
}

function AssetsTab({ range }: { range: ReportRange }) {
  const { data, loading, error } = useAdminReport(adminReportsApi.assets, range);
  if (loading || error || !data) return <SectionState loading={loading} error={error} />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Analysis runs (range)" value={data.analysis_runs.in_range} sub={`${data.analysis_runs.total} all time`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Most watchlisted assets</h3>
          <RankBarChart data={data.most_watchlisted} dataKey="count" xKey="ticker" />
          <p className="text-xs text-brand-muted-fg mt-3">Number of user_watchlist_assets rows for this ticker.</p>
        </div>
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Most analyzed assets</h3>
          <RankBarChart data={data.most_analyzed} dataKey="count" xKey="ticker" />
          <p className="text-xs text-brand-muted-fg mt-3">{data.most_analyzed_definition}</p>
        </div>
      </div>
    </div>
  );
}

function RetentionTab() {
  // adminReportsApi.retention ignores its range argument (the endpoint takes
  // none) — passed directly, NOT wrapped in an inline arrow, so the fetcher
  // reference stays stable across renders. An inline `() => ...` here
  // previously got a new identity every render, which retriggered
  // useAdminReport's effect every time and looped the fetch forever.
  const { data, loading, error } = useAdminReport(adminReportsApi.retention, "30d");
  if (loading || error || !data) return <SectionState loading={loading} error={error} />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="DAU" value={data.dau} />
        <KpiCard label="WAU" value={data.wau} />
        <KpiCard label="MAU" value={data.mau} />
        <KpiCard label="New & active (30d)" value={data.new_active_last_30d} />
        <KpiCard label="Returning (30d)" value={data.returning_active_last_30d} />
      </div>
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-3">Definitions</h3>
        <dl className="space-y-2 text-sm">
          {Object.entries(data.definitions).map(([key, desc]) => (
            <div key={key}>
              <dt className="font-semibold text-brand-fg uppercase text-xs">{key}</dt>
              <dd className="text-brand-muted-fg">{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function ChatbotTab({ range }: { range: ReportRange }) {
  const { data, loading, error } = useAdminReport(adminReportsApi.chatbot, range);
  if (loading || error || !data) return <SectionState loading={loading} error={error} />;
  if (!data.available) {
    return <div className="glass-card p-6 text-sm text-brand-muted-fg">{data.message}</div>;
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total queries" value={data.total_queries} />
        <KpiCard label="Unique users" value={data.unique_users ?? 0} />
        <KpiCard label="Success rate" value={`${data.success_rate_pct}%`} />
        <KpiCard label="Fallback rate" value={`${data.fallback_rate_pct}%`} />
        <KpiCard label="Validation-failure rate" value={`${data.validation_failure_rate_pct}%`} />
      </div>
      {data.average_latency_ms != null && (
        <KpiCard label="Average latency" value={`${data.average_latency_ms} ms`} />
      )}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Queries over time</h3>
        <SimpleLineChart data={data.queries_over_time ?? []} dataKey="count" xKey="date" />
      </div>
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Top queried assets</h3>
        <RankBarChart data={data.top_queried_assets ?? []} dataKey="count" xKey="ticker" />
        <p className="text-xs text-brand-muted-fg mt-3">
          Aggregate counts only — raw prompts and answers are never stored or shown here.
        </p>
      </div>
    </div>
  );
}

export default function AdminReports() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [range, setRange] = useState<ReportRange>("30d");
  const rangeAware: Tab[] = ["Overview", "Users", "Learners", "Assets", "Chatbot"];

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-brand-bg text-brand-fg">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-brand-primary font-semibold">Admin</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports &amp; Analytics</h1>
            <p className="text-sm text-brand-muted-fg max-w-3xl">
              Platform usage, learner engagement, and Ask AlphaSwarm behaviour — built entirely from real,
              persisted data. Nothing here is estimated or backfilled.
            </p>
          </div>
        </div>

        <AdminTabs />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  t === tab
                    ? "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-fg text-brand-bg text-sm font-medium"
                    : "inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-border bg-brand-card text-sm text-brand-muted-fg hover:text-brand-fg transition-colors"
                }
              >
                {t}
              </button>
            ))}
          </div>
          {rangeAware.includes(tab) && (
            <div className="flex gap-2">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={
                    r.key === range
                      ? "px-3 py-1.5 rounded-full bg-brand-primary text-brand-bg text-xs font-semibold"
                      : "px-3 py-1.5 rounded-full border border-brand-border text-xs text-brand-muted-fg hover:text-brand-fg transition-colors"
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === "Overview" && <OverviewTab range={range} />}
        {tab === "Users" && <UsersTab range={range} />}
        {tab === "Learners" && <LearnersTab range={range} />}
        {tab === "Assets" && <AssetsTab range={range} />}
        {tab === "Retention" && <RetentionTab />}
        {tab === "Chatbot" && <ChatbotTab range={range} />}
      </div>
    </div>
  );
}
