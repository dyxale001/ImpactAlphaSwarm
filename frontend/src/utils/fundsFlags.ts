/** Show the funds catalogue: the Funds page and its sidebar entry.
 *
 * Separate from the backend's FUNDS_ENABLED, and both are needed. This flag only
 * decides whether the page is reachable; the page reads /api/fund-catalogue,
 * which the backend flag mounts. Setting this one alone gives a page that cannot
 * load, and setting only the backend one gives an API nobody visits.
 *
 * Defaults to off, so a build that says nothing about funds behaves exactly as
 * the app does today. */
export const FUNDS_ENABLED =
  (import.meta.env.VITE_FUNDS_ENABLED ?? "false") === "true";

/** Show the "My funds" tab: a reader uploads a fact sheet, checks what was read
 *  from it and keeps it in their own list.
 *
 * Needs FUNDS_ENABLED (it is a tab on that page) and the backend's
 * FUND_UPLOADS_ENABLED, which mounts /api/fund-uploads. Off by default. */
export const FUND_UPLOADS_ENABLED =
  FUNDS_ENABLED && (import.meta.env.VITE_FUND_UPLOADS_ENABLED ?? "false") === "true";
