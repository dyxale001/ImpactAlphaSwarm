-- "What's driving the sentiment": one news-only paragraph per ticker per calendar day.
--
-- The paragraph under the day summary on the sentiment tab. Where the summary (022)
-- describes the day's readings, this explains the NEWS behind them: it is written from
-- every article stored on the day's news_sentiment_daily row (021), headline and
-- publisher's summary both, and never from social posts.
--
-- Stored exactly as the summaries are, for exactly the same reasons: a day is paid for
-- once, and a settled day's paragraph is stable rather than rewording itself on every
-- visit. Same columns, same index, same RLS and the same guarded merge as 022, in a table
-- of its own so each paragraph settles independently of the other.
--
-- Generated on key GROQ_API_KEY6 (falling back to GROQ_API_KEY4). Read and written only
-- through the backend; the frontend calls GET /api/assets/{ticker}/sentiment-drivers.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/writes it.
-- Until then the endpoint answers null and the box shows its quiet fallback; nothing
-- errors. Safe to re-run (idempotent).


-- ── the table ────────────────────────────────────────────────────────────────
create table if not exists public.sentiment_day_drivers (
  ticker        text not null,
  as_of_day     date not null,
  -- The paragraph. Named `summary` to match 022 so both tables share one reader and
  -- one merge shape in the backend.
  summary       text not null,

  -- False while the day is still in progress (a provisional "is driving" paragraph);
  -- true once the day is over, after which the row never changes.
  is_final      boolean not null default false,

  -- The evidence fingerprint, as in 022. Only news_count decides regeneration here,
  -- since posts are not part of this paragraph; the other three are kept so the two
  -- tables have one shape.
  news_count    integer not null default 0,
  post_count    integer not null default 0,
  news_score    integer,
  social_score  integer,

  model         text,
  generated_at  timestamptz not null default now(),

  constraint sentiment_day_drivers_ticker_day_key unique (ticker, as_of_day)
);

create index if not exists sentiment_day_drivers_ticker_day_idx
  on public.sentiment_day_drivers (ticker, as_of_day desc);

-- Which tickers anyone has opened, the top-up job's one question.
create index if not exists sentiment_day_drivers_ticker_idx
  on public.sentiment_day_drivers (ticker);

grant select, insert, update, delete on public.sentiment_day_drivers to service_role;

alter table public.sentiment_day_drivers enable row level security;


-- ── the merge ────────────────────────────────────────────────────────────────
-- 022's upsert_day_summaries, pointed at this table. The guard `where t.is_final = false`
-- is the whole cost control: a settled day is immutable, whichever of the lazy click, the
-- scheduled top-up or a racing second click lands on it.
--
-- To rewrite a settled day on purpose, clear the flag first:
--   update public.sentiment_day_drivers set is_final = false where model = '<bad model>';
create or replace function public.upsert_day_drivers(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  merged integer := 0;
begin
  insert into public.sentiment_day_drivers as t (
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
  on conflict on constraint sentiment_day_drivers_ticker_day_key do update
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

grant execute on function public.upsert_day_drivers(jsonb) to service_role;
