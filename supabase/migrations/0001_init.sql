-- Launchbay schema. Money is stored in integer cents. RLS is on for every table.
-- Rows that move money (orders status, wallets, ledger, payouts) are written only by the server with the service role.

create extension if not exists pgcrypto;

create type user_role as enum ('buyer', 'seller', 'admin');
create type listing_status as enum ('draft', 'in_review', 'live', 'rejected', 'paused');
create type order_status as enum ('awaiting_payment', 'in_escrow', 'building', 'delivered', 'accepted', 'disputed', 'refunded', 'cancelled');
create type order_kind as enum ('ready_made', 'customisation');
create type change_status as enum ('pending', 'funded', 'declined', 'delivered');
create type payout_status as enum ('scheduled', 'paid', 'failed');
create type dispute_status as enum ('open', 'seller_fixing', 'refunded', 'released', 'closed');
create type report_status as enum ('open', 'suspended', 'dismissed');
create type domain_source as enum ('own', 'purchased');
create type deploy_status as enum ('pending', 'live', 'suspended', 'failed');

-- ---------- helpers ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- users ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'buyer',
  full_name text not null default '',
  strikes int not null default 0,
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

-- Role lookups for policies. security definer avoids recursive RLS on profiles.
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not banned)
$$;

-- New auth users always start as buyers. Role changes happen server-side only.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table seller_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  display_name text not null,
  bio text not null default '',
  payout_method text check (payout_method in ('bank', 'payoneer')),
  payout_ref text,
  email_verified boolean not null default false,
  phone_verified boolean not null default false,
  id_verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- catalogue ----------
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  seller_id uuid not null references profiles(id),
  name text not null,
  category text not null,
  tagline text not null default '',
  description text not null,
  includes text[] not null default '{}',
  theme text not null default 'restaurant',
  price_cents int not null check (price_cents >= 500),
  delivery_days int not null check (delivery_days between 1 and 3),
  demo_url text not null,
  code_url text not null,                -- private: never exposed to buyers before payment (see products_public view)
  license text not null,
  status listing_status not null default 'in_review',
  scan_result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products (status, category);
create trigger products_updated before update on products for each row execute function set_updated_at();

-- Buyers and visitors read this view, which leaves out code_url.
create view products_public with (security_invoker = false) as
  select id, slug, seller_id, name, category, tagline, description, includes, theme, price_cents, delivery_days, demo_url, license, created_at
  from products where status = 'live';
grant select on products_public to anon, authenticated;

-- ---------- orders ----------
create table orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  kind order_kind not null default 'ready_made',
  status order_status not null default 'awaiting_payment',
  price_cents int not null,
  fee_cents int not null,                -- 15% on sales, 20-25% on custom work
  express boolean not null default false,
  due_at timestamptz,
  delivered_at timestamptz,
  review_ends_at timestamptz,            -- delivered_at + 48h, then auto-accept
  accepted_at timestamptz,
  payout_after timestamptz,              -- accepted_at + 7 days
  bugfix_until timestamptz,              -- accepted_at + 7 days
  payment_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders (buyer_id); create index on orders (seller_id); create index on orders (status);
create trigger orders_updated before update on orders for each row execute function set_updated_at();

create table order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  actor_id uuid references profiles(id),
  type text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on order_events (order_id, created_at);

-- Extra work: seller sends request, buyer approves and funds it BEFORE work starts.
create table change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  seller_id uuid not null references profiles(id),
  title text not null check (char_length(title) <= 80),
  price_cents int not null check (price_cents >= 500),
  extra_days int not null check (extra_days between 1 and 3),
  status change_status not null default 'pending',
  payment_ref text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------- money (server-written only; confirm provider and legal setup first, see CLAUDE.md step 3) ----------
create table wallets (
  user_id uuid primary key references profiles(id),
  available_cents bigint not null default 0,
  pending_cents bigint not null default 0,
  escrow_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table ledger_entries (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  order_id uuid references orders(id),
  kind text not null,                    -- escrow_in, release, fee, refund, payout, adjustment
  amount_cents bigint not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on ledger_entries (user_id, created_at);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  method text not null,
  status payout_status not null default 'scheduled',
  scheduled_for date not null,
  paid_at timestamptz
);

-- ---------- chat ----------
create table messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on messages (order_id, created_at);

-- Blocked attempts are stored for admin review. Blocked text never goes into messages.
create table blocked_messages (
  id bigint generated always as identity primary key,
  order_id uuid references orders(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  reason text not null,
  created_at timestamptz not null default now()
);

-- ---------- trust ----------
create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  opened_by uuid not null references profiles(id),
  reason text not null check (reason in ('not_as_described', 'does_not_work', 'malware', 'copyright', 'bug_fix')),
  detail text not null default '',
  status dispute_status not null default 'open',
  resolution text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table reviews (
  order_id uuid primary key references orders(id),
  product_id uuid not null references products(id),
  buyer_id uuid not null references profiles(id),
  rating int not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- domains and hosting ----------
create table domains (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  owner_id uuid not null references profiles(id),   -- registered in the buyer's name
  name text unique not null,
  source domain_source not null,
  registrar_ref text,
  expires_at date,
  created_at timestamptz not null default now()
);

create table deployments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  domain_id uuid references domains(id),
  provider text not null default 'manual',
  status deploy_status not null default 'pending',
  live_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger deployments_updated before update on deployments for each row execute function set_updated_at();

create table abuse_reports (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid references deployments(id),
  reporter_id uuid references profiles(id),
  site_url text not null,
  reason text not null,
  status report_status not null default 'open',
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table seller_profiles enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_events enable row level security;
alter table change_requests enable row level security;
alter table wallets enable row level security;
alter table ledger_entries enable row level security;
alter table payouts enable row level security;
alter table messages enable row level security;
alter table blocked_messages enable row level security;
alter table disputes enable row level security;
alter table reviews enable row level security;
alter table domains enable row level security;
alter table deployments enable row level security;
alter table abuse_reports enable row level security;

-- profiles: see your own row (admins see all). Role, strikes and banned can't be changed by the user, so only name is updatable.
create policy profiles_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (full_name) on profiles to authenticated;

-- seller profile: public display name is fine to read; payout data is in the same row, so reads are limited to owner and admin.
-- Public seller names are served through products_public / server queries.
create policy sp_own on seller_profiles for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid());
revoke update (email_verified, phone_verified, id_verified) on seller_profiles from authenticated;

-- products: sellers manage their own drafts. Going live is an admin decision (server).
create policy products_read on products for select using (
  seller_id = auth.uid() or is_admin()
  or exists (select 1 from orders o where o.product_id = products.id and o.buyer_id = auth.uid() and o.status in ('in_escrow','building','delivered','accepted','disputed'))
);
create policy products_insert on products for insert with check (seller_id = auth.uid() and status in ('draft','in_review'));
create policy products_update on products for update using (seller_id = auth.uid() and status in ('draft','in_review','rejected')) with check (seller_id = auth.uid() and status in ('draft','in_review'));
create policy products_admin on products for all using (is_admin()) with check (is_admin());

-- orders & friends: parties read, server writes
create policy orders_read on orders for select using (buyer_id = auth.uid() or seller_id = auth.uid() or is_admin());
create policy events_read on order_events for select using (exists (select 1 from orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())) or is_admin());
create policy changes_read on change_requests for select using (exists (select 1 from orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())) or is_admin());

-- money: owner reads only, nobody writes from the client
create policy wallets_read on wallets for select using (user_id = auth.uid() or is_admin());
create policy ledger_read on ledger_entries for select using (user_id = auth.uid() or is_admin());
create policy payouts_read on payouts for select using (seller_id = auth.uid() or is_admin());

-- chat: order parties read; inserts go through the server so the filter always runs
create policy messages_read on messages for select using (exists (select 1 from orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())) or is_admin());
create policy blocked_admin on blocked_messages for select using (is_admin());

-- disputes: parties read and open (own orders only); admin decides
create policy disputes_read on disputes for select using (exists (select 1 from orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())) or is_admin());
create policy disputes_insert on disputes for insert with check (opened_by = auth.uid() and exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid()));

-- reviews: public read, buyer writes one for an accepted order
create policy reviews_read on reviews for select using (true);
create policy reviews_insert on reviews for insert with check (buyer_id = auth.uid() and exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid() and o.status = 'accepted'));

-- domains / deployments: owner and the order's seller read; server writes
create policy domains_read on domains for select using (owner_id = auth.uid() or is_admin() or exists (select 1 from orders o where o.id = order_id and o.seller_id = auth.uid()));
create policy deploy_read on deployments for select using (exists (select 1 from orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())) or is_admin());

-- abuse reports: anyone signed in can report, admins read and decide
create policy abuse_insert on abuse_reports for insert with check (reporter_id = auth.uid());
create policy abuse_admin on abuse_reports for select using (is_admin());
