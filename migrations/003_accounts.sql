-- Papercliped accounts: username + secret key, one stored Paperclip connection per account, and the user event log.
-- Nothing here stores a plaintext secret: `secret_hash` is a salted scrypt hash, `sealed_credential` is AES-GCM sealed in the app.

create table if not exists bridge.accounts (
  id            text   primary key,
  username      text   not null,               -- as typed; shown only in the operator's logs
  username_key  text   not null,               -- lowercased; unique
  secret_hash   text   not null,               -- scrypt$N$r$p$salt$hash of the generated secret key
  created_at    bigint not null,
  last_login_at bigint,
  disabled      boolean not null default false
);
create unique index if not exists accounts_username_key_idx on bridge.accounts (username_key);

-- One connection per account. A given Paperclip identity (instance + user id) can belong to only one account.
create table if not exists bridge.account_links (
  account_id         text   primary key references bridge.accounts (id) on delete cascade,
  instance_url       text   not null,
  paperclip_user_id  text,
  sealed_credential  text,                      -- null once dropped (idle expiry / disconnect)
  created_at         bigint not null,
  connected_at       bigint not null,
  last_used_at       bigint not null
);
create unique index if not exists account_links_identity_idx on bridge.account_links (instance_url, paperclip_user_id) where paperclip_user_id is not null;
create index if not exists account_links_idle_idx on bridge.account_links (last_used_at) where sealed_credential is not null;

-- The community log: joined / left / updated / login / ... (see src/accounts/types.ts). `detail` is a short non-sensitive reason.
create table if not exists bridge.user_events (
  id          bigint generated always as identity primary key,
  ts          bigint not null,
  account_id  text,
  username    text,
  kind        text   not null,
  detail      text
);
create index if not exists user_events_ts_idx   on bridge.user_events (ts desc);
create index if not exists user_events_kind_idx on bridge.user_events (kind, ts desc);

-- A row the app rewrites on a timer so a free-tier Supabase project always sees recent write activity.
create table if not exists bridge.heartbeat (
  id integer primary key,
  at bigint  not null
);

alter table bridge.grants       add column if not exists account_id text;
alter table bridge.grants       add column if not exists username   text;
alter table bridge.audit_events add column if not exists username   text;
create index if not exists grants_account_idx on bridge.grants (account_id) where not revoked;
create index if not exists audit_username_idx on bridge.audit_events (username, ts desc) where username is not null;

alter table bridge.accounts      enable row level security;
alter table bridge.account_links enable row level security;
alter table bridge.user_events   enable row level security;
alter table bridge.heartbeat     enable row level security;
revoke all on bridge.accounts, bridge.account_links, bridge.user_events, bridge.heartbeat from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on bridge.accounts, bridge.account_links, bridge.user_events, bridge.heartbeat from %I', r);
    end if;
  end loop;
end $$;
