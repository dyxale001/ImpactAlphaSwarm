import { supabase } from "../../lib/supabase";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export type ReportRange = "today" | "7d" | "30d" | "90d" | "all";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("No auth token, user may not be logged in");
  return token;
}

async function getReport<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const token = await getToken();
  const qs = params
    ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    : "";
  const res = await fetch(`${BASE}${path}${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export interface OverviewReport {
  range: ReportRange;
  total_users: number;
  new_users: number;
  active_users: number;
  active_window_days: number;
  inactive_users: number;
  users_by_role: Record<string, number>;
  new_user_trends: Record<string, { current: number; previous: number; delta_pct: number | null }>;
}

export interface UsersReport {
  range: ReportRange;
  registration_trend: { period: string; new_users: number }[];
  registration_trend_granularity: "day" | "week";
  cohorts_by_registration_week: { week: string; new_users: number }[];
  account_status: { active: number; inactive: number };
  users_by_role: Record<string, number>;
  total_in_range: number;
}

export interface LearnersReport {
  range: ReportRange;
  watchlist_additions: { total: number; in_range: number };
  learning_xp: { average: number; distribution: Record<string, number>; learner_count: number };
}

export interface BadgesReport {
  range: ReportRange;
  leaderboard: { badge_id: string; badge_name: string; earned_count: number; pct_of_learners: number }[];
  rarity_definition: string;
  average_badges_per_learner: number;
  earning_trend: { date: string; badges_earned: number }[];
  total_badges_earned: number;
  total_badges_earned_in_range: number;
}

export interface AssetsReport {
  range: ReportRange;
  analysis_runs: { total: number; in_range: number };
  most_watchlisted: { ticker: string; count: number }[];
  most_analyzed: { ticker: string; count: number }[];
  most_analyzed_definition: string;
}

export interface RetentionReport {
  definitions: Record<string, string>;
  dau: number;
  wau: number;
  mau: number;
  new_active_last_30d: number;
  returning_active_last_30d: number;
}

export interface ChatbotReport {
  range: ReportRange;
  available: boolean;
  message?: string;
  total_queries: number;
  unique_users?: number;
  success_rate_pct?: number;
  fallback_rate_pct?: number;
  validation_failure_rate_pct?: number;
  average_latency_ms?: number | null;
  top_queried_assets?: { ticker: string; count: number }[];
  queries_over_time?: { date: string; count: number }[];
}

export const adminReportsApi = {
  overview: (range: ReportRange) => getReport<OverviewReport>("/api/admin/reports/overview", { range }),
  users: (range: ReportRange) => getReport<UsersReport>("/api/admin/reports/users", { range }),
  learners: (range: ReportRange) => getReport<LearnersReport>("/api/admin/reports/learners", { range }),
  badges: (range: ReportRange) => getReport<BadgesReport>("/api/admin/reports/badges", { range }),
  assets: (range: ReportRange) => getReport<AssetsReport>("/api/admin/reports/assets", { range }),
  retention: () => getReport<RetentionReport>("/api/admin/reports/retention"),
  chatbot: (range: ReportRange) => getReport<ChatbotReport>("/api/admin/reports/chatbot", { range }),
};
