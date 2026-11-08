-- Glass UI redesign, Phase 5 (owner, 2026-11-07): one account may buy and sell (can_sell), worldwide payouts with bKash only for Bangladesh sellers,
-- and seller verification by government ID and country, kept in a private bucket that only the server (and Finance through it) can read.
-- requires: profiles, seller_profiles
alter table profiles add column if not exists can_sell boolean not null default false;

-- destructive-ok: the payout method check is replaced by the same list plus bkash; every existing row still passes (owner's decision, 2026-11-07)
alter table seller_profiles drop constraint if exists seller_profiles_payout_method_check;
alter table seller_profiles add constraint seller_profiles_payout_method_check check (payout_method in ('bank', 'payoneer', 'wise', 'paypal', 'bkash'));
alter table seller_profiles add column if not exists payout_changed_at timestamptz;

create table if not exists seller_verifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete restrict,
  doc_type text not null check (doc_type in ('passport', 'national_id', 'driver_licence')),
  country text not null check (country ~ '^[A-Z]{2}$'),
  front_path text not null,
  back_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists seller_verifications_seller on seller_verifications (seller_id, created_at desc);
alter table seller_verifications enable row level security;
revoke all on seller_verifications from anon, authenticated;
grant select, insert, update on seller_verifications to service_role;

insert into storage.buckets (id, name, public, file_size_limit) values ('seller-ids', 'seller-ids', false, 5242880) on conflict (id) do nothing;
