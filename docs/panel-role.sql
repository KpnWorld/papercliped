-- READ-ONLY database role for the operator panel (the separate admin dashboard).
-- Run as your ADMIN role after the migrations (and again after any future migration).
--
-- 1. Create the role yourself with a strong generated password (don't commit it):
--      create role panel_ro login password '<paste a long random password>';
-- 2. Run the rest of this file.
-- 3. Use that role in the panel's PANEL_DATABASE_URL. The bridge never sees this role; the panel never sees the bridge's.
--
-- What this role can read: the telemetry tables (audit_events, user_events, node_samples) and three views that EXCLUDE every secret
-- (panel_accounts, panel_grants, panel_links). It cannot read bridge.accounts (secret hashes, real usernames), bridge.account_links
-- (sealed Paperclip credentials), bridge.grants, tokens, codes or pending requests, and it cannot write anything.

grant usage on schema bridge to panel_ro;

grant select on bridge.panel_accounts, bridge.panel_grants, bridge.panel_links to panel_ro;
grant select on bridge.audit_events, bridge.user_events, bridge.node_samples to panel_ro;

-- RLS is on for every table with no policies (deny by default); admit panel_ro to the three telemetry tables only.
do $$
declare t text;
begin
  foreach t in array array['audit_events', 'user_events', 'node_samples'] loop
    execute format('drop policy if exists panel_ro_read on bridge.%I', t);
    execute format('create policy panel_ro_read on bridge.%I for select to panel_ro using (true)', t);
  end loop;
end $$;
