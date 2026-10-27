-- SellOnBay 2.0, Phase 6 (placeholders P12 + P13; provisional number). Explicit admin release approval and buyer entitlements (D-A).
-- Every purchase made from a quotation needs verified payment AND a Delivery (or Super) admin's release approval before any file, licence key
-- or repository invite reaches the buyer; nothing is ever released automatically. The release target is 12 consecutive hours, 24/7/365, from
-- the later of verified payment and approved file readiness (release_due_at, UTC). Missing it raises alerts; it never releases anything.
-- The database refuses a quotation order in a delivered state without a recorded release approval.
-- Each release creates one entitlement: buyer, order, product, exact approved file version, licence tier and text version, release approval.
-- requires: orders, order_events, profiles, products, file_objects and file_versions (0058), quotations (0059), sob_append_only (0056)

alter table orders add column if not exists work_authorised_at timestamptz;
alter table orders add column if not exists files_ready_at timestamptz;
alter table orders add column if not exists release_due_at timestamptz;
alter table orders add column if not exists release_approved_at timestamptz;
alter table orders add column if not exists release_approved_by uuid references profiles(id) on delete set null;
alter table orders add constraint orders_release_before_delivery
  check (quotation_id is null or status not in ('delivered', 'accepted', 'payout_pending', 'paid_out') or release_approved_at is not null) not valid;
-- Existing rows have no quotation_id, so validating cannot fail; done in the same file so the rule is enforced for every row from now on.
alter table orders validate constraint orders_release_before_delivery;
create index if not exists orders_release_queue on orders (release_due_at) where status = 'release_pending';

-- order_apply (0019) may now also write the release columns, and writes the status last.
create or replace function order_apply(p_order uuid, p_from text, p_patch jsonb, p_event jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur text; k text; v jsonb;
begin
  select status into cur from orders where id = p_order for update;
  if not found or cur <> p_from then return false; end if;
  -- status last: the release check (orders_release_before_delivery) sees the approval written in the same call before the state changes
  for k, v in select key, value from jsonb_each(p_patch) order by (key = 'status') loop
    if k not in ('status', 'fee_cents', 'price_cents', 'due_at', 'delivered_at', 'review_ends_at', 'accepted_at', 'payout_after', 'bugfix_until', 'funded_at', 'cancelled_at',
                 'payment_ref', 'payment_brand', 'payment_last4', 'attempts', 'domain', 'github_username', 'lines', 'licence', 'code_released_at', 'refunded_cents',
                 'work_authorised_at', 'files_ready_at', 'release_due_at', 'release_approved_at', 'release_approved_by') then
      raise exception 'order_apply: column % is not allowed', k;
    end if;
    execute format('update orders set %I = (jsonb_populate_record(null::orders, jsonb_build_object(%L, $1))).%I where id = $2', k, k, k) using v, p_order;
  end loop;
  insert into order_events (order_id, actor_id, event, from_state, to_state, meta, created_at)
  values (p_order, nullif(p_event->>'actor_id', '')::uuid, p_event->>'event', p_event->>'from', p_event->>'to', coalesce(p_event->'meta', '{}'), (p_event->>'at')::timestamptz);
  return true;
end $$;
revoke execute on function order_apply(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function order_apply(uuid, text, jsonb, jsonb) to service_role;

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete restrict,
  buyer_id uuid references profiles(id) on delete set null,
  product_id uuid references products(id) on delete restrict,
  file_version_id uuid references file_versions(id),
  delivery_file_id uuid references file_objects(id), -- a work order's checked delivery from the seller (order-specific)
  licence_tier text not null,
  licence_text_version text not null,
  release_approved_by uuid references profiles(id) on delete set null,
  release_approved_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  status_reason text check (char_length(status_reason) <= 1000),
  status_changed_by uuid references profiles(id) on delete set null,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create index entitlements_buyer on entitlements (buyer_id);

-- A revoked entitlement stays revoked; the release facts never change.
create or replace function entitlements_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'entitlements are never deleted'; end if;
  if old.status = 'revoked' and new.status <> 'revoked' then raise exception 'a revoked entitlement stays revoked'; end if;
  if (new.order_id, new.buyer_id, new.product_id, new.file_version_id, new.delivery_file_id, new.licence_tier, new.licence_text_version, new.release_approved_by, new.release_approved_at)
     is distinct from (old.order_id, old.buyer_id, old.product_id, old.file_version_id, old.delivery_file_id, old.licence_tier, old.licence_text_version, old.release_approved_by, old.release_approved_at) then
    raise exception 'the release facts of an entitlement never change';
  end if;
  return new;
end $$;
create trigger entitlements_guard before update or delete on entitlements for each row execute function entitlements_guard();

-- Later versions a buyer is entitled to (inside their update period) are added here; the original version is never replaced.
create table entitlement_versions (
  entitlement_id uuid not null references entitlements(id) on delete restrict,
  file_version_id uuid not null references file_versions(id),
  reason text not null,
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (entitlement_id, file_version_id)
);
create trigger entitlement_versions_no_change before update or delete on entitlement_versions for each row execute function sob_append_only();

alter table entitlements enable row level security;
alter table entitlement_versions enable row level security;
revoke all on entitlements, entitlement_versions from anon, authenticated;
grant select, insert, update on entitlements to service_role;
grant select, insert on entitlement_versions to service_role;
