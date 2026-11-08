-- Maintenance, extended (owner, 2026-11-08): a banner some minutes before a planned start, and single pages closed by their address.
-- The allow-list of tester addresses is an app_settings row ("maintenance:allow_ips"), so it needs no table.
-- requires: module_maintenance, profiles
alter table module_maintenance add column if not exists banner_minutes integer not null default 0 check (banner_minutes between 0 and 1440);

create table if not exists page_maintenance (
  path text primary key check (path ~ '^/[A-Za-z0-9/_.-]{0,199}$' and path not like '%..%'),
  enabled boolean not null default false,
  message text not null default '' check (char_length(message) <= 300),
  start_at timestamptz,
  end_at timestamptz,
  banner_minutes integer not null default 0 check (banner_minutes between 0 and 1440),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at > start_at)
);
alter table page_maintenance enable row level security;
revoke all on page_maintenance from anon, authenticated;
grant select, insert, update, delete on page_maintenance to service_role;
