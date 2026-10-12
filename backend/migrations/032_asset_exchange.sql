-- assets.exchange: the exchange a stock trades on, for the universe and exchange line.
--
-- Stored as a reader would name it ("Nasdaq", "NYSE"), not as Yahoo's code ("NMS",
-- "NYQ"), so the page shows it as it comes. The same names the Quant chart's
-- "Listed on ..." line uses (src/quant/history.py EXCHANGE_NAMES).
--
-- Filled by scripts/backfill_exchanges.py once, then nightly at the end of the
-- discovery pass for any active row still without one, which covers names discovery
-- adds that night and seeds added by hand. Null until filled; the page falls back to
-- a live lookup (/api/assets/{ticker}/listing) for a null row.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that writes it:
-- the nightly fill names the column, and would fail without it.
-- Safe to re-run (idempotent).

alter table public.assets
  add column if not exists exchange text;  -- e.g. 'Nasdaq', 'NYSE'; null until looked up
