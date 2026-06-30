-- Per-ticker cache of tier-1 news pulled from Marketaux on the nightly batch run.
--
-- Marketaux is only called once per night (with deep pagination), so user
-- refreshes must NOT re-hit the API. Instead the nightly run writes each ticker's
-- tier-1 articles here, and refreshes read them back so tier-1 stays visible
-- without spending the tight Marketaux call budget.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/
-- writes this table. Safe to re-run (idempotent).
--
-- articles shape: jsonb array of objects mirroring the fields needed to rebuild a
-- SocialMention, e.g.
--   [{"text":"Headline. Summary","source":"marketaux:CNBC",
--     "url":"https://...","created_at":"2026-06-29T11:00:00+00:00","weight":1.0}]

create table if not exists public.marketaux_news_cache (
  ticker      text primary key,
  articles    jsonb not null default '[]'::jsonb,
  fetched_at  timestamptz not null default now()
);

-- Refresh reads filter by fetched_at freshness; index keeps that cheap.
create index if not exists marketaux_news_cache_fetched_at_idx
  on public.marketaux_news_cache (fetched_at);

-- The backend connects as service_role (service key) and needs table privileges
-- (these are not always auto-granted on newly created tables).
grant select, insert, update on public.marketaux_news_cache to service_role;

-- Lock the table down to the backend only: enable RLS with no policies, so anon/
-- authenticated are denied while service_role bypasses RLS. This is an internal
-- cache, never read directly by the frontend.
alter table public.marketaux_news_cache enable row level security;
