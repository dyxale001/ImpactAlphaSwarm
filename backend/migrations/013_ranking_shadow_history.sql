-- Unified ranking v2: let ranking_shadow retain MULTIPLE nights, and record the
-- stability-adjusted order alongside the raw one.
--
-- Why (plan §13 R8): the table was keyed UNIQUE (run_id, ticker), but
-- `create_ai_run` reuses each user's run_id — so every night's rows overwrote the
-- previous night's. Multi-night analysis was impossible; the first shadow night
-- survived only because it was snapshotted to a JSON file by hand. Every night
-- that passed without this fix destroyed the night before it.
--
-- A second, quieter defect went with it: the write upserted without clearing, so a
-- ticker that dropped out of a user's candidate set LINGERED under the same run_id
-- with a stale created_at, silently polluting per-run grouping in the reports.
-- The write now deletes the (run_id, night) slice before inserting.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes
-- as_of_night. Safe to re-run (idempotent).

-- ── per-night discriminator ──────────────────────────────────────────────────
-- Existing rows inherit today's date: they ARE the most recent night, so this is
-- accurate rather than merely convenient.
alter table public.ranking_shadow
  add column if not exists as_of_night date not null
    default ((now() at time zone 'utc')::date);

-- Swap the key so distinct nights append instead of overwriting.
alter table public.ranking_shadow
  drop constraint if exists ranking_shadow_run_ticker_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ranking_shadow_run_ticker_night_key'
  ) then
    alter table public.ranking_shadow
      add constraint ranking_shadow_run_ticker_night_key
      unique (run_id, ticker, as_of_night);
  end if;
end $$;

-- Reports read one night of one run, and sweep by night.
create index if not exists ranking_shadow_run_night_idx
  on public.ranking_shadow (run_id, as_of_night);
create index if not exists ranking_shadow_night_idx
  on public.ranking_shadow (as_of_night desc);

-- ── stability-adjusted rank (plan §13 R9) ────────────────────────────────────
-- v2_rank stays the raw score order; v2_rank_stable is the order actually served
-- once the tie-band has held near-equal candidates in yesterday's sequence.
-- Storing both is what lets a shadow night compare legacy vs v2-raw vs v2-stable
-- churn before anyone commits to the mechanism.
alter table public.ranking_shadow
  add column if not exists v2_rank_stable integer;

-- Unchanged from 010, restated because a fresh apply may run only this file.
grant select, insert, update, delete on public.ranking_shadow to service_role;
