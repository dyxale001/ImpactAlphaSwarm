-- Social sentiment history: keep StockTwits posts instead of throwing them away,
-- so the UI can show how retail sentiment moved over the last two weeks.
--
-- Today the social signal has no memory at all. The collector re-fetches the 60
-- newest posts per ticker on every run, scores them, and discards the posts. The
-- resulting score lands in ai_recommendation, which is then destroyed on the next
-- run: save_top_assets deletes the whole run_id slice before inserting, and
-- acquire_ai_run reuses each user's run_id every night. So each night silently
-- overwrites the night before -- the same defect migrations/013 documents for
-- ranking_shadow -- and there is nowhere a per-ticker social score with a
-- timestamp has ever been stored.
--
-- A second, quieter cost rides along. Unlike news (see migrations/003 and /010),
-- StockTwits has no cache, so those 60 posts are re-downloaded on the nightly run
-- AND on every manual refresh, even though roughly 55 of them were already
-- downloaded the night before. That waste is exactly why we cannot currently
-- afford to page deeper into the stream.
--
-- Both problems have one fix: persist posts keyed by the StockTwits message id.
-- Dedupe becomes free (ask the API only for ids above the high-water mark), which
-- pays for a one-off deeper backfill, and because every post carries its OWN
-- created_at, that backfill can be bucketed by day to populate 14 days of history
-- immediately rather than waiting a fortnight for it to accumulate.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/
-- writes these tables. Safe to re-run (idempotent).


-- ── raw posts ────────────────────────────────────────────────────────────────
-- One row per StockTwits message. message_id is the API's own id and is what makes
-- re-fetching impossible: an insert conflict means we already held the post.
-- created_at is the post's own timestamp (NOT when we fetched it) -- that is the
-- column the daily buckets are built from, and the reason seeding works at all.
create table if not exists public.stocktwits_message_cache (
  message_id          bigint primary key,
  ticker              text not null,
  created_at          timestamptz not null,
  body                text not null default '',
  username            text,
  url                 text,
  likes               integer not null default 0,
  reshares            integer not null default 0,
  replies             integer not null default 0,
  declared_sentiment  text,
  -- Scored once on ingest so rebuilding a rollup never re-runs the models.
  sentiment_score     real,
  fetched_at          timestamptz not null default now()
);

-- The scoring window and the daily rollups both read "this ticker, newest first".
create index if not exists stocktwits_message_cache_ticker_created_idx
  on public.stocktwits_message_cache (ticker, created_at desc);

-- The high-water mark read: max(message_id) for a ticker, before every top-up.
create index if not exists stocktwits_message_cache_ticker_id_idx
  on public.stocktwits_message_cache (ticker, message_id desc);

-- Pruning sweeps by age across all tickers.
create index if not exists stocktwits_message_cache_created_idx
  on public.stocktwits_message_cache (created_at);


-- ── daily rollup ─────────────────────────────────────────────────────────────
-- What the chart actually reads: one row per ticker per day. Derived from the raw
-- table and always safe to recompute, so a bad scoring change can be corrected
-- without re-fetching anything.
--
-- The date discriminator is in the unique key from day one, deliberately: this is
-- the lesson of migrations/013, where a key without one meant every night
-- destroyed the night before it.
create table if not exists public.social_sentiment_daily (
  ticker                  text not null,
  as_of_night             date not null,
  social_sentiment_score  integer,
  post_count              integer not null default 0,
  bullish_posts           integer not null default 0,
  bearish_posts           integer not null default 0,
  updated_at              timestamptz not null default now(),
  constraint social_sentiment_daily_ticker_night_key unique (ticker, as_of_night)
);

-- The endpoint reads one ticker's trailing N days.
create index if not exists social_sentiment_daily_ticker_night_idx
  on public.social_sentiment_daily (ticker, as_of_night desc);

-- The backend connects as service_role (service key) and needs table privileges
-- (these are not always auto-granted on newly created tables). delete is required:
-- raw posts are pruned by age, and a rollup slice is cleared before it is rewritten.
grant select, insert, update, delete on public.stocktwits_message_cache to service_role;
grant select, insert, update, delete on public.social_sentiment_daily   to service_role;

-- Lock both tables down to the backend: RLS enabled with no policies, so anon/
-- authenticated are denied while service_role bypasses RLS. The frontend reads the
-- history through /api/assets/{ticker}/sentiment-history, never directly.
alter table public.stocktwits_message_cache enable row level security;
alter table public.social_sentiment_daily   enable row level security;
