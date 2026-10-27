-- SellOnBay 2.0, Phase 4 (placeholders P08 + P09; provisional number). Every purchase starts with a purchase request (owner decision D-E).
-- An admin reviews it and issues a quotation; the buyer accepts that exact version; only then does an order exist. Quotations are versioned
-- and immutable once issued (O-8), valid 7 days (O-13), and any price different from the listed one needs Super Admin approval first (O-8).
-- Acceptance and order creation happen in ONE database transaction (accept_quotation), and accepting twice returns the same order.
-- Custom development requests (R-10) use the same tables with kind 'custom_dev' and a buyer-confirmed written requirement set.
-- requires: profiles, products, orders, order_events, seller_plans (0057), file_versions (0058), sob_append_only (0056)

create table purchase_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'product' check (kind in ('product', 'custom_dev')),
  buyer_id uuid not null references profiles(id) on delete restrict,
  product_id uuid references products(id) on delete restrict,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'needs_info', 'requirements_verified', 'quoted', 'converted', 'declined', 'withdrawn', 'expired')),
  licence_tier text not null default 'single_project' check (licence_tier in ('single_project', 'multi_project', 'extended_commercial', 'exclusive_review')),
  package text not null default 'asis' check (package in ('asis', 'setup', 'custom')),
  extras jsonb not null default '{}',
  intended_use text not null check (char_length(intended_use) between 10 and 1000),
  requirements text check (char_length(requirements) <= 4000),
  delivery_details jsonb not null default '{}',
  business jsonb not null default '{}',
  consent_version text not null,
  consented_at timestamptz not null,
  verified_requirements text check (char_length(verified_requirements) <= 8000),
  requirements_confirmed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'custom_dev' or product_id is not null)
);
create index purchase_requests_buyer on purchase_requests (buyer_id, created_at desc);
create index purchase_requests_open on purchase_requests (status, updated_at) where status in ('submitted', 'under_review', 'needs_info', 'requirements_verified', 'quoted');

create table purchase_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references purchase_requests(id) on delete restrict,
  actor_id uuid references profiles(id) on delete set null,
  event text not null,
  from_status text,
  to_status text,
  note text check (char_length(note) <= 4000),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index purchase_request_events_req on purchase_request_events (request_id, id);
create trigger purchase_request_events_no_change before update or delete on purchase_request_events for each row execute function sob_append_only();
create trigger purchase_request_events_no_truncate before truncate on purchase_request_events for each statement execute function sob_append_only();

create table quotations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references purchase_requests(id) on delete restrict,
  version int not null check (version >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'pending_super', 'issued', 'accepted', 'rejected', 'superseded', 'expired', 'withdrawn', 'discarded')),
  product_id uuid references products(id) on delete restrict,
  seller_id uuid references profiles(id) on delete restrict,
  owner_type text not null default 'seller' check (owner_type in ('seller', 'platform')),
  lines jsonb not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  total_cents int not null check (total_cents > 0),
  listed_cents int check (listed_cents >= 0),
  price_override boolean not null default false,
  override_reason text check (char_length(override_reason) <= 1000),
  override_approved_by uuid references profiles(id) on delete set null,
  override_approved_at timestamptz,
  plan_id uuid references seller_plans(id),
  commission_bps int check (commission_bps between 0 and 10000),
  fee_cents int not null check (fee_cents >= 0),
  seller_gross_cents int not null check (seller_gross_cents >= 0),
  pass_through_cents int not null default 0 check (pass_through_cents >= 0),
  terms jsonb not null,
  file_version_id uuid references file_versions(id),
  created_by uuid references profiles(id) on delete set null,
  issued_by uuid references profiles(id) on delete set null,
  issued_at timestamptz,
  valid_until timestamptz,
  accepted_by uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  order_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, version),
  check (fee_cents <= seller_gross_cents),
  check (status not in ('issued', 'accepted') or (issued_at is not null and valid_until is not null)),
  check (not price_override or status not in ('issued', 'accepted') or override_approved_by is not null)
);
create unique index quotations_one_live on quotations (request_id) where status in ('draft', 'pending_super', 'issued');

-- Once issued, the money and terms of a quotation never change; only its status moves on (and the acceptance fields are filled once).
create or replace function quotations_fixed() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'quotations are never deleted'; end if;
  if old.status not in ('draft', 'pending_super') then
    if (new.lines, new.total_cents, new.fee_cents, new.seller_gross_cents, new.pass_through_cents, new.terms, new.plan_id, new.commission_bps,
        new.product_id, new.seller_id, new.issued_at, new.valid_until, new.file_version_id, new.currency, new.version, new.request_id)
       is distinct from
       (old.lines, old.total_cents, old.fee_cents, old.seller_gross_cents, old.pass_through_cents, old.terms, old.plan_id, old.commission_bps,
        old.product_id, old.seller_id, old.issued_at, old.valid_until, old.file_version_id, old.currency, old.version, old.request_id) then
      raise exception 'an issued quotation is immutable';
    end if;
    if old.order_id is not null and new.order_id is distinct from old.order_id then raise exception 'a quotation''s order never changes'; end if;
  end if;
  return new;
end $$;
create trigger quotations_fixed before update or delete on quotations for each row execute function quotations_fixed();

create table quotation_events (
  id bigint generated always as identity primary key,
  quotation_id uuid not null references quotations(id) on delete restrict,
  actor_id uuid references profiles(id) on delete set null,
  event text not null,
  from_status text,
  to_status text,
  note text check (char_length(note) <= 2000),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index quotation_events_q on quotation_events (quotation_id, id);
create trigger quotation_events_no_change before update or delete on quotation_events for each row execute function sob_append_only();
create trigger quotation_events_no_truncate before truncate on quotation_events for each statement execute function sob_append_only();

alter table orders add column if not exists quotation_id uuid unique references quotations(id);
alter table orders add column if not exists file_version_id uuid references file_versions(id);

/*
 * The buyer accepts an issued, unexpired quotation of their own request: the order (built by the app, lib/orders/store.ts toRow) is inserted,
 * the quotation is marked accepted with that order, the request is converted, and both events are logged, all in one transaction.
 * Calling it again for the same quotation by the same buyer returns the existing order (idempotent).
 */
create or replace function accept_quotation(p_quote uuid, p_buyer uuid, p_now timestamptz, p_order jsonb, p_order_event jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare q quotations%rowtype; r purchase_requests%rowtype; cols text; oid uuid;
begin
  select * into q from quotations where id = p_quote for update;
  if not found then raise exception 'quotation_not_found'; end if;
  select * into r from purchase_requests where id = q.request_id for update;
  if r.buyer_id <> p_buyer then raise exception 'not_your_quotation'; end if;
  if q.status = 'accepted' and q.accepted_by = p_buyer then return q.order_id; end if;
  if q.status <> 'issued' then raise exception 'quotation_not_open'; end if;
  if q.valid_until <= p_now then raise exception 'quotation_expired'; end if;
  oid := (p_order->>'id')::uuid;
  if (p_order->>'quotation_id')::uuid is distinct from q.id or (p_order->>'price_cents')::int <> q.total_cents
     or (p_order->>'fee_cents')::int <> q.fee_cents or (p_order->>'buyer_id')::uuid is distinct from p_buyer then
    raise exception 'order_does_not_match_quotation';
  end if;
  select string_agg(quote_ident(k), ', ') into cols
    from jsonb_object_keys(p_order) k
    where exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = k);
  execute format('insert into orders (%s) select %s from jsonb_populate_record(null::orders, $1)', cols, cols) using p_order;
  insert into order_events (order_id, actor_id, event, from_state, to_state, meta, created_at)
  values (oid, p_buyer, p_order_event->>'event', null, 'awaiting_payment', coalesce(p_order_event->'meta', '{}'), p_now);
  update quotations set status = 'accepted', accepted_by = p_buyer, accepted_at = p_now, order_id = oid, updated_at = p_now where id = q.id;
  insert into quotation_events (quotation_id, actor_id, event, from_status, to_status, meta, created_at)
  values (q.id, p_buyer, 'accepted', 'issued', 'accepted', jsonb_build_object('order', oid), p_now);
  update purchase_requests set status = 'converted', updated_at = p_now where id = r.id;
  insert into purchase_request_events (request_id, actor_id, event, from_status, to_status, meta, created_at)
  values (r.id, p_buyer, 'converted', r.status, 'converted', jsonb_build_object('order', oid, 'quotation', q.id), p_now);
  return oid;
end $$;
revoke execute on function accept_quotation(uuid, uuid, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function accept_quotation(uuid, uuid, timestamptz, jsonb, jsonb) to service_role;

alter table purchase_requests enable row level security;
alter table purchase_request_events enable row level security;
alter table quotations enable row level security;
alter table quotation_events enable row level security;
revoke all on purchase_requests, purchase_request_events, quotations, quotation_events from anon, authenticated;
-- Everything goes through the server, which checks who may see what. No client grants.
grant select, insert, update on purchase_requests, quotations to service_role;
grant select, insert on purchase_request_events, quotation_events to service_role;
grant usage on sequence purchase_request_events_id_seq, quotation_events_id_seq to service_role;
