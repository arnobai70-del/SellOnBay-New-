-- Delivery of the seller's real files: one licence key per order, and an append-only log of every download.
-- The log is evidence in disputes, so rows can never be changed or removed, not even by the server.

create table licenses (
  order_id uuid primary key,
  key text not null unique,
  created_at timestamptz not null default now()
);

create table download_events (
  id bigint generated always as identity primary key,
  order_id uuid not null,                 -- no foreign key on purpose: demo orders are logged here too
  kind text not null default 'real' check (kind in ('real', 'demo')),
  user_id uuid,
  ip text,
  user_agent text,
  file_hash text,                         -- sha256 of the file that was served
  bytes bigint,
  created_at timestamptz not null default now()
);
create index on download_events (order_id, created_at);

create or replace function download_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'download_events is append-only';
end $$;
create trigger download_events_no_update before update or delete on download_events for each row execute function download_events_append_only();
create trigger download_events_no_truncate before truncate on download_events for each statement execute function download_events_append_only();

alter table licenses enable row level security;
alter table download_events enable row level security;
grant select, insert on licenses to service_role;
grant select, insert on download_events to service_role;
grant usage on sequence download_events_id_seq to service_role;
