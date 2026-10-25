-- Data requests (GDPR and CCPA): a person asks for a copy of their data or for their account to be deleted. Written only by the server.
-- Deleting means anonymising: payments, orders and the ledger are kept for the time the law requires, but they no longer point to a named person.

create table data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                              -- no foreign key on purpose: the request outlives the account's name
  kind text not null check (kind in ('export', 'delete')),
  status text not null default 'pending' check (status in ('pending', 'done', 'refused')),
  note text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid
);
create index on data_requests (user_id, created_at desc);
create index on data_requests (status, created_at);
alter table data_requests enable row level security;
create policy data_requests_own on data_requests for select using (user_id = auth.uid() or is_admin());
grant select on data_requests to authenticated;
grant select, insert, update on data_requests to service_role;
