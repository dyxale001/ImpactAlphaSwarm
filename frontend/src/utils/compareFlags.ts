/** Show the Compare page and its sidebar entry.
 *
 * The page itself needs no new backend: every column reads endpoints the stock
 * and fund pages already use. Only its written comparison ("What separates
 * these") needs the backend's COMPARE_TRACE_ENABLED, and the panel hides itself
 * when that is off, so this flag can be set on its own.
 *
 * The funds half of the toggle also needs VITE_FUNDS_ENABLED, because it reads
 * the fund catalogue.
 *
 * Defaults to off, so a build that says nothing about Compare behaves exactly as
 * the app does today. */
export const COMPARE_ENABLED =
  (import.meta.env.VITE_COMPARE_ENABLED ?? "false") === "true";
