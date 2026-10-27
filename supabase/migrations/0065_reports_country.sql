-- SellOnBay 2.0, Phase 9 (placeholders P18 + P21; provisional number). Sales PDF export log and first-party country counts.
-- report_exports: one row per generated PDF file (who, scope, filters, part, rows, SHA-256). The row is an accounting record and is never
-- deleted; only the generated file is removed after 24 hours (O-9), which sets file_deleted_at once. The PDFs live in the private `reports` bucket.
-- analytics_country: a two-letter country per visitor per day, for the first-party country panel (O-5). It stores the same keyed visitor hash
-- as analytics_hits and the country code only, never an address. Nothing is written until legal approval switches the feature on (B-12).
-- requires: profiles, sob_append_only (0056), analytics_visitors (0052)

insert into storage.buckets (id, name, public, file_size_limit) values ('reports', 'reports', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
-- No storage policies on purpose: only the service role reads or writes generated reports.

create table report_exports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  scope text not null check (scope in ('admin', 'seller', 'buyer')),
  requested_by uuid references profiles(id) on delete set null,
  filters jsonb not null default '{}',
  part int not null check (part >= 1),
  parts int not null check (parts >= 1 and part <= parts),
  row_count int not null check (row_count between 0 and 1000),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_path text not null check (char_length(file_path) between 5 and 300),
  expires_at timestamptz not null,
  file_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (batch_id, part)
);
create index report_exports_by on report_exports (requested_by, created_at desc);
create index report_exports_due on report_exports (expires_at) where file_deleted_at is null;

-- The log entry never changes, except that the file's deletion is recorded once.
create or replace function report_exports_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'export log entries are never deleted'; end if;
  if (to_jsonb(new) - 'file_deleted_at') <> (to_jsonb(old) - 'file_deleted_at') then raise exception 'an export log entry cannot change'; end if;
  if old.file_deleted_at is not null and new.file_deleted_at is distinct from old.file_deleted_at then raise exception 'the deletion time is fixed'; end if;
  return new;
end $$;
create trigger report_exports_guard before update or delete on report_exports for each row execute function report_exports_guard();
create trigger report_exports_no_truncate before truncate on report_exports for each statement execute function sob_append_only();

create table analytics_country (
  day date not null,
  visitor text not null check (char_length(visitor) between 8 and 64),
  country text not null check (country ~ '^[A-Z]{2}$'),
  primary key (day, visitor)
);
create index analytics_country_day on analytics_country (day, country);

alter table report_exports enable row level security;
alter table analytics_country enable row level security;
revoke all on report_exports, analytics_country from anon, authenticated;
grant select, insert, update on report_exports to service_role;
grant select, insert, delete on analytics_country to service_role;

-- Visitors per country per day in a range (first-party; never added to GA4 numbers).
create or replace function analytics_countries(p_from date, p_to date)
returns table (country text, visitors bigint)
language sql stable as $$
  select country, count(distinct visitor) from analytics_country where day between p_from and p_to group by country order by 2 desc, 1
$$;
revoke all on function analytics_countries(date, date) from public, anon, authenticated;
grant execute on function analytics_countries(date, date) to service_role;
