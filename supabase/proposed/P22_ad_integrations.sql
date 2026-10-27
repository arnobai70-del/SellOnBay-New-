-- PROPOSED ONLY. NOT a migration: it is outside supabase/migrations on purpose and must not be applied (Addendum 2.3, placeholder P22).
-- Write the real migration only after Meta and Google each confirm access and capabilities in writing (blocker B-9) and counsel has reviewed
-- the seller promotion terms (B-10). Then re-check every column against the platform's documentation and take a free migration number.
-- Model A: the seller's own ad account; tokens sealed with AES-256-GCM on the server (lib/ads/tokens.ts), only the sealed value stored.

create table ad_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('meta', 'google')),
  external_account_id text not null,
  account_name text not null default '',
  token_sealed text not null,          -- "v1.<iv>.<tag>.<data>", never plain
  token_fingerprint text not null,     -- first 10 hex of SHA-256, for support
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  unique (seller_id, platform, external_account_id)
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  ad_account_id uuid references ad_accounts(id) on delete restrict,
  platform text not null check (platform in ('meta', 'google')),
  headline text not null check (char_length(headline) between 5 and 40),
  body text not null check (char_length(body) between 10 and 125),
  daily_budget_cents int not null check (daily_budget_cents between 500 and 50000),
  days int not null check (days between 1 and 30),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'rejected', 'live', 'paused', 'ended')),
  external_campaign_id text,
  review_note text not null default '',
  reviewed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (daily_budget_cents * days <= 500000)
);

create table promotion_events (
  id bigint generated always as identity primary key,
  promotion_id uuid not null references promotions(id) on delete restrict,
  actor_id uuid references profiles(id) on delete set null,
  event text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create trigger promotion_events_no_change before update or delete on promotion_events for each row execute function sob_append_only();

alter table ad_accounts enable row level security;
alter table promotions enable row level security;
alter table promotion_events enable row level security;
revoke all on ad_accounts, promotions, promotion_events from anon, authenticated;
grant select, insert, update on ad_accounts, promotions to service_role;
grant select, insert on promotion_events to service_role;
