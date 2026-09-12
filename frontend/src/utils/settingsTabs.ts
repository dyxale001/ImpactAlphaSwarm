/**
 * The three views of the Settings page, and how the URL names them.
 *
 * The split follows what reads the data rather than the old section headings.
 * The fund matcher reads the risk answers and the goals together, in one pass,
 * so they share a tab. The nightly analysis run reads sectors and expertise,
 * so those share the next. The last is everything about the login itself.
 *
 * The active tab lives in the query string (`/settings?tab=profile`) so other
 * pages can send someone to the right view: the dashboard's fund-bracket tile
 * points a user with no profile at the questions, not at the top of the page.
 */

export const SETTINGS_TABS = ["profile", "preferences", "account"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  profile: "Investor profile",
  preferences: "Preferences",
  account: "Account",
};

export const SETTINGS_TAB_PARAM = "tab";

export const DEFAULT_SETTINGS_TAB: SettingsTab = "profile";

/** The tab a query-string value names, or the default for anything else. */
export function parseSettingsTab(value: string | null | undefined): SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value ?? "")
    ? (value as SettingsTab)
    : DEFAULT_SETTINGS_TAB;
}

/** The path that opens a given tab, for links from elsewhere in the app. */
export function settingsPath(tab: SettingsTab): string {
  return `/settings?${SETTINGS_TAB_PARAM}=${tab}`;
}
