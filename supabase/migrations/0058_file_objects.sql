-- SellOnBay 2.0, Phase 3 (placeholder P07; provisional number). Secure source files (owner decisions D-C, D-D, F-8, F-9).
-- An upload lands in the private `quarantine` bucket, passes archive validation, secret detection, a malware scan (fail closed) and a SHA-256
-- record, then waits for human review. Only approved bytes are copied once into the private `product-files` bucket.
-- The database itself guarantees: an approved file's hash, size and path never change; file records are never deleted; the event log is
-- append-only; a file version, once created, never changes. Clients have no access at all: everything goes through the server.
-- requires: products, orders, profiles, sob_append_only (0056)

insert into storage.buckets (id, name, public, file_size_limit) values ('quarantine', 'quarantine', false, 524288000)
on conflict (id) do update set public = false, file_size_limit = 524288000;
insert into storage.buckets (id, name, public, file_size_limit) values ('product-files', 'product-files', false, 524288000)
on conflict (id) do update set public = false, file_size_limit = 524288000;
-- No storage policies on purpose: only the service role can read or write these buckets.

create table file_objects (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('listing', 'version', 'delivery', 'revision', 'legacy')),
  product_id uuid references products(id) on delete restrict,
  order_id uuid references orders(id) on delete restrict,
  uploaded_by uuid references profiles(id) on delete set null,
  original_name text not null check (char_length(original_name) between 1 and 200),
  declared_size bigint not null check (declared_size between 1 and 524288000),
  size_bytes bigint check (size_bytes between 1 and 524288000),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  quarantine_path text not null unique,
  approved_path text unique,
  state text not null default 'awaiting_upload'
    check (state in ('awaiting_upload', 'checking', 'failed_checks', 'awaiting_review', 'approved', 'rejected', 'purged')),
  checks jsonb not null default '{}',
  scan_provider text,
  scan_verdict text check (scan_verdict in ('clean', 'infected', 'error')),
  scan_reference text,
  scan_detail text,
  scanned_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  review_checklist jsonb,
  rejected_at timestamptz,
  purge_after timestamptz,
  purged_at timestamptz,
  legal_hold boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state <> 'approved' or (sha256 is not null and size_bytes is not null and approved_path is not null and scan_verdict = 'clean' and reviewed_by is not null))
);
create index file_objects_state on file_objects (state, updated_at);
create index file_objects_product on file_objects (product_id);
create index file_objects_purge on file_objects (purge_after) where state = 'rejected';

create or replace function file_objects_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'file_objects rows are never deleted'; end if;
  if old.state = 'approved' then
    if new.state <> 'approved' or new.sha256 is distinct from old.sha256 or new.size_bytes is distinct from old.size_bytes
       or new.approved_path is distinct from old.approved_path or new.quarantine_path is distinct from old.quarantine_path
       or new.product_id is distinct from old.product_id then
      raise exception 'an approved file is immutable';
    end if;
  end if;
  if old.sha256 is not null and new.sha256 is distinct from old.sha256 then raise exception 'a recorded file hash never changes'; end if;
  if old.state = 'purged' and new.state <> 'purged' then raise exception 'a purged file stays purged'; end if;
  return new;
end $$;
create trigger file_objects_guard before update or delete on file_objects for each row execute function file_objects_guard();
create trigger file_objects_no_truncate before truncate on file_objects for each statement execute function sob_append_only();

create table file_events (
  id bigint generated always as identity primary key,
  file_id uuid not null references file_objects(id) on delete restrict,
  actor_id uuid references profiles(id) on delete set null,
  event text not null,
  from_state text,
  to_state text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index file_events_file on file_events (file_id, id);
create trigger file_events_no_change before update or delete on file_events for each row execute function sob_append_only();
create trigger file_events_no_truncate before truncate on file_events for each statement execute function sob_append_only();

-- The approved, version-pinned files of a product. Entitlements point at these rows; a row never changes.
create table file_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  label text not null check (label ~ '^[0-9A-Za-z][0-9A-Za-z._ -]{0,29}$'),
  file_id uuid not null unique references file_objects(id) on delete restrict,
  changelog text check (char_length(changelog) <= 2000),
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz not null default now(),
  unique (product_id, label)
);
create index file_versions_product on file_versions (product_id, approved_at desc);
create trigger file_versions_no_change before update or delete on file_versions for each row execute function sob_append_only();
create trigger file_versions_no_truncate before truncate on file_versions for each statement execute function sob_append_only();

alter table file_objects enable row level security;
alter table file_events enable row level security;
alter table file_versions enable row level security;
revoke all on file_objects, file_events, file_versions from anon, authenticated;
grant select, insert, update on file_objects to service_role;
grant select, insert on file_events, file_versions to service_role;
grant usage on sequence file_events_id_seq to service_role;
