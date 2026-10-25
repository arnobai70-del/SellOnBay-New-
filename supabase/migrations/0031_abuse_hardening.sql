-- Abuse hardening: what people did from which connection and device (hashed, never the raw address), and the blocks an admin sets.
-- Written and read by the server only. Events are kept for CONFIG.limits.keepDays and then purged.
create table security_events (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  ip_hash text,
  device_hash text,
  created_at timestamptz not null default now()
);
create index security_events_ip on security_events (ip_hash, created_at);
create index security_events_device on security_events (device_hash, created_at);
create index security_events_user on security_events (user_id, created_at);
create index security_events_action on security_events (action, created_at);

create table blocks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ip', 'device')),
  key text not null check (key ~ '^[0-9a-f]{24}$'),
  reason text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references profiles(id) on delete set null
);
create unique index blocks_active on blocks (kind, key) where lifted_at is null;

alter table security_events enable row level security;
alter table blocks enable row level security;
revoke all on security_events, blocks from anon, authenticated;
grant select, insert, delete on security_events to service_role;
grant select, insert, update on blocks to service_role;
