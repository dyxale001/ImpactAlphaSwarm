-- Adds the news sub-signal columns to ai_recommendation so the blended
-- sentiment_score can be broken down into its news vs social components.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes
-- these columns, otherwise the nightly insert will fail on unknown columns.
-- Safe to re-run (idempotent).

alter table public.ai_recommendation
  add column if not exists news_sentiment_score   smallint,
  add column if not exists social_sentiment_score smallint,
  add column if not exists news_count             smallint,
  add column if not exists news_bullish           smallint,
  add column if not exists news_bearish           smallint;
