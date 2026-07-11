-- Adds a per-post transparency list to ai_recommendation so the UI can show each
-- StockTwits post's author, date, text, link and sentiment (not just aggregate
-- bullish/bearish counts) — mirroring news_articles for the social signal.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes
-- this column, otherwise the nightly insert will fail on the unknown column.
-- Safe to re-run (idempotent).
--
-- Shape: jsonb array of objects, e.g.
--   [{"platform":"stocktwits","author":"bull_hunter","date":"2026-06-28",
--     "text":"$NPN looking strong into earnings","url":"https://...",
--     "engagement":12,"sentiment":"Positive","sentiment_score":72.0}]

alter table public.ai_recommendation
  add column if not exists social_posts jsonb not null default '[]'::jsonb;
