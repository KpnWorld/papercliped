-- Privacy (anonymous display names) and the separate operator panel.
--
--  * Accounts can opt in to appear in logs and the panel as a generated alias ("Ann02") and with an anonymous label instead of
--    their Paperclip's hostname. Events and audit rows store only the DISPLAY name, so the panel's database role never sees the
--    real username of an anonymous account. (The service operator with admin access to the base tables still can; see docs/SECURITY.md.)
--  * The bridge writes periodic health samples; the panel reads them, so it can tell when the bridge is down or asleep.
--  * The panel connects with a read-only role that can see only the views and telemetry tables below — never the credential,
--    the secret hash, or real usernames.

alter table bridge.accounts      add column if not exists anonymous boolean not null default false;
alter table bridge.accounts      add column if not exists alias     text;
alter table bridge.account_links add column if not exists instance_label text;   -- the host, or "anon-xxxxxx" for anonymous accounts
create unique index if not exists accounts_alias_idx on bridge.accounts (lower(alias)) where alias is not null;

create table if not exists bridge.node_samples (
  id               bigint generated always as identity primary key,
  ts               bigint not null,
  node             text   not null,
  db_ping_ms       real,
  loop_lag_p99_ms  real,
  rss_mb           real,
  heap_mb          real,
  uptime_s         integer,
  version          text
);
create index if not exists node_samples_ts_idx   on bridge.node_samples (ts desc);
create index if not exists node_samples_node_idx on bridge.node_samples (node, ts desc);
alter table bridge.node_samples enable row level security;
revoke all on bridge.node_samples from public;

-- Views run with the rights of the role that owns them (the migration role), so the panel role needs no access to the base tables.
create or replace view bridge.panel_accounts as
  select id,
         case when anonymous and alias is not null then alias else username end as display_name,
         (anonymous and alias is not null) as anonymous,
         created_at, last_login_at, disabled
    from bridge.accounts;

create or replace view bridge.panel_grants as
  select id, client_name, scopes, created_at, last_used_at, revoked, account_id, username as display_name
    from bridge.grants;

create or replace view bridge.panel_links as
  select account_id, coalesce(instance_label, 'unknown') as instance_label, connected_at, last_used_at, (sealed_credential is not null) as has_credential
    from bridge.account_links;

revoke all on bridge.panel_accounts, bridge.panel_grants, bridge.panel_links from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on bridge.node_samples, bridge.panel_accounts, bridge.panel_grants, bridge.panel_links from %I', r);
    end if;
  end loop;
end $$;
