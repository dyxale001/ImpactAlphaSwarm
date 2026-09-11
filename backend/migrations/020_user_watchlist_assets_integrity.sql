-- user_watchlist_assets has existed only on the live Supabase DB (with a
-- `ticker` column not captured by any tracked migration) since the watchlist
-- shipped in PR #16. This migration:
--   1. Documents the table so a fresh environment gets it (a no-op on the
--      live DB, where it already exists -- `create table if not exists`).
--   2. Adds integrity guards (asset_id NOT NULL, one row per user+asset)
--      WITHOUT any destructive change: each guard is applied only if the
--      CURRENT data already satisfies it. If existing rows would violate a
--      guard, it is skipped with a NOTICE instead of failing the migration
--      or silently deleting/backfilling rows -- clean up the offending rows
--      manually, then re-run this migration to pick the guard up.
--
-- Application code (frontend/src/hooks/useWatchlistData.ts,
-- frontend/src/hooks/useOnboarding.ts) now refuses to insert a row with no
-- resolvable asset_id, so no NEW bare-ticker rows should appear going
-- forward; this migration is what makes that invariant a database guarantee
-- rather than only a frontend convention, once any pre-existing bad rows are
-- cleared.

create table if not exists public.user_watchlist_assets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  asset_id   uuid references public.assets(id) on delete cascade,
  ticker     text,
  created_at timestamptz not null default now()
);

create index if not exists user_watchlist_assets_user_id_idx
  on public.user_watchlist_assets (user_id);

alter table public.user_watchlist_assets enable row level security;

-- Guard 1: every row must reference a real asset. Applied only if no
-- existing row currently has a null asset_id.
do $$
begin
  if exists (
    select 1 from public.user_watchlist_assets where asset_id is null
  ) then
    raise notice 'Skipping asset_id NOT NULL on user_watchlist_assets: % existing row(s) have a null asset_id. Resolve or remove them, then re-run this migration.',
      (select count(*) from public.user_watchlist_assets where asset_id is null);
  else
    alter table public.user_watchlist_assets
      alter column asset_id set not null;
  end if;
end $$;

-- Guard 2: one watchlist entry per (user, asset). Applied only if no
-- existing duplicate pair is found.
do $$
begin
  if exists (
    select 1 from public.user_watchlist_assets
    where asset_id is not null
    group by user_id, asset_id
    having count(*) > 1
  ) then
    raise notice 'Skipping unique(user_id, asset_id) on user_watchlist_assets: duplicate rows exist. Deduplicate, then re-run this migration.';
  else
    create unique index if not exists user_watchlist_assets_user_asset_key
      on public.user_watchlist_assets (user_id, asset_id)
      where asset_id is not null;
  end if;
end $$;
