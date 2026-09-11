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
