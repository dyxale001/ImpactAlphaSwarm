-- Empty the fund catalogue so `load_fund_seed.py` reloads it from the CSVs alone.
--
-- IRREVERSIBLE. Run by hand in the Supabase SQL editor, after migration 037 and
-- after `load_fund_seed.py backend --dry-run` passes on the new seed — not before,
-- or the page sits empty until the seed is fixed.
--
-- Why it is a script and not a migration: migration 024 grants service_role no
-- DELETE on purpose ("soft-retire, never delete: snapshots are evidence"), so the
-- app and the loader cannot do this. It is a one-off reset of a catalogue that has
-- never had real users relying on a fund's history, run as the database owner.
--
-- What goes:   every fund, and through `on delete cascade` every fact-sheet
--              snapshot and every stored ETF price.
-- What stays:  the ASISA categories; archived PDFs and text layers in Storage
--              (orphaned, harmless — the reload uploads fresh copies by ISIN and
--              date); comparison trace cache rows, which regenerate.
-- Side effect: fund ids are new after the reload, so any saved /funds/<id> or
--              /compare link to a fund stops resolving.

begin;

delete from public.funds;

-- Expect 0 in all three before committing.
select
  (select count(*) from public.funds)                   as funds,
  (select count(*) from public.fund_factsheet_snapshots) as snapshots,
  (select count(*) from public.fund_prices)             as prices;

commit;

-- Then, from backend/:
--   venv/bin/python scripts/load_fund_seed.py . --dry-run
--   venv/bin/python scripts/load_fund_seed.py .
--   venv/bin/python scripts/refresh_fund_prices.py .
