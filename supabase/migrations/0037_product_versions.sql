-- New versions of a digital product. A seller publishes a version (number, what changed, a new private file link); it is scanned and reviewed like a
-- listing; once approved, buyers whose update period is still running (products.update_days from the purchase) can download it. The first file stays
-- in products.code_url. Written and read by the server only.
create table product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  version text not null check (version ~ '^[0-9A-Za-z][0-9A-Za-z._-]{0,19}$'),
  changelog text not null check (char_length(changelog) between 10 and 2000),
  file_url text not null,
  status text not null default 'in_review' check (status in ('in_review', 'live', 'rejected')),
  note text,
  created_by uuid references profiles(id) on delete set null,
  reviewed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (product_id, version)
);
create index product_versions_live on product_versions (product_id, published_at) where status = 'live';
create index product_versions_review on product_versions (created_at) where status = 'in_review';

alter table product_versions enable row level security;
revoke all on product_versions from anon, authenticated;
grant select, insert, update on product_versions to service_role;
