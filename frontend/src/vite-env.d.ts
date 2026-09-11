/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE?: string
  /** "true" shows the disclosed Signal Scorecard instead of the 0-100 confidence
   *  score. Flip only once the BACKEND ranking is live (not in shadow), or the
   *  scorecard would explain a placement the legacy score actually decided. */
  readonly VITE_UNIFIED_SCORECARD?: string
  /** "true" shows the Funds page and its nav entry. Pairs with the backend's
   *  FUNDS_ENABLED: this flag only decides whether the page is reachable, and
   *  the page needs the API the backend flag mounts, so setting one without the
   *  other gives either a hidden feature or a page that cannot load. */
  readonly VITE_FUNDS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}