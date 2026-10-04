-- assets.avg_dollar_volume: the tie-break when two pool names share a discovery score.
--
-- A name that is not trending scores at most 0.50: trusted news saturates at 10
-- articles and liquidity at $500M a day, and every mega cap clears both. Ranked with
-- ties broken by ticker, MSFT fell outside the Technology top 15 behind names that
-- merely sort earlier. The score formula is unchanged; this only orders equal scores,
-- by how much of the stock trades.
--
-- Written nightly by the discovery agent from the yfinance read it already makes
-- (about one month of close x volume): for every discovered name it sees, and for
-- every curated seed. Read by the run's universe ranking. Never shown to users.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes it:
-- discovery's writes name the column, and would fail without it.
-- Safe to re-run (idempotent).

alter table public.assets
  add column if not exists avg_dollar_volume double precision;  -- USD per day; null until first measured
