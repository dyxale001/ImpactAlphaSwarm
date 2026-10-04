/** Show the Market News page and its sidebar entry.
 *
 * Pairs with the backend's MACRO_NEWS_ENABLED, which mounts /api/macro. Like the
 * funds flag, this one only decides whether the page is reachable, so both are
 * needed: this alone gives a page that cannot load, the backend one alone gives an
 * API nobody visits. Defaults to off. */
export const MACRO_NEWS_ENABLED =
  (import.meta.env.VITE_MACRO_NEWS_ENABLED ?? "false") === "true";
