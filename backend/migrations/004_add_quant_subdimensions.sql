-- Adds the objective quant sub-dimension columns to ai_recommendation so the UI
-- can show cross-sectional percentiles (momentum / risk-adjusted return /
-- stability) and context bands (RSI, beta) instead of the single composite
-- "buy-o-meter" quant score. Facts, not a verdict (see the 2026-07-03 quant
-- scoring & ranking design proposal).
--
-- All columns are NULLABLE: old rows and a rollback stay valid, and rows written
-- for a small candidate universe (below QUANT_MIN_UNIVERSE) legitimately carry
-- null percentiles with quant_normalisation = 'insufficient_universe'.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes
-- these columns, otherwise the nightly insert will fail on unknown columns.
-- Safe to re-run (idempotent).

alter table public.ai_recommendation
  add column if not exists momentum_pctile      real,
  add column if not exists risk_adj_pctile      real,
  add column if not exists stability_pctile     real,
  add column if not exists rsi_band             text,
  add column if not exists beta_band            text,
  add column if not exists quant_normalisation  text;
