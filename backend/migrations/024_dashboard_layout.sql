-- Dashboard layout: what each user wants their dashboard to look like.
--
-- The dashboard is composed by the user from a library of widgets. The order of
-- those widgets, how wide each one is, and which asset the ticker-scoped ones
-- point at, all live in this one jsonb blob.
--
-- Why a column on user_analysis rather than a table of its own. Every other
-- per-user preference already lives here (investment_universe, risk_tolerance,
-- ai_derived_expertise, and the free-form survey_answers blob), and the frontend
-- already reads and upserts this table directly with the anon key, so the read
-- path, the write path and the row-level policies all exist. A separate table
-- would be the first in this folder to need its own auth.uid() policies written
-- by hand, since every migration here deliberately locks its table to
-- service_role and nothing in the frontend reads those.
--
-- The shape, versioned so a future widget rename is a code migration rather than
-- a SQL one:
--
--   {
--     "version": 1,
--     "pinnedTicker": "NVDA",
--     "widgets": [
--       { "id": "sentiment-trend", "size": "wide" },
--       { "id": "watchlist", "size": "medium", "settings": { "sort": "added" } }
--     ]
--   }
--
-- Null means the user has never set a dashboard up. Every dashboard starts
-- blank and nothing is arranged on anyone's behalf, so null is what puts the
-- setup guide in front of them: a new signup and an existing account both begin
-- from the same empty page.
--
-- Run this in the Supabase SQL editor BEFORE deploying the frontend that reads
-- it. Safe to re-run (idempotent).

alter table public.user_analysis
  add column if not exists dashboard_layout jsonb;

comment on column public.user_analysis.dashboard_layout is
  'Versioned widget layout for the personalised dashboard. Null until the user arranges one; every dashboard starts blank.';
