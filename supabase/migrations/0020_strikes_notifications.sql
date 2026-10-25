-- Chat strikes: three blocked messages in 30 days send a warning, five suspend the account for a while and alert the admins (spec 8.4).
-- Notifications: in-app rows, one per person and event (spec 8.7). Email goes out through lib/providers/email.

alter table profiles add column suspended_until timestamptz;   -- set by the server; the account cannot act until this time passes

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 60),
  payload jsonb not null default '{}',
  dedupe text,                                       -- the same reminder is never sent twice (for example "due_soon:<order>")
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);
create unique index notifications_dedupe on notifications (user_id, kind, dedupe) where dedupe is not null;
alter table notifications enable row level security;
create policy notifications_own on notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on notifications to authenticated;
grant update (read_at) on notifications to authenticated;
grant select, insert, update on notifications to service_role;

-- Warnings and suspensions are logged, so an admin can see what happened and why.
create table account_actions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null check (action in ('warning', 'suspended', 'unsuspended')),
  reason text not null,
  until timestamptz,
  created_at timestamptz not null default now()
);
create index on account_actions (user_id, created_at desc);
alter table account_actions enable row level security;
create policy account_actions_admin on account_actions for select using (is_admin());
grant select on account_actions to authenticated;
grant select, insert on account_actions to service_role;
grant usage on sequence account_actions_id_seq to service_role;
