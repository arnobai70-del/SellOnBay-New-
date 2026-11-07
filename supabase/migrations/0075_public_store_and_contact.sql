-- Glass UI redesign, Phase 2 (owner, 2026-11-07): what the public pages need. Only adds columns and tables; no existing row changes.
-- Seller store: public fields on seller_profiles (never the payout fields). The username is optional: until a seller picks one, the code derives an address from the name and id.
-- Listings: stack, featured and the beta opt-in. Contact and newsletter: server only, like the other 2.0 tables.
-- requires: seller_profiles, products
alter table seller_profiles
  add column if not exists username text unique check (username is null or username ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  add column if not exists headline text not null default '' check (char_length(headline) <= 120),
  add column if not exists skills text[] not null default '{}',
  add column if not exists custom_available boolean not null default false,
  add column if not exists reply_time text not null default '' check (char_length(reply_time) <= 40),
  add column if not exists store_paused boolean not null default false,
  add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');

alter table products
  add column if not exists frontend text not null default '' check (char_length(frontend) <= 40),
  add column if not exists backend_db text not null default '' check (char_length(backend_db) <= 40),
  add column if not exists featured boolean not null default false,
  add column if not exists beta_free_ok boolean not null default false;

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  topic text not null check (char_length(topic) between 1 and 40),
  order_ref text not null default '' check (char_length(order_ref) <= 40),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'spam')),
  created_at timestamptz not null default now()
);
alter table contact_messages enable row level security;
revoke all on contact_messages from anon, authenticated;

create table if not exists newsletter_subscribers (
  email text primary key check (char_length(email) between 3 and 254),
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
alter table newsletter_subscribers enable row level security;
revoke all on newsletter_subscribers from anon, authenticated;
