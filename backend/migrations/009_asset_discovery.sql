-- Exploratory asset-discovery agent (D-068): schema support.
--
-- The discovery agent refreshes the per-universe candidate pool nightly instead
-- of relying on the hand-curated seed list alone. This migration is PURELY
-- ADDITIVE: it extends `assets` with discovery/lifecycle columns and adds a
-- `discovery_runs` audit table. Nothing here changes existing behaviour on its
-- own — the agent stays dormant until DISCOVERY_ENABLED is set.
--
-- Two properties make this safe to land before code-freeze:
--   * Every new `assets` column is nullable or carries a default, so existing
--     rows, older backends, and a rollback all stay valid. The NOT NULL columns
--     (origin, is_active) backfill existing rows to 'seed'/true on add — i.e. the
--     current curated tickers are correctly recorded as active seeds.
--   * No existing column is dropped or retyped.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes
-- these columns, otherwise the nightly upsert would fail on unknown columns.
-- Safe to re-run (idempotent).

-- ── assets: discovery provenance + lifecycle ────────────────────────────────
alter table public.assets
  add column if not exists origin              text        not null default 'seed',  -- 'seed' | 'discovered'
  add column if not exists is_active           boolean     not null default true,     -- soft-retire, never delete (recommendation history must resolve)
  add column if not exists discovery_score     double precision,                      -- membership/ordering only; NEVER a user-facing rating
  add column if not exists discovery_sources   jsonb,                                 -- provenance, e.g. ["stocktwits_trending","llm"]
  add column if not exists first_discovered_at timestamptz,
  add column if not exists last_discovered_at  timestamptz,
  add column if not exists market_cap_usd      numeric,                               -- cached from the Finnhub profile (Stage-2 size gate)
  add column if not exists ipo_date            date,                                  -- cached from the Finnhub profile (Stage-2 seasoning gate)
  add column if not exists quarantine_reason   text,                                  -- why a discovered ticker was benched (e.g. 'no_quant_data')
  add column if not exists quarantined_until   timestamptz;                           -- quarantine expiry; re-eligible through the funnel afterwards

-- The ranked read selects active, non-quarantined rows per universe; this index
-- keeps that per-universe scan cheap as the pool grows.
create index if not exists assets_universe_active_idx
  on public.assets (universe, is_active);

-- The discovery agent is the first thing to UPDATE existing `assets` rows
-- (refresh scores, hysteresis decay, soft-retire, quarantine). The backend's
-- service_role has historically only needed insert/select on assets, so UPDATE
-- is not always granted — grant it explicitly, else those writes fail with
-- "permission denied for table assets" (42501) while inserts still succeed.
grant select, insert, update on public.assets to service_role;

-- ── discovery_runs: one audit row per nightly discovery pass ─────────────────
-- summary    = per-universe pool/new/retired counts
-- rejections = [{ticker, stage, reason}] — the "why the agent rejected X" record
--              (demo/report material and the input shape for future evals)
create table if not exists public.discovery_runs (
  id         uuid primary key default gen_random_uuid(),
  ran_at     timestamptz not null default now(),
  summary    jsonb,
  rejections jsonb,
  status     text
);

-- Audit queries want the most recent run first.
create index if not exists discovery_runs_ran_at_idx
  on public.discovery_runs (ran_at desc);

-- The backend connects as service_role and needs table privileges (not always
-- auto-granted on newly created tables).
grant select, insert, update on public.discovery_runs to service_role;

-- Internal audit table, never read directly by the frontend: enable RLS with no
-- policies so anon/authenticated are denied while service_role bypasses RLS.
alter table public.discovery_runs enable row level security;
