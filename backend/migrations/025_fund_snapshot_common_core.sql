-- 025 — the rest of what every Minimum Disclosure Document publishes.
--
-- Migration 024 captured the fields the matcher needs. A survey of six sheets
-- across two management companies found that roughly a third of the regulated
-- common core was being discarded — including, most consequentially, the NAV.
--
-- `fund_prices` is fed from `yahoo_symbol`, so it serves listed ETFs only. A
-- unit trust is not traded: its price IS the NAV its manager publishes on the
-- sheet, and eleven of nineteen seeded funds therefore had no price anywhere in
-- the system while their own documents printed one.
--
-- Everything added here is nullable and read off the document. Nothing is
-- derived, and nothing added here is used for matching — the matcher still
-- reads only the risk level, the minimum term and the minimum debit order.

alter table public.fund_factsheet_snapshots
  -- ── the price a unit trust actually has ──────────────────────────────────
  -- Cents per unit, as printed, with the date the manager priced it. Display
  -- only: it is one monthly observation, so deriving a return from a series of
  -- these is forbidden the same way computing one from `fund_prices` is. The
  -- manager's own published performance is the only performance shown.
  add column if not exists nav_cpu                numeric,
  add column if not exists nav_date               date,

  -- ── which period the fees cover ──────────────────────────────────────────
  -- Some managers print TER/TC/TIC in two columns, 1-Year and 3-Year; others
  -- print one figure. Luke's call (2026-09-07) is to quote the 1-year figure.
  -- This records which period the stored numbers actually cover, so a sheet
  -- offering only a 3-year figure can be shown honestly rather than compared
  -- against 1-year figures as though they were the same measure. Before this
  -- column existed the catalogue silently mixed the two.
  --
  -- FundRock's single unlabelled figure is a 1-year one, and it is worth writing
  -- down because the sheet invites the opposite conclusion: it carries the
  -- sentence "FR calculates the EAC as per the ASISA standard for a period of 3
  -- years", which is about the Effective Annual Cost, a different measure. The
  -- TER note itself says the calculations "are based upon the portfolio's direct
  -- costs for the financial year ended 31 December 2025" — one financial year.
  add column if not exists fee_period             text,

  add column if not exists inception_date         date,
  -- The manager's own cut, which sits inside the TER. Kept separate because a
  -- reader comparing two funds' costs is comparing different things if one's
  -- TER is mostly management fee and the other's is mostly trading.
  add column if not exists annual_management_fee  numeric,

  -- ── how bumpy, concretely ────────────────────────────────────────────────
  -- The best and worst year the fund has had, as published. A beginner cannot
  -- act on the word "Moderate"; they can act on "its worst year was -8%".
  -- Present on all six sheets surveyed.
  add column if not exists return_high_12m        numeric,
  add column if not exists return_low_12m         numeric,
  -- ...but not on the same basis, which is why this column exists. Satrix
  -- publishes "Highest/Lowest Annual Rolling Return" over ten non-overlapping
  -- one-year periods; FundRock publishes "Highest and Lowest: Calendar year
  -- performance since inception". Both answer "how bumpy", neither is the same
  -- statistic, and showing one fund's rolling extreme beside another's calendar
  -- extreme is the same not-like-for-like error the fee columns already caused
  -- once. Recorded rather than normalised: we do not have the return series to
  -- convert between them, and inventing one would be deriving a return.
  add column if not exists return_extremes_basis  text,

  -- ── the manager's own plain English ──────────────────────────────────────
  -- Quoted, never paraphrased, and worth more to a beginner than the label:
  -- "This portfolio has no equity exposure, resulting in low risk, stable
  -- investment returns." The horizon in words is often present where the
  -- numeric minimum term is not — only five of nineteen sheets state a number.
  add column if not exists risk_narrative         text,
  add column if not exists horizon_words          text,

  add column if not exists portfolio_manager      text,

  -- ── retirement-fund compliance ───────────────────────────────────────────
  -- Printed on unit trust sheets, absent from ETF sheets. Stored and displayed
  -- as a published fact; deliberately NOT a match filter, because inferring
  -- someone's retirement intent from an onboarding answer is a larger claim
  -- than that answer supports (Luke's call, 2026-09-07).
  add column if not exists regulation_28          boolean,

  -- Cents per unit by month, as the sheet's distribution table prints it.
  -- Matters to users whose stated purpose is income, who are already
  -- identified at onboarding.
  add column if not exists income_distribution    jsonb;

-- Either the fees are the most recent twelve months or they are a three-year
-- annualised figure. Anything else means the reader guessed at a column.
alter table public.fund_factsheet_snapshots
  drop constraint if exists fund_snapshots_fee_period_check;
alter table public.fund_factsheet_snapshots
  add constraint fund_snapshots_fee_period_check
  check (fee_period is null or fee_period in ('1y', '3y'));

-- Either the extremes are rolling one-year periods or they are calendar years.
alter table public.fund_factsheet_snapshots
  drop constraint if exists fund_snapshots_extremes_basis_check;
alter table public.fund_factsheet_snapshots
  add constraint fund_snapshots_extremes_basis_check
  check (return_extremes_basis is null
         or return_extremes_basis in ('rolling_12m', 'calendar_year'));

-- An extreme without its basis cannot be compared with another fund's, so the
-- pair travels together the way the NAV travels with its date.
alter table public.fund_factsheet_snapshots
  drop constraint if exists fund_snapshots_extremes_based_check;
alter table public.fund_factsheet_snapshots
  add constraint fund_snapshots_extremes_based_check
  check ((return_high_12m is null and return_low_12m is null)
         or return_extremes_basis is not null);

-- A NAV is meaningless without the date it was struck.
alter table public.fund_factsheet_snapshots
  drop constraint if exists fund_snapshots_nav_dated_check;
alter table public.fund_factsheet_snapshots
  add constraint fund_snapshots_nav_dated_check
  check (nav_cpu is null or nav_date is not null);

-- ── the fifteenth ASISA category ───────────────────────────────────────────
-- Inflation-linked bonds are their own tier-3 category, which the fourteen
-- seeded in 024 missed. It was found the hard way: the Satrix ILBI ETF's sheet
-- prints "South African - Interest Bearing - Variable Term ILB" wrapped across
-- two lines, the transcription and the regex reader both truncated it at the
-- break, and the fund has been filed under nominal Variable Term — a category
-- its own document does not state. ProfileData's public sector index lists the
-- two separately, confirming it is a real distinction rather than an artefact.
--
-- ⚠ The bracket policy in `asisa.py` places it wherever nominal Variable Term
-- sits, which preserves current matching (the ILBI ETF is what a Moderate
-- profile matches on). Same asset class, same published risk band — but it
-- belongs in the bracket-table sign-off that is already outstanding.
insert into public.asisa_categories (version, code, tier1, tier2, tier3, name) values
  ('2025-10-01', 'sa_ib_variable_term_ilb', 'South African', 'Interest Bearing', 'Variable Term ILB', 'South African - Interest Bearing - Variable Term ILB')
on conflict (version, code) do nothing;
