-- Server errors for the admin "Server and system" page (owner, 2026-11-03), counted per kind and per hour. A kind (fingerprint) is the route,
-- the status and the first line of the message, as lib/monitor.ts already writes them: e-mail addresses, keys, tokens and long numbers are
-- blanked before anything is stored, and no request body, header, cookie or address is kept. One row per kind per hour keeps the chart
-- exact; rows older than 30 days are deleted by the orders job. Only the server writes, through log_app_error(); RLS on, no client access.
create table if not exists app_errors (
  fingerprint text not null check (char_length(fingerprint) between 8 and 80),
  hour timestamptz not null,
  route text not null check (char_length(route) <= 200),
  status integer check (status between 100 and 599),
  message text not null check (char_length(message) <= 300),
  count integer not null default 1 check (count >= 1),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (fingerprint, hour)
);
create index if not exists app_errors_last on app_errors (last_seen desc);

-- One more occurrence of a kind in the current hour (insert or count up), in one statement so two copies of the site never lose a count.
create or replace function log_app_error(p_fingerprint text, p_route text, p_status integer, p_message text) returns void
language sql security definer set search_path = public as $$
  insert into app_errors (fingerprint, hour, route, status, message)
  values (p_fingerprint, date_trunc('hour', now()), left(p_route, 200), p_status, left(p_message, 300))
  on conflict (fingerprint, hour) do update set count = app_errors.count + 1, last_seen = now(), message = excluded.message;
$$;
revoke all on function log_app_error(text, text, integer, text) from public, anon, authenticated;
grant execute on function log_app_error(text, text, integer, text) to service_role;

alter table app_errors enable row level security;
revoke all on app_errors from anon, authenticated;
grant select, delete on app_errors to service_role;
