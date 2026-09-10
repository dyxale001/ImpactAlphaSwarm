-- Let a signed-in user create their own profile row on first login.
--
-- The bug: authService.fetchUserProfileData() falls back to inserting into
-- public.users with the anon key when a freshly signed-up user has no profile
-- row yet. RLS is enabled on that table and no INSERT policy covers that write,
-- so every first login failed with
--
--   new row violates row-level security policy for table "users"
--
-- leaving the user authenticated but with no profile, which then breaks every
-- page that reads profile.role or profile.first_name.
--
-- Why the check pins role rather than only matching the id. The frontend gates
-- the whole admin area on users.role = 'admin' (AdminRoute.tsx, and the admin
-- pages behind it). The inserted row is composed by the client, so a policy
-- that only checked auth.uid() = id would let anyone sign up as an admin by
-- editing the insert payload. Pinning role to 'user' at insert time keeps
-- promotion an admin-only UPDATE, which is how AdminDashboard already does it.
--
-- Note this table is unlike the rest of this folder. Every other migration here
-- locks its table to service_role because only the backend touches it;
-- public.users predates these migrations, was created in the Supabase
-- dashboard, and is read and written directly by the frontend with the anon
-- key, so its policies are written by hand against auth.uid().
--
-- Idempotent so it is safe to re-run in the SQL editor. Postgres has no
-- CREATE POLICY IF NOT EXISTS.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Users can create their own profile'
  ) then
    create policy "Users can create their own profile"
      on public.users
      for insert
      to authenticated
      with check (auth.uid() = id and role = 'user');
  end if;
end
$$;

-- If first login still returns an empty profile after this, the read side is
-- missing too: the insert's .select() needs a SELECT policy on public.users to
-- return the new row. Check what is actually there with
--
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'users';
