-- Licence types and the third-party code declaration, how a product is handed over (files or repo invite), extra work with real escrow,
-- the trial credit, and the handover certificate. Rules and numbers live in lib/config.ts.

-- Products: which licence the buyer gets, what third-party code is inside, and how the product is delivered (null = by the platform default).
alter table products
  add column licence_type text check (licence_type in ('single_project', 'multi_project', 'full_transfer')),
  add column third_party jsonb not null default '[]',
  add column delivery_type text check (delivery_type in ('live_site', 'download', 'repo_access'));

-- Trial credit: a custom order can claim a finished trial with the same seller, and each trial can be claimed once.
alter table orders add column trial_credit_for uuid references orders(id);
create unique index orders_trial_credit_once on orders (trial_credit_for) where trial_credit_for is not null and status not in ('cancelled', 'refunded');
alter table dev_profiles add column credit_trial boolean not null default false;

-- Extra work: the spec's states, and the fee taken from the seller's side when it is accepted.
alter table change_requests alter column status drop default;
alter table change_requests alter column status type text using (case status::text when 'delivered' then 'funded' else status::text end);
alter table change_requests alter column status set default 'pending';
alter table change_requests add constraint change_requests_status_check check (status in ('pending', 'funded', 'declined', 'cancelled'));
alter table change_requests alter column seller_id drop not null;   -- made-up starter sellers have no account
alter table change_requests add column fee_cents int not null default 0, add column funded_at timestamptz;
grant select, insert, update on change_requests to service_role;

-- Handover certificate: one PDF per accepted order, never changed afterwards.
create table certificates (
  order_id uuid primary key,             -- no foreign key on purpose: the record outlives any order row
  storage_path text not null,
  pdf_sha256 text not null,
  file_hashes jsonb not null default '[]',
  issued_at timestamptz not null default now()
);
create or replace function certificates_immutable() returns trigger language plpgsql as $$
begin raise exception 'certificates cannot be changed or removed'; end $$;
create trigger certificates_no_change before update or delete on certificates for each row execute function certificates_immutable();
alter table certificates enable row level security;
grant select, insert on certificates to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('certificates', 'certificates', false, 2097152)
on conflict (id) do update set public = false, file_size_limit = 2097152;
-- No storage policies on purpose: only the server reads this bucket, after checking that the signed-in person is the buyer or the seller.
