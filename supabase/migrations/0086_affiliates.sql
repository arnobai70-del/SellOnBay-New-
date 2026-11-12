-- Affiliate program (owner, 2026-11-12): a separate system from buyer and seller subscriptions. Every rule (fees, qualification, rates, cookie
-- days, minimum withdrawal, badges, eligible products) is the app_settings key 'affiliates:settings', edited in Admin > Affiliate Management;
-- nothing is hard-coded here. Off until an admin turns it on. Server-only tables (like 0076 and 0085): row level security on, no browser grants;
-- the app reads and writes with the service key and checks ownership itself. Money is an append-only ledger with one key per entry, so a
-- commission can never be approved, reversed or paid twice.
-- requires: profiles

-- One affiliate per account: a buyer or seller applies without a new account, and the affiliate role never touches seller money or permissions.
create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9]{4,16}$'),
  display_name text not null default '' check (char_length(display_name) <= 60),
  public_leaderboard boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'qualified', 'suspended', 'rejected')),
  qualification_started_at timestamptz not null default now(),
  qualification_ends_at timestamptz not null,
  verified_at timestamptz,
  fee_cents int not null default 0 check (fee_cents >= 0), -- the registration fee that applied when they joined (0 during the promotion)
  fee_waived boolean not null default false,
  terms_version text not null check (char_length(terms_version) between 1 and 40),
  payout_method text not null default '' check (char_length(payout_method) <= 40),
  payout_details text not null default '' check (char_length(payout_details) <= 200), -- server-only; shown masked
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table affiliates enable row level security;
revoke all on affiliates from anon, authenticated;

-- Clicks on referral links: no personal data, only a keyed hash of the visitor; one per visitor, link and day.
create table if not exists affiliate_clicks (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  product_key text not null default '' check (char_length(product_key) <= 200),
  visitor_hash text not null check (char_length(visitor_hash) between 8 and 128),
  day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (affiliate_id, product_key, visitor_hash, day)
);
create index if not exists affiliate_clicks_aff on affiliate_clicks (affiliate_id, created_at desc);
alter table affiliate_clicks enable row level security;
revoke all on affiliate_clicks from anon, authenticated;

-- What a referral led to: a sign-up, an order, a buyer subscription or a seller plan. One affiliate per thing, ever (first one wins).
create table if not exists affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  kind text not null check (kind in ('signup', 'order', 'buyer_sub', 'seller_sub')),
  ref_id text not null check (char_length(ref_id) between 1 and 80),
  customer_id uuid references profiles(id) on delete restrict,
  product_key text not null default '',
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);
create index if not exists affiliate_attributions_aff on affiliate_attributions (affiliate_id, created_at desc);
alter table affiliate_attributions enable row level security;
revoke all on affiliate_attributions from anon, authenticated;

-- One commission per paid thing (source_ref), with the rate and basis recorded when it was made: later rate changes never touch it.
create table if not exists affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  attribution_id uuid not null references affiliate_attributions(id) on delete restrict,
  kind text not null check (kind in ('first_purchase', 'repeat_purchase', 'buyer_sub_new', 'buyer_sub_renewal', 'seller_sub')),
  source_ref text not null check (char_length(source_ref) between 1 and 120),
  basis_cents int not null check (basis_cents >= 0),
  rate_bps int not null check (rate_bps between 0 and 10000),
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'reversed')),
  approve_after timestamptz,
  approved_at timestamptz,
  reversed_at timestamptz,
  reverse_reason text not null default '' check (char_length(reverse_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_ref)
);
create index if not exists affiliate_commissions_aff on affiliate_commissions (affiliate_id, created_at desc);
create index if not exists affiliate_commissions_status on affiliate_commissions (status, approve_after);
alter table affiliate_commissions enable row level security;
revoke all on affiliate_commissions from anon, authenticated;

-- Withdrawals: requested by the affiliate, decided by an admin, paid by hand with a reference.
create table if not exists affiliate_withdrawals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'paid')),
  method text not null default '' check (char_length(method) <= 40),
  details_masked text not null default '' check (char_length(details_masked) <= 80),
  payout_reference text not null default '' check (char_length(payout_reference) <= 120),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
-- one open withdrawal per affiliate at a time
create unique index if not exists affiliate_withdrawals_one_open on affiliate_withdrawals (affiliate_id) where status in ('requested', 'approved');
alter table affiliate_withdrawals enable row level security;
revoke all on affiliate_withdrawals from anon, authenticated;

-- The money: approved commissions in, reversals and withdrawals out. Append-only; entry_key makes every entry happen once.
create table if not exists affiliate_ledger (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  entry_key text not null unique check (char_length(entry_key) between 3 and 160),
  kind text not null check (kind in ('commission', 'reversal', 'withdrawal', 'withdrawal_returned')),
  amount_cents int not null, -- signed: in is positive, out is negative
  commission_id uuid references affiliate_commissions(id) on delete restrict,
  withdrawal_id uuid references affiliate_withdrawals(id) on delete restrict,
  at timestamptz not null default now()
);
create index if not exists affiliate_ledger_aff on affiliate_ledger (affiliate_id, at desc);
alter table affiliate_ledger enable row level security;
revoke all on affiliate_ledger from anon, authenticated;

-- Who did what (admin decisions and the program's own steps). Append-only.
create table if not exists affiliate_events (
  id bigint generated always as identity primary key,
  affiliate_id uuid references affiliates(id) on delete restrict,
  actor_id uuid references profiles(id),
  event text not null check (char_length(event) <= 60),
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists affiliate_events_aff on affiliate_events (affiliate_id, at desc);
alter table affiliate_events enable row level security;
revoke all on affiliate_events from anon, authenticated;

create or replace function affiliate_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
drop trigger if exists affiliate_ledger_no_change on affiliate_ledger;
create trigger affiliate_ledger_no_change before update or delete on affiliate_ledger for each row execute function affiliate_append_only();
drop trigger if exists affiliate_events_no_change on affiliate_events;
create trigger affiliate_events_no_change before update or delete on affiliate_events for each row execute function affiliate_append_only();

-- The server (service key) reads and writes them; browsers never do. No delete grant anywhere.
grant select, insert, update on affiliates to service_role;
grant select, insert on affiliate_clicks to service_role;
grant select, insert on affiliate_attributions to service_role;
grant select, insert, update on affiliate_commissions to service_role;
grant select, insert, update on affiliate_withdrawals to service_role;
grant select, insert on affiliate_ledger to service_role;
grant select, insert on affiliate_events to service_role;
grant usage, select on all sequences in schema public to service_role;
