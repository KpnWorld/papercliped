-- Beta opt-in: accounts that join the beta get the connection manager (/manage) and its management API.
alter table bridge.accounts add column if not exists beta boolean not null default false;
