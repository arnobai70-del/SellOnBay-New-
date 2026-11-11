-- Buyer subscriptions (owner, 2026-11-12): yearly plans that let a buyer pick a number of websites with source code, a usage licence and support.
-- Every plan detail lives in buyer_sub_plans and is edited in Admin > Buyer subscriptions; nothing is hard-coded. Server-only tables, like
-- beta_requests (0076): row level security on, no browser grants; the app reads and writes with the service key and checks ownership itself.
-- A template credit is taken only through buyer_sub_take_credit(), which locks the subscription row, so two clicks can never overspend.
-- requires: products, profiles, orders

create table if not exists buyer_sub_plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 600),
  badge text not null default '' check (char_length(badge) <= 30),
  color text not null default '#5FA88F' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort int not null default 0,
  price_cents int not null check (price_cents between 0 and 10000000),
  renewal_cents int not null check (renewal_cents between 0 and 10000000),
  period text not null default 'year' check (period in ('month', 'year', 'custom')),
  period_days int not null default 365 check (period_days between 1 and 3650),
  template_limit int not null check (template_limit between 0 and 1000),
  support_days int not null default 365 check (support_days between 0 and 3650),
  benefits jsonb not null default '[]',
  features jsonb not null default '{}',
  eligibility jsonb not null default '{"mode":"all","categories":[],"include":[],"exclude":[]}',
  licence_version text not null default 'sub-2026-11' check (char_length(licence_version) <= 40),
  refund_policy text not null default '' check (char_length(refund_policy) <= 2000),
  active boolean not null default true,
  visible boolean not null default true,
  archived_at timestamptz, -- "deleted" plans are archived: a plan that subscriptions point to can never vanish
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table buyer_sub_plans enable row level security;
revoke all on buyer_sub_plans from anon, authenticated;

create table if not exists buyer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id) on delete restrict,
  plan_id uuid not null references buyer_sub_plans(id) on delete restrict,
  plan_snapshot jsonb not null, -- name, prices, limit, support, licence version and refund text as bought: later plan edits never change it
  status text not null default 'pending_payment' check (status in ('pending_payment', 'payment_review', 'active', 'suspended', 'cancelled', 'expired', 'rejected')),
  credits_total int not null default 0 check (credits_total >= 0),
  credits_used int not null default 0 check (credits_used >= 0),
  amount_cents int not null check (amount_cents >= 0),
  coupon_code text,
  starts_at timestamptz,
  expires_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (credits_used <= credits_total)
);
create index if not exists buyer_subscriptions_buyer on buyer_subscriptions (buyer_id, created_at desc);
create index if not exists buyer_subscriptions_status on buyer_subscriptions (status, expires_at);
alter table buyer_subscriptions enable row level security;
revoke all on buyer_subscriptions from anon, authenticated;

-- One row per website a subscriber picked. order_id is the $0 order that releases the files through the normal signed download links.
create table if not exists buyer_sub_selections (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references buyer_subscriptions(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  product_key text not null,
  order_id uuid references orders(id) on delete restrict,
  licence_expires_at timestamptz not null,
  support_until timestamptz not null,
  created_at timestamptz not null default now(),
  unique (subscription_id, product_id)
);
alter table buyer_sub_selections enable row level security;
revoke all on buyer_sub_selections from anon, authenticated;

-- Manual-first payments: the buyer sends money by an admin-listed method and gives the reference; an admin verifies it.
create table if not exists buyer_sub_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references buyer_subscriptions(id) on delete restrict,
  kind text not null check (kind in ('new', 'renewal')),
  amount_cents int not null check (amount_cents >= 0),
  method_label text not null default '' check (char_length(method_label) <= 80),
  reference text not null check (char_length(reference) between 3 and 80),
  paid_on date,
  status text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists buyer_sub_payments_ref on buyer_sub_payments (upper(regexp_replace(reference, '[\s\-_/.:#]+', '', 'g'))) where status <> 'rejected';
alter table buyer_sub_payments enable row level security;
revoke all on buyer_sub_payments from anon, authenticated;

-- Append-only history of every subscription (who did what, when).
create table if not exists buyer_sub_events (
  id bigint generated always as identity primary key,
  subscription_id uuid references buyer_subscriptions(id) on delete restrict,
  plan_id uuid references buyer_sub_plans(id) on delete restrict,
  actor_id uuid references profiles(id),
  event text not null check (char_length(event) <= 60),
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);
alter table buyer_sub_events enable row level security;
revoke all on buyer_sub_events from anon, authenticated;
create or replace function buyer_sub_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'buyer_sub_events is append-only';
end $$;
drop trigger if exists buyer_sub_events_no_change on buyer_sub_events;
create trigger buyer_sub_events_no_change before update or delete on buyer_sub_events for each row execute function buyer_sub_events_append_only();

-- Take one template credit, atomically: the row is locked, the subscription must be active and unexpired, and the limit is never passed.
create or replace function buyer_sub_take_credit(p_sub uuid, p_buyer uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s buyer_subscriptions%rowtype;
begin
  select * into s from buyer_subscriptions where id = p_sub for update;
  if not found or s.buyer_id <> p_buyer then raise exception 'not_found'; end if;
  if s.status <> 'active' or s.expires_at is null or s.expires_at <= now() then raise exception 'not_active'; end if;
  if s.credits_used >= s.credits_total then raise exception 'no_credits'; end if;
  update buyer_subscriptions set credits_used = credits_used + 1, updated_at = now() where id = p_sub;
  return s.credits_total - s.credits_used - 1;
end $$;
revoke all on function buyer_sub_take_credit(uuid, uuid) from public, anon, authenticated;

-- Give a credit back when the selection that took it could not be saved (same lock).
create or replace function buyer_sub_return_credit(p_sub uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update buyer_subscriptions set credits_used = greatest(credits_used - 1, 0), updated_at = now() where id = p_sub;
end $$;
revoke all on function buyer_sub_return_credit(uuid) from public, anon, authenticated;

-- The server (service key) reads and writes them; browsers never do.
grant select, insert, update on buyer_sub_plans to service_role;
grant select, insert, update on buyer_subscriptions to service_role;
grant select, insert, update on buyer_sub_selections to service_role;
grant select, insert, update on buyer_sub_payments to service_role;
grant select, insert on buyer_sub_events to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function buyer_sub_take_credit(uuid, uuid) to service_role;
grant execute on function buyer_sub_return_credit(uuid) to service_role;

-- The three starting plans (owner's prices). Every value can be changed in the admin panel afterwards.
insert into buyer_sub_plans (key, name, description, badge, color, sort, price_cents, renewal_cents, period, period_days, template_limit, support_days, benefits, features)
values
  ('pro', 'Pro', 'Three websites of your choice with full source code, a 12-month licence and a year of support.', '', '#5FA88F', 1, 14900, 7900, 'year', 365, 3, 365,
   '[{"text":"Full source code","on":true},{"text":"12-month usage licence","on":true},{"text":"One year of bug fixes and support","on":true}]', '{"source_code":true,"support":true,"bug_fixes":true}'),
  ('pro-plus', 'Pro Plus', 'Five websites of your choice with full source code, a 12-month licence and a year of support.', 'Popular', '#2B3DFF', 2, 24900, 12900, 'year', 365, 5, 365,
   '[{"text":"Full source code","on":true},{"text":"12-month usage licence","on":true},{"text":"One year of bug fixes and support","on":true}]', '{"source_code":true,"support":true,"bug_fixes":true}'),
  ('pro-max', 'Pro Max', 'Seven websites of your choice with full source code, a 12-month licence and a year of support.', 'Best value', '#E0B44B', 3, 34900, 17900, 'year', 365, 7, 365,
   '[{"text":"Full source code","on":true},{"text":"12-month usage licence","on":true},{"text":"One year of bug fixes and support","on":true}]', '{"source_code":true,"support":true,"bug_fixes":true}')
on conflict (key) do nothing;
