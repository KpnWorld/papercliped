-- Run as your ADMIN role (e.g. `postgres`) after `npm run migrate`, and again after any future migration.
-- Lets the running bridge use a role that can read/write ONLY the bridge schema, instead of the admin role.
--
-- 1. Create the role yourself with a strong generated password (do not commit it):
--      create role bridge_app login password '<paste a long random password>';
-- 2. Run the rest of this file.
-- 3. Use that role in DATABASE_URL (the app); keep the admin role in DATABASE_MIGRATE_URL (migrations only).
--
-- The tables have RLS enabled with no policies, so every role is denied by default; the explicit policies
-- below re-admit only bridge_app. `anon` and `authenticated` (Supabase's public API roles) stay locked out.

grant usage on schema bridge to bridge_app;
grant select, insert, update, delete on all tables in schema bridge to bridge_app;
revoke all on bridge.schema_migrations from bridge_app; -- migration bookkeeping is admin-only

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'bridge' and tablename <> 'schema_migrations' loop
    execute format('drop policy if exists bridge_app_all on bridge.%I', t);
    execute format('create policy bridge_app_all on bridge.%I for all to bridge_app using (true) with check (true)', t);
  end loop;
end $$;
