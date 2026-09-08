import { supabase } from "../../lib/supabase";
import type { DashboardLayout } from "../../dashboard/layoutSchema";

// Writing the dashboard layout back to user_analysis.
//
// Two layers, matching learningService: a repository class holding the queries,
// then free-function delegations so callers import by name. There is no read
// method on purpose. authService already does `select("*")` on user_analysis, so
// the layout arrives in the auth store with the rest of the profile and a second
// read here would be the same row fetched twice.

export class DashboardLayoutRepository {
  private static readonly TABLE = "user_analysis";

  /**
   * Persist a layout for one user.
   *
   * An upsert on user_id rather than an update, for the same reason
   * saveInvestmentPrefs is one: a user whose analysis row is missing (an
   * onboarding that failed part way, an account created before the table
   * existed) should end up with a row rather than a silent no-op. PostgREST
   * updates only the columns named here, so the survey answers and investment
   * universe sitting in the same row are untouched.
   */
  async save(userId: string, layout: DashboardLayout): Promise<void> {
    const { error } = await supabase.from(DashboardLayoutRepository.TABLE).upsert(
      {
        user_id: userId,
        dashboard_layout: layout,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) throw error;
  }

  /**
   * Forget this user's layout entirely.
   *
   * Null is meaningfully different from a layout with no widgets in it: null
   * means "has never set one up", which is what puts the starter-deck picker
   * back in front of them. An empty widget list means "has set one up and
   * cleared it", which is a dashboard they chose.
   */
  async clear(userId: string): Promise<void> {
    const { error } = await supabase
      .from(DashboardLayoutRepository.TABLE)
      .update({
        dashboard_layout: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) throw error;
  }
}

export const dashboardLayoutRepository = new DashboardLayoutRepository();

export async function saveDashboardLayout(
  userId: string,
  layout: DashboardLayout,
) {
  return dashboardLayoutRepository.save(userId, layout);
}

export async function clearDashboardLayout(userId: string) {
  return dashboardLayoutRepository.clear(userId);
}
