-- Per-ticker cache of trusted-source news pulled from Finnhub on the nightly batch.
--
-- Finnhub company-news used to be queried live on EVERY user refresh, one call per
-- ticker. The free plan is capped at 60 calls/min per key, so a couple of users
-- refreshing at once (or a refresh overlapping the nightly run) exhausted the
-- budget and every subsequent call returned HTTP 429, silently collapsing the news
-- signal to social-only for the whole run.
--
-- Fix: the nightly batch writes each ticker's trusted-tier articles here (mirroring
-- marketaux_news_cache, see migrations/003), and user refreshes read them back
-- instead of re-hitting the API. Refreshes make no live Finnhub call except a
-- single throttled top-up for a ticker missing from the cache (e.g. a name
-- watchlisted intraday that no active user held at nightly time).
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/
-- writes this table. Safe to re-run (idempotent).
--
-- articles shape: jsonb array of objects mirroring the fields needed to rebuild a
-- SocialMention, e.g.
--   [{"text":"Headline. Summary","headline":"Headline","source":"finnhub:CNBC",
--     "url":"https://...","created_at":"2026-06-29T11:00:00+00:00","weight":1.0}]

create table if not exists public.finnhub_news_cache (
  ticker      text primary key,
  articles    jsonb not null default '[]'::jsonb,
  fetched_at  timestamptz not null default now()
);

-- Refresh reads filter by fetched_at freshness; index keeps that cheap.
create index if not exists finnhub_news_cache_fetched_at_idx
  on public.finnhub_news_cache (fetched_at);

-- The backend connects as service_role (service key) and needs table privileges
-- (these are not always auto-granted on newly created tables).
grant select, insert, update on public.finnhub_news_cache to service_role;

-- Lock the table down to the backend only: enable RLS with no policies, so anon/
-- authenticated are denied while service_role bypasses RLS. This is an internal
-- cache, never read directly by the frontend.
alter table public.finnhub_news_cache enable row level security;
