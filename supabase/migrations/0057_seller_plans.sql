-- SellOnBay 2.0, Phase 2 (placeholder P06 with the subscription tables; provisional number).
-- Versioned seller plans (owner-approved F-1, O-3): Free $0 / 15% / 5 listings, Pro $19 or $193.80 / 10% / 25, Business $49 or $499.80 / 5% / 100.
-- A plan row is never edited once in use: a change is a new version. The numbers mirror CONFIG.plans (lib/config.ts); a test compares them.
-- 'legacy-baseline' records the fees of orders made before plans (30% under $20, 22% from $20, 20% custom work); history only, never offered.
-- Subscriptions are handled by an admin case by case (O-4): every change is an event row in an append-only log, plus the audit log.
-- Orders made from a quotation record the plan they were charged under and the seller's gross (the lines commission was worked out on).
-- Every existing order keeps NULL in both and is split exactly as before (lib/ledger.ts).
-- requires: profiles, orders, sob_append_only (0056)
create table seller_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code in ('legacy-baseline', 'free', 'pro', 'business')),
  version int not null check (version >= 1),
  name text not null,
  monthly_cents int check (monthly_cents >= 0),
  yearly_cents int check (yearly_cents >= 0),
  commission_bps int check (commission_bps between 0 and 10000),
  listing_limit int check (listing_limit >= 0),
  featured boolean not null default false,
  offered boolean not null default true,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (code, version)
);

insert into seller_plans (code, version, name, monthly_cents, yearly_cents, commission_bps, listing_limit, featured, offered) values
  ('legacy-baseline', 1, 'Before plans (history only)', null, null, null, null, false, false),
  ('free', 1, 'Free', 0, 0, 1500, 5, false, true),
  ('pro', 1, 'Pro', 1900, 19380, 1000, 25, true, true),
  ('business', 1, 'Business', 4900, 49980, 500, 100, true, true);

-- A plan row in use is fixed: prices and rates change only through a new version.
create or replace function seller_plans_fixed() returns trigger language plpgsql as $$
begin
  if (new.code, new.version, new.monthly_cents, new.yearly_cents, new.commission_bps, new.listing_limit, new.featured)
     is distinct from (old.code, old.version, old.monthly_cents, old.yearly_cents, old.commission_bps, old.listing_limit, old.featured) then
    raise exception 'seller_plans rows are fixed; add a new version instead';
  end if;
  return new;
end $$;
create trigger seller_plans_no_change before update on seller_plans for each row execute function seller_plans_fixed();
create trigger seller_plans_no_delete before delete on seller_plans for each row execute function sob_append_only();

create table seller_subscriptions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete restrict,
  plan_id uuid not null references seller_plans(id),
  billing text not null check (billing in ('monthly', 'yearly')),
  status text not null check (status in ('requested', 'pending_payment', 'active', 'renewal_due', 'renewal_failed', 'cancelling', 'ended')),
  price_cents int not null check (price_cents >= 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one subscription that is not ended per seller.
create unique index seller_subscriptions_one_open on seller_subscriptions (seller_id) where status <> 'ended';

create table subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references seller_subscriptions(id) on delete restrict,
  actor_id uuid references profiles(id) on delete set null,
  event text not null,
  from_status text,
  to_status text,
  reason text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index subscription_events_sub on subscription_events (subscription_id, id);
create trigger subscription_events_no_change before update or delete on subscription_events for each row execute function sob_append_only();
create trigger subscription_events_no_truncate before truncate on subscription_events for each statement execute function sob_append_only();

alter table orders add column if not exists fee_plan_id uuid references seller_plans(id);
alter table orders add column if not exists seller_gross_cents int check (seller_gross_cents >= 0);

alter table seller_plans enable row level security;
alter table seller_subscriptions enable row level security;
alter table subscription_events enable row level security;
revoke all on seller_plans, seller_subscriptions, subscription_events from anon, authenticated;
-- Plans are public facts (shown on the pricing and seller pages); subscriptions are read by the owner only. All writes go through the server.
grant select on seller_plans to anon, authenticated;
create policy seller_plans_read on seller_plans for select using (offered);
grant select on seller_subscriptions to authenticated;
create policy seller_subscriptions_own on seller_subscriptions for select using (seller_id = auth.uid());
grant select, insert, update on seller_plans, seller_subscriptions to service_role;
grant select, insert on subscription_events to service_role;
grant usage on sequence subscription_events_id_seq to service_role;
