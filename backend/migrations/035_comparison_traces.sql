-- The Compare page's written comparison, one per reader: what separates two or three stocks'
-- price windows, and why that reader's own latest analysis placed them where it did.
--
-- D-220 adds a standalone comparison page. Each row on it carries a templated note; this
-- table holds the paragraph above them, "What separates these", written when the reader
-- presses the button. It is personal (it explains the reader's own run), so it is keyed on
-- the reader and never shared.
--
-- One row per reader, set and horizon: the latest paragraph only. The backend serves it
-- again only while it still describes the page, which is what the two checks below are for:
--   * windows: each stock's most recent close date, 'AAPL:2026-10-06|GOOGL:2026-10-06'.
--     A new close for any stock and the page offers the button again.
--   * run_id: the run it explained. A newer completed run and the same.
--
-- Why the set is the key, sorted: AAPL|GOOGL is the same comparison whatever order the
-- reader picked them in.
--
-- Numbered 035 because 031 is already used twice (main and the macro branch) and the
-- fund page plan holds 032 to 034. A first draft of this migration held one shared
-- paragraph per day in comparison_trace_daily and never reached production. If you ran
-- that draft, this drops it. Nothing else reads it.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/writes it,
-- and before setting COMPARE_TRACE_ENABLED=true. Until that flag is on the backend never
-- touches this table. Safe to re-run (idempotent).


-- ── the first draft, gone ────────────────────────────────────────────────────
drop function if exists public.upsert_comparison_traces(jsonb);
drop table if exists public.comparison_trace_daily;


-- ── the table ────────────────────────────────────────────────────────────────
create table if not exists public.comparison_traces (
  user_id       uuid not null references public.users (id) on delete cascade,
  -- Tickers, upper-cased, sorted and joined with '|': 'AAPL|GOOGL'.
  set_key       text not null,
  horizon       text not null check (horizon in ('1M', '6M', '3Y', '5Y')),
  trace         text not null,

  -- 'model' is the language model, checked before storing: every number must appear in
  -- the facts, every stock must be named, and advice, verdict or suitability words
  -- ("buy", "outperform", "suits you") fail it. 'template' is the deterministic paragraph
  -- from the same facts. Shown to the reader as a badge either way.
  source        text not null check (source in ('model', 'template')),
  model         text,

  windows       text not null,
  -- Null when the reader had no completed run, so the paragraph covers prices only.
  run_id        uuid,
  run_at        timestamptz,

  -- What the paragraph was written FROM, kept beside it for review.
  facts         jsonb,
  generated_at  timestamptz not null default now(),

  primary key (user_id, set_key, horizon)
);

-- The backend deletes rows older than 30 days by this.
create index if not exists comparison_traces_generated_idx
  on public.comparison_traces (generated_at);

grant select, insert, update, delete on public.comparison_traces to service_role;

-- Internal table: RLS on with no policies denies anon and authenticated outright, while
-- service_role bypasses RLS. The page reads it only through /api/compare/trace, which
-- takes the reader from their token.
alter table public.comparison_traces enable row level security;
