-- Cache for the fund-holdings aggregation (whale watching "Top Funds" and
-- "Notable Investors" tabs). This is the per-ticker institutional data inverted
-- into per-fund holdings across every tracked asset — expensive to build (it can
-- touch all ~50 tickers), so the whole aggregation is cached as a single row.
--
-- Weekly TTL (FUNDS_CACHE_TTL in whale_watching.py). Purely informational; never
-- feeds the recommendation.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/
-- writes this table. Safe to re-run (idempotent).
--
-- payload shape: jsonb array of funds, e.g.
--   [{"fund":"Blackrock Inc.","total_value":1.2e12,
--     "positions":[{"ticker":"AAPL","universe":"Technology","pct_held":0.0779,
--                   "value":3.6e11,"pct_change":-0.0086}]}]

create table if not exists public.fund_holdings_cache (
  id          text primary key,   -- single aggregate row, id = 'ALL'
  payload     jsonb not null default '[]'::jsonb,
  fetched_at  timestamptz not null default now()
);

grant select, insert, update on public.fund_holdings_cache to service_role;

-- Internal cache, backend-only: RLS on with no policies denies anon/authenticated
-- while service_role bypasses RLS.
alter table public.fund_holdings_cache enable row level security;
