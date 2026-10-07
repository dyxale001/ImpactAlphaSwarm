-- The Compare page's written comparison: one paragraph per set of stocks per day per horizon.
--
-- D-220 adds a standalone comparison page. Each row on it carries a templated note; this
-- table holds the one paragraph above the rows, "What separates these", written from the
-- same price windows the Quant tab draws (fetched from yfinance, never stored) plus each
-- stock's user-independent run measurements, and nothing else.
--
-- Why the set is the key, sorted: the paragraph is the same for everyone comparing the
-- same stocks on the same day, whatever order they picked them in, so AAPL|GOOGL is one
-- row and one model call. Nothing personal goes in (no percentiles, no scorecard, no
-- place in a run), which is what makes sharing it correct.
--
-- Numbered 035 because 031 is already used twice (main and the macro branch) and the
-- fund page plan holds 032 to 034.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/writes it,
-- and before setting COMPARE_TRACE_ENABLED=true. Until that flag is on the backend never
-- touches this table. Safe to re-run (idempotent).


-- ── the table ────────────────────────────────────────────────────────────────
create table if not exists public.comparison_trace_daily (
  -- Tickers, upper-cased, sorted and joined with '|': 'AAPL|GOOGL'.
  set_key       text not null,
  as_of_day     date not null,
  horizon       text not null check (horizon in ('1M', '6M', '3Y', '5Y')),
  trace         text not null,

  -- 'model' is the language model, checked before storing: every number must appear in
  -- the facts, every stock must be named, and advice or verdict words ("better",
  -- "outperform", "buy") fail it. 'template' is the deterministic paragraph from the same
  -- facts. Shown to the reader as a badge either way.
  source        text not null check (source in ('model', 'template')),
  model         text,

  -- What the paragraph was written FROM, kept beside it for review.
  facts         jsonb,
  generated_at  timestamptz not null default now(),

  constraint comparison_trace_daily_key unique (set_key, as_of_day, horizon)
);

create index if not exists comparison_trace_daily_day_idx
  on public.comparison_trace_daily (as_of_day desc);

grant select, insert, update, delete on public.comparison_trace_daily to service_role;

-- Internal table: RLS on with no policies denies anon and authenticated outright, while
-- service_role bypasses RLS. The page reads it only through /api/compare/trace.
alter table public.comparison_trace_daily enable row level security;


-- ── the merge ────────────────────────────────────────────────────────────────
-- After upsert_quant_traces (027): a model-written paragraph is final the moment it lands,
-- so two readers racing cannot bill the same set twice; a templated one may be upgraded
-- to a model-written one later the same day, and nothing else may replace anything.
create or replace function public.upsert_comparison_traces(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  merged integer := 0;
begin
  insert into public.comparison_trace_daily as t (
    set_key, as_of_day, horizon, trace, source, model, facts, generated_at
  )
  select
    upper(r->>'set_key'),
    (r->>'as_of_day')::date,
    upper(r->>'horizon'),
    r->>'trace',
    r->>'source',
    nullif(r->>'model', ''),
    r->'facts',
    now()
  from jsonb_array_elements(p_rows) as r
  where coalesce(r->>'trace', '') <> ''
    and coalesce(r->>'set_key', '') <> ''
    and r->>'source' in ('model', 'template')
  on conflict on constraint comparison_trace_daily_key do update
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

grant execute on function public.upsert_comparison_traces(jsonb) to service_role;
