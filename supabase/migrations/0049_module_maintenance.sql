-- Maintenance per module (owner, 2026-10-20): an admin closes one part of the site (seller dashboard, checkout, SEO...) while the rest keeps
-- working. One row per module; no row means the module is open. The list of modules and which pages and APIs belong to each is in
-- lib/maintenance/config.ts. Every change is copied by a trigger into module_maintenance_history, which cannot be edited or emptied.
-- Server only: the browser never reads or writes these tables. Adds tables only; nothing existing changes.
create table module_maintenance (
  module_key text primary key check (module_key ~ '^[a-z_]{2,40}$'),
  enabled boolean not null default false,
  message text not null default '' check (char_length(message) <= 300),
  start_at timestamptz,
  end_at timestamptz,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at > start_at)
);
alter table module_maintenance enable row level security;
revoke all on module_maintenance from anon, authenticated;
grant select, insert, update on module_maintenance to service_role;

create table module_maintenance_history (
  id bigserial primary key,
  module_key text not null,
  enabled boolean not null,
  message text not null,
  start_at timestamptz,
  end_at timestamptz,
  updated_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index on module_maintenance_history (module_key, changed_at desc);
create index on module_maintenance_history (changed_at desc);
alter table module_maintenance_history enable row level security;
revoke all on module_maintenance_history from anon, authenticated;
grant select on module_maintenance_history to service_role;

create or replace function module_maintenance_history_append_only() returns trigger language plpgsql as $$
begin raise exception 'module_maintenance_history is append-only'; end $$;
create trigger module_maintenance_history_no_change before update or delete on module_maintenance_history for each row execute function module_maintenance_history_append_only();
create trigger module_maintenance_history_no_truncate before truncate on module_maintenance_history for each statement execute function module_maintenance_history_append_only();

-- Written by the database itself, so no change to a module can skip its history.
create or replace function module_maintenance_record() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into module_maintenance_history (module_key, enabled, message, start_at, end_at, updated_by)
  values (new.module_key, new.enabled, new.message, new.start_at, new.end_at, new.updated_by);
  return new;
end $$;
create trigger module_maintenance_recorded after insert or update on module_maintenance for each row execute function module_maintenance_record();

-- Recovery if every screen is stuck (see docs/RUNBOOK.md): update module_maintenance set enabled = false;
