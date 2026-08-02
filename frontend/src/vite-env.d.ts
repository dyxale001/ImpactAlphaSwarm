/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE?: string
  /** "true" shows the disclosed Signal Scorecard instead of the 0-100 confidence
   *  score. Flip only once the BACKEND ranking is live (not in shadow), or the
   *  scorecard would explain a placement the legacy score actually decided. */
  readonly VITE_UNIFIED_SCORECARD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}