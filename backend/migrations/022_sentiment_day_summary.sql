-- Generated day summaries: one paragraph per ticker per calendar day.
--
-- The prose behind clicking a bar on the sentiment trend chart. Everything it is written
-- from already exists: social_sentiment_daily (migrations/019) holds the day's score,
-- counts and top posts, news_sentiment_daily (021) holds the same for articles. So
-- generating a summary reads two rows and writes one, and never fetches anything.
--
-- This table exists so that a day is paid for once. A summary costs an LLM call, and a
-- reader clicking back and forth across a week would otherwise re-bill every bar on every
-- click. Cached prose is also STABLE prose, which matters more than the money: a day that
-- reworded itself each time you looked at it would not be a record of that day.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/writes it,
-- and before setting DAY_SUMMARY_ENABLED=true. Until that flag is on the backend never
-- touches this table. Safe to re-run (idempotent).


-- ── the table ────────────────────────────────────────────────────────────────
-- Keyed (ticker, as_of_day) like both tables it reads from. Note as_of_day, matching 021
-- rather than 019's as_of_night: that column is named for a nightly job that no longer
-- describes when the rows are written, and there is no reason to spread the older name
-- any further.
create table if not exists public.sentiment_day_summary (
  ticker        text not null,
  as_of_day     date not null,
  summary       text not null,

  -- Whether the day is settled. False means the day was still in progress when this was
  -- written, so it is a reading of a partial day and may be replaced. True means the day
  -- is over, its rows are complete, and this is the last word on it.
  is_final      boolean not null default false,

  -- What the summary was written FROM, not a copy of the day's data for its own sake.
  -- These four are the evidence fingerprint: they are the only thing that can answer
  -- "has anything happened since, that would make this paragraph wrong?" without paying
  -- for a second generation to find out. See the regeneration rule below.
  news_count    integer not null default 0,
  post_count    integer not null default 0,
  news_score    integer,
  social_score  integer,

  -- Which model wrote it. When a model change turns out to have degraded the prose, this
  -- is what makes the bad batch selectable instead of guessable. The house has been bitten
  -- by ungenerated-provenance before: the LLM fund descriptions in migrations/011 had to be
  -- withdrawn wholesale because nothing recorded which rows came from where.
  model         text,
  generated_at  timestamptz not null default now(),

  constraint sentiment_day_summary_ticker_day_key unique (ticker, as_of_day)
);

-- One ticker's trailing days, which is the only read shape: the endpoint asks for one
-- (ticker, day) and the top-up job asks for one ticker's window.
create index if not exists sentiment_day_summary_ticker_day_idx
  on public.sentiment_day_summary (ticker, as_of_day desc);

-- Which tickers anyone has ever looked at. The top-up job's one question, and the reason
-- it never spends a token on a ticker nobody has opened.
create index if not exists sentiment_day_summary_ticker_idx
  on public.sentiment_day_summary (ticker);

grant select, insert, update, delete on public.sentiment_day_summary to service_role;

-- Internal table, same as the day tables it reads: RLS on with no policies denies anon and
-- authenticated outright, while service_role bypasses RLS. The frontend reads this only
-- through the sentiment-summary endpoint, never directly.
alter table public.sentiment_day_summary enable row level security;


-- ── the merge ────────────────────────────────────────────────────────────────
-- The house pattern once more, after reserve_nlp_units (016), accumulate_social_days (019)
-- and upsert_news_days (021): one call for a batch of rows, merged in Postgres under the
-- row lock the unique constraint gives us, with a guard in the WHERE clause deciding which
-- of two writers wins.
--
-- Here the guard is `where t.is_final = false`, and it is the whole cost control of the
-- feature rather than a defensive nicety. Three writers can land on the same (ticker, day):
-- the lazy generation behind a click, the scheduled top-up, and a second click racing the
-- first. Without the guard each of them would overwrite a perfectly good settled paragraph,
-- and a day that has been generated a hundred times has been billed a hundred times.
--
-- With it, a row that has gone final is immutable. That is a stronger rule than "do not
-- regenerate", because it holds even when the caller's own staleness check is wrong, and it
-- holds against a caller that has not been written yet.
--
-- Deliberately NOT guarded on generated_at being newer. Time-based guards need the writers'
-- clocks to agree, and the question here is not which write is newer but whether the day is
-- still open at all.
--
-- To rewrite a settled day on purpose, for a bad model batch, clear the flag first:
--   update public.sentiment_day_summary set is_final = false where model = '<bad model>';
create or replace function public.upsert_day_summaries(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  merged integer := 0;
begin
  insert into public.sentiment_day_summary as t (
    ticker, as_of_day, summary, is_final,
    news_count, post_count, news_score, social_score,
    model, generated_at
  )
  select
    upper(r->>'ticker'),
    (r->>'as_of_day')::date,
    r->>'summary',
    coalesce((r->>'is_final')::boolean, false),
    coalesce((r->>'news_count')::integer, 0),
    coalesce((r->>'post_count')::integer, 0),
    nullif(r->>'news_score', '')::integer,
    nullif(r->>'social_score', '')::integer,
    nullif(r->>'model', ''),
    now()
  from jsonb_array_elements(p_rows) as r
  where coalesce(r->>'summary', '') <> ''
  on conflict on constraint sentiment_day_summary_ticker_day_key do update
    set summary      = excluded.summary,
        is_final     = excluded.is_final,
        news_count   = excluded.news_count,
        post_count   = excluded.post_count,
        news_score   = excluded.news_score,
        social_score = excluded.social_score,
        model        = excluded.model,
        generated_at = now()
    where t.is_final = false;

  get diagnostics merged = row_count;
  return merged;
end;
$$;

grant execute on function public.upsert_day_summaries(jsonb) to service_role;
