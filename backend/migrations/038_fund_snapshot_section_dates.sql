-- 038 — the date a sheet's holdings and allocation are as at, when it is not the
-- sheet's own date.
--
-- Most managers refresh holdings quarterly and print them on every monthly sheet
-- with their own date: Coronation's August 2026 sheets carry "HOLDINGS As at 30 Jun
-- 2026", Foord's September sheets carry 31 March. The snapshot has one date,
-- `as_of`, and the page showed every figure under it — so June holdings were
-- presented as August's. Twenty-seven of the fifty-four funds in the October 2026
-- catalogue print holdings dated this way.
--
-- Both are nullable: blank means the section is as at the sheet's own date, which
-- is the common case for prices, fees and returns. Nothing here is used for
-- matching; it only changes the date the page shows beside the section.

alter table public.fund_factsheet_snapshots
  add column if not exists holdings_as_of   date,
  add column if not exists allocation_as_of date;

alter table public.fund_factsheet_snapshots
  drop constraint if exists fund_snapshots_holdings_as_of_check;
alter table public.fund_factsheet_snapshots
  add constraint fund_snapshots_holdings_as_of_check
  check (holdings_as_of is null or holdings_as_of <= as_of);

alter table public.fund_factsheet_snapshots
  drop constraint if exists fund_snapshots_allocation_as_of_check;
alter table public.fund_factsheet_snapshots
  add constraint fund_snapshots_allocation_as_of_check
  check (allocation_as_of is null or allocation_as_of <= as_of);
