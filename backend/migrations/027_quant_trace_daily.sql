-- The Quant tab's reasoning trace: one paragraph per ticker per day per horizon.
--
-- D-125 gives every tab of the asset page its own reasoning trace. The sentiment tab's is
-- the day summary (migrations/022); this is the quant tab's. It is written over the price
-- window the tab draws (closes and RSI over 1M, 6M, 3Y or 5Y, fetched from yfinance and
-- never stored) plus the run's own stored measurements for the ticker, and nothing else.
--
-- Why a table at all when the window itself is not stored: a paragraph costs a model
-- call, and a reader switching 1M to 6M and back would otherwise re-bill every switch. A
-- day's closes do not change once the session has ended, so a paragraph written over
-- them is stable prose, and stable prose is what makes it a record rather than a reply.
--
-- Why the horizon is in the key: the same ticker on the same day has four different
-- windows, and "over the last month" and "over the last five years" are different
-- paragraphs about different facts.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/writes it,
-- and before setting QUANT_TRACE_ENABLED=true. Until that flag is on the backend never
-- touches this table. Safe to re-run (idempotent).


-- ── the table ────────────────────────────────────────────────────────────────
create table if not exists public.quant_trace_daily (
  ticker        text not null,
  as_of_day     date not null,
  horizon       text not null check (horizon in ('1M', '6M', '3Y', '5Y')),
  trace         text not null,

  -- Who wrote it. 'model' is the language model, checked before storing: every number
  -- in the paragraph must appear in the facts it was given, and advice or forward
  -- looking words fail it. 'template' is the deterministic paragraph built from the
  -- same facts when the model was unconfigured, failed, or was rejected. Shown to the
  -- reader as a badge, so a templated paragraph is never passed off as a written one.
  source        text not null check (source in ('model', 'template')),
  model         text,

  -- What the paragraph was written FROM, kept beside it. Provenance first: when a model
  -- change degrades the prose, this is what makes the bad batch selectable; and a
  -- reviewer can check any sentence against the figures it was allowed to use.
  facts         jsonb,
  generated_at  timestamptz not null default now(),

  constraint quant_trace_daily_key unique (ticker, as_of_day, horizon)
);

-- One ticker's recent traces, which is the only read shape: the endpoint asks for one
-- (ticker, day, horizon) and the prune walks by day.
create index if not exists quant_trace_daily_ticker_day_idx
  on public.quant_trace_daily (ticker, as_of_day desc);

grant select, insert, update, delete on public.quant_trace_daily to service_role;

-- Internal table, same as the day tables and summaries: RLS on with no policies denies
-- anon and authenticated outright, while service_role bypasses RLS. The frontend reads
-- this only through the quant-trace endpoint, never directly.
alter table public.quant_trace_daily enable row level security;


-- ── the merge ────────────────────────────────────────────────────────────────
-- The house pattern, after upsert_day_summaries (022): one call for a batch of rows,
-- merged in Postgres under the row lock the unique constraint gives us, with a guard in
-- the WHERE clause deciding which of two writers wins.
--
-- Here the guard is `where t.source = 'template' and excluded.source = 'model'`. A model
-- written paragraph is final the moment it lands and is never overwritten, which is the
-- cost control: two clicks racing each other, or a scheduled writer arriving later, cannot
-- bill the same window twice. A templated paragraph is the one thing a later writer may
-- replace, and only with a model written one: the template stood in because the model
-- could not, and the upgrade is the whole reason the source column exists.
create or replace function public.upsert_quant_traces(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  merged integer := 0;
begin
  insert into public.quant_trace_daily as t (
    ticker, as_of_day, horizon, trace, source, model, facts, generated_at
  )
  select
    upper(r->>'ticker'),
    (r->>'as_of_day')::date,
    upper(r->>'horizon'),
    r->>'trace',
    r->>'source',
    nullif(r->>'model', ''),
    r->'facts',
    now()
  from jsonb_array_elements(p_rows) as r
  where coalesce(r->>'trace', '') <> ''
    and r->>'source' in ('model', 'template')
  on conflict on constraint quant_trace_daily_key do update
    set trace        = excluded.trace,
        source       = excluded.source,
        model        = excluded.model,
        facts        = excluded.facts,
        generated_at = now()
    where t.source = 'template' and excluded.source = 'model';

  get diagnostics merged = row_count;
  return merged;
end;
$$;

grant execute on function public.upsert_quant_traces(jsonb) to service_role;
