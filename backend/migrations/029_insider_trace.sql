-- The Insider trading tab's AI summary, stored on the insider cache row it was written
-- from. Same columns and the same reasoning as migrations/028 for the Big investors tab.
--
-- The dealings are refetched from Finnhub whenever their TTL runs out, but the summary
-- is a function of the dealings themselves, judged against each other's dates and never
-- against today. A refetch that brings no new filing hashes the same, so the summary is
-- written once and only rewritten when a new filing arrives.
--
-- The dealings refresh upserts only (ticker, transactions, source, fetched_at), so it
-- never clears these columns.
--
-- Run this in the Supabase SQL editor BEFORE setting WHALE_INSIDER_TRACE_ENABLED=true.
-- Until that flag is on the backend never touches these columns. Safe to re-run.

alter table public.insider_transactions_cache
  add column if not exists trace              text,
  add column if not exists trace_source       text
    check (trace_source is null or trace_source in ('model', 'template')),
  add column if not exists trace_model        text,
  add column if not exists trace_fingerprint  text,
  add column if not exists trace_facts        jsonb,
  add column if not exists trace_generated_at timestamptz;
