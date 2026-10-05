-- Paperclip Bridge schema. Run with a direct/session connection (see docs/DEPLOY-RENDER.md).
-- Everything lives in its own schema, which Supabase does NOT expose through its REST/GraphQL Data API,
-- and is additionally locked down with RLS (no policies = deny) and revoked grants, so the public `anon`
-- key can never read it. The bridge connects as a privileged role over a normal Postgres connection.

create schema if not exists bridge;

create table if not exists bridge.clients (
  id           text primary key,
  name         text   not null,
  redirect_uris text[] not null,
  created_at   bigint not null,
  last_used_at bigint not null
);

create table if not exists bridge.grants (
  id                text primary key,
  client_id         text   not null,
  client_name       text   not null,
  user_id           text,
  scopes            text[] not null,
  resource          text   not null,
  instance_url      text,
  sealed_credential text,           -- AES-256-GCM sealed in the app; the key never touches the database
  created_at        bigint not null,
  last_used_at      bigint not null,
  revoked           boolean not null default false
);
create index if not exists grants_idle_idx on bridge.grants (last_used_at) where not revoked;

create table if not exists bridge.tokens (
  hash       text primary key,       -- sha256 of the raw token; raw tokens are never stored
  kind       text   not null check (kind in ('access', 'refresh')),
  grant_id   text   not null,
  expires_at bigint not null,
  consumed   boolean not null default false
);
create index if not exists tokens_grant_idx on bridge.tokens (grant_id);
create index if not exists tokens_expiry_idx on bridge.tokens (expires_at);

create table if not exists bridge.pending (
  rid        text primary key,
  data       jsonb  not null,        -- sensitive parts already sealed by the app
  expires_at bigint not null
);
create index if not exists pending_expiry_idx on bridge.pending (expires_at);

create table if not exists bridge.codes (
  hash       text primary key,
  data       jsonb  not null,
  expires_at bigint not null,
  used       boolean not null default false,
  grant_id   text
);
create index if not exists codes_expiry_idx on bridge.codes (expires_at);

create table if not exists bridge.rate_limits (
  key      text primary key,
  n        integer not null,
  reset_at bigint  not null
);

-- Defence in depth: deny by default for every non-owner role.
alter table bridge.clients     enable row level security;
alter table bridge.grants      enable row level security;
alter table bridge.tokens      enable row level security;
alter table bridge.pending     enable row level security;
alter table bridge.codes       enable row level security;
alter table bridge.rate_limits enable row level security;

revoke all on schema bridge from public;
revoke all on all tables in schema bridge from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema bridge from %I', r);
      execute format('revoke all on all tables in schema bridge from %I', r);
      execute format('alter default privileges in schema bridge revoke all on tables from %I', r);
    end if;
  end loop;
end $$;
