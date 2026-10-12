-- 037 — bring the seeded classification up to the standard it is labelled with.
--
-- The rows are versioned '2025-10-01', but 024 seeded names from before the
-- 2024 revision. Checked against ASISA's own standard (approved 9 June 2025,
-- effective 1 October 2025) and against the funds' own sheets on 12/10/2026:
--
--   1. Money market was renamed "Interest Bearing - SA Money Market". Newer
--      sheets print the new name (Aluwani's does), and `resolve()` could not
--      match them to the old one.
--   2. "South African - Equity - General" was never seeded. Since 2024 it is a
--      different category from "SA General": General may hold the offshore
--      share a South African portfolio is allowed; SA General is 100% local.
--      Allan Gray Equity could not be seeded, and Ninety One Equity — whose
--      sheet prints "SA Equity General" — was filed under SA General instead.
--   3. "Global - Equity - US" is new in the 2025 revision. The Satrix S&P 500
--      ETF is filed there, which is why the catalogue has no S&P 500 fund.
--   4. "Global - Equity - Unclassified" holds single-theme funds; the Satrix
--      Nasdaq 100 ETF is filed there.
--
-- ⚠ Bracket placement lives in `asisa.py`: the first two new equity categories
-- sit wherever their siblings do (tracker-only for Moderate), Unclassified is
-- Aggressive only. Part of the bracket-table sign-off that is still outstanding.

-- ── 1. the rename ───────────────────────────────────────────────────────────
-- Same category, same slug; only the printed name moved. `funds.asisa_category`
-- joins on the name with no foreign key behind it, so the stored funds move in
-- the same migration or they silently stop matching.
update public.asisa_categories
   set tier3 = 'SA Money Market',
       name  = 'South African - Interest Bearing - SA Money Market'
 where version = '2025-10-01'
   and code    = 'sa_ib_money_market';

update public.funds
   set asisa_category = 'South African - Interest Bearing - SA Money Market',
       updated_at     = now()
 where asisa_category = 'South African - Interest Bearing - Money Market';

-- ── 2–4. the missing categories ─────────────────────────────────────────────
insert into public.asisa_categories (version, code, tier1, tier2, tier3, name) values
  ('2025-10-01', 'sa_eq_general_offshore', 'South African', 'Equity', 'General',      'South African - Equity - General'),
  ('2025-10-01', 'gl_eq_us',               'Global',        'Equity', 'US',           'Global - Equity - US'),
  ('2025-10-01', 'gl_eq_unclassified',     'Global',        'Equity', 'Unclassified', 'Global - Equity - Unclassified')
on conflict (version, code) do nothing;

-- ── the one fund filed under the wrong equity category ──────────────────────
-- Ninety One Equity Fund (A). Its own sheet (EQTE) prints "SA Equity General".
update public.funds
   set asisa_category = 'South African - Equity - General',
       updated_at     = now()
 where isin = 'ZAE000024204'
   and asisa_category = 'South African - Equity - SA General';
