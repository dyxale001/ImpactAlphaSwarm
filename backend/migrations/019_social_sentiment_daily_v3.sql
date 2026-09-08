-- Social sentiment history, third attempt: one row per ticker per calendar day.
--
-- migrations/015 tried this with two tables and a seed crawl. The crawl is what killed
-- it: the first time it saw a ticker it walked back twelve pages to fill the whole
-- window at once, and on night one no ticker had stored posts, so all thirty seeded
-- together. Thirty tickers times twelve pages is 360 requests, and with a one second
-- process wide floor between StockTwits calls that is six minutes of pure sleeping
-- before a single response is counted. It was roughly ten of the eighteen minutes that
-- run took, and it was reverted in d110700.
--
-- The seed is not gone here, but it has moved out of the analysis run. Runs accumulate
-- the current day from posts they were going to fetch anyway; a separate scheduler job
-- and a lazy per ticker seed do the backwards walking, and neither is reachable from
-- SentimentScout. Nothing that crawls can touch a path anyone waits on.
--
-- Run this in the Supabase SQL editor BEFORE setting SOCIAL_HISTORY_ENABLED=true. Until
-- then the backend never touches these tables. Safe to re-run (idempotent), and correct
-- whether or not 015 was ever applied. It supersedes 017, which was never applied and
-- would now drop a live table.


-- ── the one table ────────────────────────────────────────────────────────────
-- Created in full for a database that never saw 015. A database that did see 015
-- already has the first six columns and gets the rest from the alters below.
--
-- The date discriminator is in the unique key, which is the lesson of migrations/013
-- and the reason this table can be written to more than once a day without a run
-- destroying the one before it.
--
-- The column is still named as_of_night rather than as_of_day. 015 named it that and
-- renaming would make the upgrade path conditional for no benefit; read it as "the
-- UTC calendar day this row covers".
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

-- Running sums rather than a stored average. The scout runs on every user refresh as
-- well as nightly, and each run sees only the posts still in its page window, so a day
-- has to be ACCUMULATED rather than overwritten. Keeping the numerator and the
-- denominator separately is what lets a second sample be added to a first without
-- either re-reading the posts or losing the earlier ones.
--
-- This is only valid because the daily aggregator switches recency decay off within a
-- day: a post's weight must not change between samples or the sums stop meaning
-- anything.
alter table public.social_sentiment_daily
  add column if not exists weight_sum real not null default 0;
alter table public.social_sentiment_daily
  add column if not exists weighted_score_sum real not null default 0;

-- The high water mark, and the reason there is no raw post table. StockTwits message
-- ids are monotonic, so "count only the posts above the last id we counted" is exact
-- deduplication in a single integer. Re-running a refresh an hour later adds only what
-- is genuinely new, and re-running it immediately adds nothing at all.
alter table public.social_sentiment_daily
  add column if not exists last_message_id bigint not null default 0;

-- That day's top fifteen posts by influence. Fifteen rows of JSON is what replaces the
-- whole stocktwits_message_cache table: enough to read under the chart when a day is
-- clicked, small enough that nobody has to explain a post archive in six months.
alter table public.social_sentiment_daily
  add column if not exists top_posts jsonb not null default '[]'::jsonb;

-- Reserved and deliberately unwritten. The LLM overview of what people said that day is
-- deferred until the pipeline is settled. A nullable column costs nothing and means
-- adding it later needs no second hand-run migration.
alter table public.social_sentiment_daily
  add column if not exists summary text;

-- New in v3, and load bearing for the lazy seed.
--
-- A day with no posts writes no row, and the serving side pads the window instead. That
-- is right for the chart but it makes "has this ticker ever been seeded?" unanswerable
-- from the rows alone: a genuinely silent ticker looks identical to one nobody has ever
-- crawled, so it would re-crawl on every single page load forever. 015 hit this exact
-- trap and its _top_up docstring records rejecting a near identical rule for it.
--
-- A seed therefore always writes at least one row for the ticker, even when the whole
-- window was silent, with this set. Its presence means "we have walked this ticker's
-- history"; its absence means "we never have".
alter table public.social_sentiment_daily
  add column if not exists seeded_at timestamptz;

-- The endpoint reads one ticker's trailing few days; the write reads the same slice for
-- every ticker in a run at once.
create index if not exists social_sentiment_daily_ticker_night_idx
  on public.social_sentiment_daily (ticker, as_of_night desc);

-- The backfill's one question: which of these tickers has never been seeded? Partial,
-- because it only ever reads the rows that have the mark.
create index if not exists social_sentiment_daily_seeded_idx
  on public.social_sentiment_daily (ticker)
  where seeded_at is not null;


-- ── accumulating a day atomically ────────────────────────────────────────────
-- A day is written by the nightly batch, by every user refresh, and by the backfill,
-- so two writers landing on the same (ticker, day) is ordinary rather than exotic.
-- Read-modify-write in Python loses an increment when that happens. It is only a
-- slightly low count on a chart rather than corruption, but the fix is cheap and the
-- house already has the pattern: migrations/016 does exactly this for the NLP budget
-- with a row lock.
--
-- The high water mark is the guard that makes this idempotent: a sample whose newest
-- message id is not above what has already been counted contributes nothing, so
-- refreshing twice in a minute is a no-op rather than a double count.
--
-- accumulate_social_day below is the single row form. Callers use
-- accumulate_social_days, which takes a whole run's worth in one array: a run covers
-- thirty tickers, and thirty round trips to save one is the wrong trade in a service
-- where save_top_assets already demonstrated what per ticker chatter costs.


-- The 0 to 100 score from a day's running sums. The same mapping MentionScorer applies
-- to its own average, so a day's number and a run's number mean the same thing on the
-- same scale. Kept as its own function so the SQL and the Python cannot drift, and
-- defined first because accumulate_social_day below calls it.
create or replace function public.social_day_score(
  p_weighted_score_sum real,
  p_weight_sum real
)
returns integer
language sql
immutable
as $$
  select case
    when p_weight_sum <= 0 then null
    else round(
      greatest(0.0, least(1.0, ((p_weighted_score_sum / p_weight_sum) + 1.0) / 2.0)) * 100
    )::integer
  end;
$$;

create or replace function public.accumulate_social_day(
  p_ticker              text,
  p_day                 date,
  p_post_count          integer,
  p_bullish             integer,
  p_bearish             integer,
  p_weight_sum          real,
  p_weighted_score_sum  real,
  p_last_message_id     bigint,
  p_top_posts           jsonb,
  p_seeded              boolean default false
)
returns public.social_sentiment_daily
language plpgsql
as $$
declare
  existing public.social_sentiment_daily;
  merged   public.social_sentiment_daily;
  new_weight_sum real;
  new_score_sum  real;
begin
  select * into existing
    from public.social_sentiment_daily
   where ticker = upper(p_ticker) and as_of_night = p_day
     for update;

  if not found then
    insert into public.social_sentiment_daily (
      ticker, as_of_night, post_count, bullish_posts, bearish_posts,
      weight_sum, weighted_score_sum, last_message_id, top_posts,
      social_sentiment_score, seeded_at, updated_at
    ) values (
      upper(p_ticker), p_day, p_post_count, p_bullish, p_bearish,
      p_weight_sum, p_weighted_score_sum, p_last_message_id, coalesce(p_top_posts, '[]'::jsonb),
      public.social_day_score(p_weighted_score_sum, p_weight_sum),
      case when p_seeded then now() else null end, now()
    )
    returning * into merged;
    return merged;
  end if;

  -- Nothing newer than what is already counted. Leave the row exactly as it stands,
  -- except for the seed mark, which a seed is entitled to set even on a day it added
  -- no posts to: that is how a silent ticker records that it was walked.
  if p_last_message_id <= existing.last_message_id then
    if p_seeded and existing.seeded_at is null then
      update public.social_sentiment_daily
         set seeded_at = now(), updated_at = now()
       where ticker = existing.ticker and as_of_night = existing.as_of_night
      returning * into merged;
      return merged;
    end if;
    return existing;
  end if;

  new_weight_sum := round((existing.weight_sum + p_weight_sum)::numeric, 4);
  new_score_sum  := round((existing.weighted_score_sum + p_weighted_score_sum)::numeric, 4);

  -- top_posts is replaced, not merged. A walk always starts at the head, so any sample
  -- that stayed inside its page cap has seen the whole day and its top posts are the
  -- true ones. Merging instead would mean reading every stored post back on every run,
  -- which is the cost this whole design exists to avoid.
  update public.social_sentiment_daily
     set post_count         = existing.post_count + p_post_count,
         bullish_posts      = existing.bullish_posts + p_bullish,
         bearish_posts      = existing.bearish_posts + p_bearish,
         weight_sum         = new_weight_sum,
         weighted_score_sum = new_score_sum,
         social_sentiment_score = public.social_day_score(new_score_sum, new_weight_sum),
         last_message_id    = greatest(existing.last_message_id, p_last_message_id),
         top_posts          = coalesce(p_top_posts, existing.top_posts),
         seeded_at          = case when p_seeded then now() else existing.seeded_at end,
         updated_at         = now()
   where ticker = existing.ticker and as_of_night = existing.as_of_night
  returning * into merged;

  return merged;
end;
$$;

-- A whole run's day rows in one call. The Python side builds an array of objects with
-- the same keys the single row function takes, and this loops them.
--
-- One round trip for thirty tickers rather than thirty. Each row still takes its own
-- lock in turn, so this is a batch for the network's sake and not one big transaction
-- that would hold thirty locks at once.
--
-- Returns how many rows it touched, which is what the caller logs.
create or replace function public.accumulate_social_days(p_rows jsonb)
returns integer
language plpgsql
as $$
declare
  item    jsonb;
  touched integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  for item in select * from jsonb_array_elements(p_rows)
  loop
    perform public.accumulate_social_day(
      item->>'ticker',
      (item->>'as_of_night')::date,
      coalesce((item->>'post_count')::integer, 0),
      coalesce((item->>'bullish_posts')::integer, 0),
      coalesce((item->>'bearish_posts')::integer, 0),
      coalesce((item->>'weight_sum')::real, 0),
      coalesce((item->>'weighted_score_sum')::real, 0),
      coalesce((item->>'last_message_id')::bigint, 0),
      coalesce(item->'top_posts', '[]'::jsonb),
      coalesce((item->>'seeded')::boolean, false)
    );
    touched := touched + 1;
  end loop;

  return touched;
end;
$$;


-- Marks a ticker as walked when the whole window came back silent, so it is not
-- re-crawled on every page load. Writes the mark on today's row and nothing else.
create or replace function public.mark_social_seeded(p_ticker text, p_day date)
returns void
language plpgsql
as $$
begin
  insert into public.social_sentiment_daily (ticker, as_of_night, seeded_at, updated_at)
  values (upper(p_ticker), p_day, now(), now())
  on conflict (ticker, as_of_night)
  do update set seeded_at = coalesce(public.social_sentiment_daily.seeded_at, now()),
                updated_at = now();
end;
$$;


-- ── the raw post table goes ──────────────────────────────────────────────────
-- 015 stored every post so a backfill could be bucketed by day. Nothing reads it now
-- and nothing will: the day rows are built from posts already in memory, and the only
-- post text kept is the fifteen on each row above.
--
-- This destroys the posts 015 collected. They are already unreferenced by any code on
-- main, and re-fetching them was never possible past what StockTwits still serves, so
-- there is nothing here to preserve. Take a Supabase backup first if there is any doubt.
drop table if exists public.stocktwits_message_cache;


-- ── access ───────────────────────────────────────────────────────────────────
-- The backend connects as service_role and these are not always auto-granted on a newly
-- created table. delete is required: rows past the retention window are pruned by age.
grant select, insert, update, delete on public.social_sentiment_daily to service_role;
grant execute on function public.accumulate_social_day(
  text, date, integer, integer, integer, real, real, bigint, jsonb, boolean
) to service_role;
grant execute on function public.accumulate_social_days(jsonb) to service_role;
grant execute on function public.social_day_score(real, real) to service_role;
grant execute on function public.mark_social_seeded(text, date) to service_role;

-- Backend only. RLS on with no policies denies anon and authenticated outright while
-- service_role bypasses it. The frontend reads this through
-- /api/assets/{ticker}/sentiment-history, never directly.
alter table public.social_sentiment_daily enable row level security;
