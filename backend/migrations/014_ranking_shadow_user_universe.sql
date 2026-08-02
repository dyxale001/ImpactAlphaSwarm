-- ranking_shadow: denormalise user_id and universe onto each candidate row.
--
-- Why: the table only carried run_id, so "every candidate this user was shown" and
-- "every candidate in Technology" both required joins — run_id -> ai_runs for the
-- user, and ticker -> assets for the universe. D-106 anticipates a ranked
-- all-assets view filterable by universe, which is exactly those two queries, and
-- the table had an index on run_id alone.
--
-- Note run_id does NOT identify a run: ai_runs holds one row per user, reused every
-- night, so run_id effectively identifies a USER and a run is (run_id, as_of_night).
-- Carrying user_id explicitly makes that readable instead of implied.
--
-- Additive and nullable. Run in the Supabase SQL editor; safe to re-run.

alter table public.ranking_shadow
  add column if not exists user_id  uuid,
  add column if not exists universe text;

-- Deliberately NO foreign key on user_id.
--   * Deletion is already covered: run_id -> ai_runs -> public.users both cascade,
--     so a removed user's shadow rows still disappear.
--   * A FK to public.users would add a failure mode instead of safety. A newly
--     registered account can briefly have no public.users row (profile creation is
--     client-side and RLS can reject it), and shadow logging must never be able to
--     fail a user's analysis. A soft column degrades to null; a FK would raise.
-- universe is likewise a copy taken at run time: it records the universe the asset
-- was analysed UNDER, which is the historically accurate value even if the asset is
-- later reclassified in `assets`.

-- Backfill what can be derived from existing rows, so history is queryable too.
update public.ranking_shadow rs
   set user_id = ar.user_id
  from public.ai_runs ar
 where rs.run_id = ar.id
   and rs.user_id is null;

update public.ranking_shadow rs
   set universe = a.universe
  from public.assets a
 where rs.ticker = a.ticker
   and rs.universe is null;

-- The two views D-106 calls for: per user over time, and per universe.
create index if not exists ranking_shadow_user_night_idx
  on public.ranking_shadow (user_id, as_of_night desc);
create index if not exists ranking_shadow_universe_idx
  on public.ranking_shadow (universe);

grant select, insert, update, delete on public.ranking_shadow to service_role;
