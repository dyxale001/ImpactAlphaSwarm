-- Per-ticker cache of insider dealings (whale watching) pulled from Finnhub +
-- yfinance roles.
--
-- Insider (SEC Form 4) data changes slowly — filings land within ~2 business days
-- of a trade and are sporadic per ticker — so there is no value in re-hitting the
-- APIs on every page load / refresh. The /api/whales/{ticker} endpoint reads this
-- cache and only refetches when a ticker's row is older than the TTL
-- (INSIDER_CACHE_TTL in api.py, default 48h). Purely informational; never feeds
-- the recommendation.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/
-- writes this table. Safe to re-run (idempotent).
--
-- transactions shape: jsonb array of normalized rows, e.g.
--   [{"name":"STEVENS MARK A","role":"Director","type":"sell","shares":565615,
--     "price":210.44,"value":119026436.88,"transaction_date":"2026-06-28",
--     "filing_date":"2026-06-30","transaction_code":"S"}]

create table if not exists public.insider_transactions_cache (
  ticker        text primary key,
  transactions  jsonb not null default '[]'::jsonb,
  source        text,
  fetched_at    timestamptz not null default now()
);

-- Reads filter by fetched_at freshness; index keeps that cheap.
create index if not exists insider_transactions_cache_fetched_at_idx
  on public.insider_transactions_cache (fetched_at);

-- The backend connects as service_role (service key) and needs table privileges
-- (these are not always auto-granted on newly created tables).
grant select, insert, update on public.insider_transactions_cache to service_role;

-- Lock the table down to the backend only: enable RLS with no policies, so anon/
-- authenticated are denied while service_role bypasses RLS. Internal cache only.
alter table public.insider_transactions_cache enable row level security;
