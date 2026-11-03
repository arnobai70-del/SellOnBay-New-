-- Scheduled job runs for the admin "Server and system" page (owner, 2026-11-03): one row per run of /api/cron/orders and /api/cron/payouts,
-- written when the run starts and finished when it ends, with the first 500 characters of an error. The heartbeat in app_settings still
-- keeps the last good run for the launch check; this adds failures and how long a run took. Rows older than 30 days are deleted by the
-- orders job. Only the server (service role) reads or writes: RLS on, no policy, no grant to anon or authenticated.
create table if not exists cron_runs (
  id bigint generated always as identity primary key,
  job text not null check (job in ('orders', 'payouts')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  error text check (char_length(error) <= 500),
  check (finished_at is null or finished_at >= started_at)
);
create index if not exists cron_runs_job on cron_runs (job, started_at desc);

alter table cron_runs enable row level security;
revoke all on cron_runs from anon, authenticated;
grant select, insert, update, delete on cron_runs to service_role;
grant usage on sequence cron_runs_id_seq to service_role;
