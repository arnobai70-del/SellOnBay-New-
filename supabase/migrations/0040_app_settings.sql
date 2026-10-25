-- Settings an admin changes without a deploy (price range, the safety-check size, the early access bar). One row per setting; a saved value replaces
-- the default in lib/config.ts. Every change is also written to the audit log. Server only.
create table app_settings (
  key text primary key,
  value jsonb not null,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
grant select, insert, update on app_settings to service_role;
