-- Audit & latency telemetry. One row per tool call and per OAuth/MCP HTTP request.
-- NEVER contains tool arguments, tool results, tokens or credentials: only who/what/how-long/outcome.
-- Retention is enforced by the app (BRIDGE_AUDIT_RETENTION_DAYS, default 30); rows hold the user id and tenant host, so keep it short.

create table if not exists bridge.audit_events (
  id             bigint generated always as identity primary key,
  ts             bigint  not null,                      -- ms since epoch (UTC)
  node           text    not null,                      -- which bridge instance wrote it
  kind           text    not null check (kind in ('tool', 'http')),
  name           text    not null,                      -- tool name, or route group such as 'oauth.token'
  mutation       boolean not null default false,
  ok             boolean not null,
  status         integer,
  error_class    text,                                  -- invalid_input | insufficient_scope | read_only | upstream_4xx | upstream_5xx | upstream_unreachable | rate_limited | unauthorized | internal
  total_ms       integer not null,                      -- end to end inside the bridge
  upstream_ms    integer,                               -- of which: waiting on the user's Paperclip (union of parallel requests)
  upstream_calls integer,
  scope          text,                                  -- scope the call required
  grant_id       text,
  client         text,
  instance       text,                                  -- tenant Paperclip host
  user_id        text
);

create index if not exists audit_ts_idx          on bridge.audit_events (ts desc);
create index if not exists audit_kind_name_idx   on bridge.audit_events (kind, name, ts desc);
create index if not exists audit_instance_idx    on bridge.audit_events (instance, ts desc) where instance is not null;
create index if not exists audit_errors_idx      on bridge.audit_events (ts desc) where not ok;

alter table bridge.audit_events enable row level security;
revoke all on bridge.audit_events from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on bridge.audit_events from %I', r);
    end if;
  end loop;
end $$;
