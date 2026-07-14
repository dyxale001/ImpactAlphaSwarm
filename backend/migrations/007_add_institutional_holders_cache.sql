-- Per-ticker cache of institutional ownership (whale watching, "Institutional
-- Owners" tab) pulled from yfinance major_holders + institutional_holders.
--
-- 13F institutional ownership updates only quarterly, so this is cached with a
-- long TTL (INSTITUTIONS_CACHE_TTL in api.py, default 7 days) and only refetched
-- when stale. Purely informational; never feeds the recommendation.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/
-- writes this table. Safe to re-run (idempotent).
--
-- payload shape: jsonb object, e.g.
--   {"institutions_pct":0.657,"insiders_pct":0.016,"institutions_count":7626,
--    "source":"yfinance",
--    "holders":[{"holder":"Blackrock Inc.","pct_held":0.0779,"shares":1144695425,
--                "value":360945369794,"pct_change":-0.0086,"date_reported":"2026-03-31"}]}

create table if not exists public.institutional_holders_cache (
  ticker      text primary key,
  payload     jsonb not null default '{}'::jsonb,
  fetched_at  timestamptz not null default now()
);

-- Reads filter by fetched_at freshness; index keeps that cheap.
create index if not exists institutional_holders_cache_fetched_at_idx
  on public.institutional_holders_cache (fetched_at);

-- The backend connects as service_role and needs table privileges
-- (not always auto-granted on newly created tables).
grant select, insert, update on public.institutional_holders_cache to service_role;

-- Lock to the backend only: RLS on with no policies denies anon/authenticated,
-- while service_role bypasses RLS. Internal cache, never read by the frontend.
alter table public.institutional_holders_cache enable row level security;
