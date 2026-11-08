-- Glass UI redesign, Phase 6 (owner, 2026-11-08).
-- 1. A cookieless first-party daily count: page and country (from the host's geo header) per day, and nothing else: no address, no visitor or user id.
-- 2. The size of Storage for Admin › System › Server health (read only, server only).
-- 3. A Dev admin scope for Server health.
-- requires: profiles, app_settings

create table if not exists page_counts (
  day date not null,
  path text not null check (char_length(path) between 1 and 200),
  country text not null check (country ~ '^([A-Z]{2}|--)$'),
  n integer not null default 0 check (n >= 0),
  primary key (day, path, country)
);
alter table page_counts enable row level security;
revoke all on page_counts from anon, authenticated;
grant select, delete on page_counts to service_role;

create or replace function page_count_hit(p_day date, p_path text, p_country text) returns void
language sql security definer set search_path = public as $$
  insert into page_counts (day, path, country, n) values (p_day, p_path, p_country, 1)
  on conflict (day, path, country) do update set n = page_counts.n + 1;
$$;
revoke all on function page_count_hit(date, text, text) from public, anon, authenticated;
grant execute on function page_count_hit(date, text, text) to service_role;

-- plpgsql, so the body is only checked when it runs (the in-process Postgres of npm run check:migrations has no storage schema).
create or replace function system_storage_bytes() returns bigint
language plpgsql stable security definer set search_path = storage, public as $$
begin
  return (select coalesce(sum((metadata->>'size')::bigint), 0)::bigint from storage.objects);
end
$$;
revoke all on function system_storage_bytes() from public, anon, authenticated;
grant execute on function system_storage_bytes() to service_role;

-- destructive-ok: the admin scope check is replaced by the same list plus 'dev'; every existing row still passes (owner's request, 2026-11-08)
alter table profiles drop constraint if exists profiles_admin_scopes_check;
alter table profiles add constraint profiles_admin_scopes_check
  check (admin_scopes is null or admin_scopes <@ array['super', 'finance', 'catalog', 'support', 'content', 'delivery', 'dev', 'negotiator']::text[]);
