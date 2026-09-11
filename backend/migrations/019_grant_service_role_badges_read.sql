-- Fixes: "permission denied for table badges" (42501) from the Admin
-- Reports Badges endpoint.
--
-- `badges` and `user_badges` predate the migrations directory and were only
-- ever queried by the FRONTEND via the anon/authenticated Supabase key
-- (RLS + per-user policies). The new backend/src/api.py admin_reports_badges
-- endpoint is the first thing to read them with the backend's service_role
-- client, and service_role was never explicitly granted table privileges on
-- either — unlike `assets`/`discovery_runs`/`nlp_budget` etc., which had
-- grants added in earlier migrations (009, 016) precisely because the
-- backend already touched them.
--
-- service_role bypasses RLS, but RLS bypass does not skip Postgres's own
-- GRANT system — a role still needs an explicit privilege grant on the
-- table itself. Read-only: the backend never writes to badges/user_badges
-- (badge awarding happens from the frontend as the authenticated user).
--
-- Safe to re-run (idempotent).

grant select on public.badges to service_role;
grant select on public.user_badges to service_role;
