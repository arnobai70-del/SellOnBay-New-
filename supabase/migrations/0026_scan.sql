-- Listing scan results and file versions (spec 8.2 and 6). Written only by the server. A scan never approves anything: it adds flags for the admin.
-- Seller files stay at the seller's private link (we do not copy them), so product_files records what was seen: its hash, size and the version number.

create table product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  version int not null,
  sha256 text not null,
  size_bytes bigint not null,
  source_host text,                                  -- where the file was fetched from (host only, never the full private link)
  created_at timestamptz not null default now(),
  unique (product_id, sha256)
);
create index on product_files (product_id, version);

create table scan_results (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  version int not null,
  malware_status text not null check (malware_status in ('clean', 'suspicious', 'infected', 'unknown')),
  originality_score numeric(4, 3),                   -- 1 means nothing like any other listing, 0 means the same
  flags jsonb not null default '{}',
  scanner text not null default 'local',
  reviewed_by uuid,
  decision text,
  created_at timestamptz not null default now()
);
create index on scan_results (product_id, created_at desc);

alter table product_files enable row level security;
alter table scan_results enable row level security;
create policy scan_results_admin on scan_results for select using (is_admin());
grant select on scan_results to authenticated;
grant select, insert, update on product_files, scan_results to service_role;
