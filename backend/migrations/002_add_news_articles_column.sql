-- Adds a per-article transparency list to ai_recommendation so the UI can show
-- each news article's publisher, reliability tier, publish date, headline and
-- link (not just aggregate scores).
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes
-- this column, otherwise the nightly insert will fail on the unknown column.
-- Safe to re-run (idempotent).
--
-- Shape: jsonb array of objects, e.g.
--   [{"source":"Reuters","tier":1,"date":"2026-06-28",
--     "headline":"...","url":"https://...","sentiment":"Positive",
--     "sentiment_score":72.0}]

alter table public.ai_recommendation
  add column if not exists news_articles jsonb not null default '[]'::jsonb;
