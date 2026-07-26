-- Unified ranking v2 (D-087 → D-099+): persistence for the disclosed four-term
-- feed ordering that replaces the 0-100 confidence score.
--
-- PURELY ADDITIVE. Every new `ai_recommendation` column is nullable, so existing
-- rows stay valid and the frontend keeps its legacy fallback (the same pattern
-- migration 004 used). Nothing here changes behaviour on its own — the agent
-- stays dormant until UNIFIED_RANKING_ENABLED is set.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes
-- these columns. Safe to re-run (idempotent).

-- ── ai_recommendation: the disclosed terms for the persisted top 5 ───────────
-- rank_score is a SORT KEY, never a user-facing grade. The raw leans are stored
-- alongside it deliberately: the open direction question (plan §13 R1 — should a
-- strongly bearish asset rank high?) can then be settled by replaying stored
-- numbers, with no need to re-run the pipeline.
alter table public.ai_recommendation
  add column if not exists rank_score        double precision,
  add column if not exists signal_strength   double precision,
  add column if not exists signal_direction  text,           -- favourable | unfavourable | neutral
  add column if not exists convergence       double precision,
  add column if not exists convergence_state text,           -- agree_strongly | lean_together | mixed | conflict
  add column if not exists data_sufficiency  double precision,
  add column if not exists profile_fit       double precision,
  add column if not exists quant_lean        double precision,
  add column if not exists sent_lean         double precision,
  add column if not exists combined_lean     double precision,
  add column if not exists quant_state       text,           -- cross_sectional | insufficient_universe | no_data | unmeasured
  add column if not exists ranking_version   text,
  add column if not exists ranking_weights   jsonb,          -- the weights actually used (disclosure)
  add column if not exists strength_variants jsonb;          -- {shift, clip, abs} for post-hoc R1 replay

-- The backend connects as service_role. Writing NEW columns needs UPDATE as well
-- as INSERT, and that is not always already granted — migration 009 hit exactly
-- this and failed with "permission denied for table assets" (42501) while
-- inserts still succeeded. Granted explicitly here so the same trap can't recur.
grant select, insert, update on public.ai_recommendation to service_role;

-- ── ranking_shadow: EVERY candidate, not just the surviving top 5 ────────────
-- `ai_recommendation` holds only the top 5 (D-079), which makes two questions
-- unanswerable from it:
--   * R1 (direction): a strongly bearish asset never reaches a top 5, so the
--     failure mode is invisible in that table.
--   * R3 (convergence): divergent hype names were already demoted out by the old
--     hype penalty, so convergence never appeared to fire — in 75 persisted rows
--     it did not trigger once.
-- Logging all ~30 scoped candidates per run makes both measurable. Volume is
-- trivial (~30 x active users per night) and rows are replaced per run.
create table if not exists public.ranking_shadow (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.ai_runs (id) on update cascade on delete cascade,
  ticker            text not null,
  -- legacy score for the side-by-side comparison
  legacy_score      double precision,
  legacy_rank       integer,
  -- v2 terms
  rank_score        double precision,
  v2_rank           integer,
  signal_strength   double precision,
  signal_direction  text,
  convergence       double precision,
  convergence_state text,
  data_sufficiency  double precision,
  profile_fit       double precision,
  quant_lean        double precision,
  sent_lean         double precision,
  combined_lean     double precision,
  quant_state       text,
  strength_variants jsonb,
  ranking_version   text,
  ranking_weights   jsonb,
  risk_tolerance    text,
  created_at        timestamptz not null default now(),
  constraint ranking_shadow_run_ticker_key unique (run_id, ticker)
);

-- Shadow reports read per run, and sweep by recency.
create index if not exists ranking_shadow_run_idx on public.ranking_shadow (run_id);
create index if not exists ranking_shadow_created_idx on public.ranking_shadow (created_at desc);

grant select, insert, update, delete on public.ranking_shadow to service_role;

-- Internal analysis table, never read by the frontend: RLS on with no policies,
-- so anon/authenticated are denied while service_role bypasses RLS.
alter table public.ranking_shadow enable row level security;
