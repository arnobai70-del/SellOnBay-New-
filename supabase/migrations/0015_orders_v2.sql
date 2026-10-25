-- Real orders. Replaces the demo_orders jsonb documents: every order, paid through the fake provider or a real one, is a row in `orders`,
-- and every change of state is a row in the append-only `order_events` log. The rules for moving between states live in lib/orders/machine.ts;
-- the database checks that only known states exist and applies a change and its event together (order_apply).

-- Policies that mention the old status values are recreated below.
drop policy if exists products_read on products;
drop policy if exists reviews_insert on reviews;

alter table orders alter column status drop default;
alter table orders alter column status type text using (case status::text when 'in_escrow' then 'funded' when 'building' then 'in_delivery' else status::text end);
alter table orders alter column status set default 'awaiting_payment';
alter table orders add constraint orders_status_check check (status in
  ('draft', 'awaiting_payment', 'funded', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'paid_out', 'disputed', 'fix_requested', 'overdue', 'refunded', 'cancelled'));

alter table orders alter column kind drop default;
alter table orders alter column kind type text using (case kind::text when 'customisation' then 'custom' else 'product' end);
alter table orders alter column kind set default 'product';
alter table orders add constraint orders_kind_check check (kind in ('product', 'custom', 'trial'));

-- Starter listings and developers are made-up data, so an order does not always point at a real product or seller. Signed-out demo orders have no buyer.
alter table orders alter column product_id drop not null;
alter table orders alter column seller_id drop not null;
alter table orders alter column buyer_id drop not null;

alter table orders
  add column currency text not null default 'USD',
  add column title text not null default '',
  add column pkg text not null default 'asis' check (pkg in ('asis', 'setup', 'custom')),
  add column delivery_type text not null default 'live_site' check (delivery_type in ('live_site', 'download', 'repo_access')),
  add column product_key text,
  add column dev_key text,
  add column brief text,
  add column lines jsonb not null default '[]',
  add column days smallint not null default 3 check (days between 1 and 60),
  add column instant boolean not null default false,
  add column demo boolean not null default true,
  add column domain jsonb,
  add column app_name text,
  add column oses jsonb,
  add column github_username text,
  add column licence text,
  add column payment_brand text,
  add column payment_last4 text,
  add column attempts int not null default 0,
  add column funded_at timestamptz,
  add column cancelled_at timestamptz;
create index orders_product_key_idx on orders (product_key);

create policy products_read on products for select using (
  seller_id = auth.uid() or is_admin()
  or exists (select 1 from orders o where o.product_id = products.id and o.buyer_id = auth.uid()
             and o.status in ('funded', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'paid_out', 'disputed', 'fix_requested', 'overdue'))
);
create policy reviews_insert on reviews for insert with check (
  buyer_id = auth.uid() and exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid() and o.status in ('accepted', 'payout_pending', 'paid_out'))
);

-- The log: who, when, from, to, metadata. Append only.
alter table order_events rename column type to event;
alter table order_events rename column detail to meta;
alter table order_events add column from_state text, add column to_state text;

create or replace function order_events_append_only() returns trigger language plpgsql as $$
begin
  -- A row may only disappear together with its order (the cascade); nobody can edit it or remove it on its own.
  if tg_op = 'DELETE' and not exists (select 1 from orders where id = old.order_id) then return old; end if;
  raise exception 'order_events is append-only';
end $$;
create trigger order_events_no_update before update on order_events for each row execute function order_events_append_only();
create trigger order_events_no_delete before delete on order_events for each row execute function order_events_append_only();
create or replace function order_events_no_truncate() returns trigger language plpgsql as $$
begin raise exception 'order_events is append-only'; end $$;
create trigger order_events_no_truncate before truncate on order_events for each statement execute function order_events_no_truncate();

-- One change of state and its event, together, and only if the order is still in the state the caller saw (no two writers win).
create or replace function order_apply(p_order uuid, p_from text, p_patch jsonb, p_event jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur text; k text; v jsonb;
begin
  select status into cur from orders where id = p_order for update;
  if not found or cur <> p_from then return false; end if;
  for k, v in select * from jsonb_each(p_patch) loop
    if k not in ('status', 'fee_cents', 'price_cents', 'due_at', 'delivered_at', 'review_ends_at', 'accepted_at', 'payout_after', 'bugfix_until', 'funded_at', 'cancelled_at',
                 'payment_ref', 'payment_brand', 'payment_last4', 'attempts', 'domain', 'github_username', 'lines', 'licence', 'code_released_at') then
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

-- Time-based changes (auto-accept, overdue, end of the payout hold) are now run by the app (lib/orders/service.ts runDueJobs, route /api/cron/orders),
-- so the rules and the numbers stay in lib/config.ts. The old SQL versions are removed.
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'auto-accept-orders';
exception when others then null;
end $$;
drop function if exists auto_accept_due();
drop function if exists accept_order(uuid, uuid, boolean);

grant select, insert, update on orders to service_role;
grant select, insert on order_events to service_role;
grant usage on sequence order_events_id_seq to service_role;
