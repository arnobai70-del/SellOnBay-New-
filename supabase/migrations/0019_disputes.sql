-- Disputes the way the spec describes them. The buyer opens one during the review window or the bug-fix window with a reason and evidence;
-- the seller replies within 48 hours; an admin decides within 5 days (refund full or partial, ask the seller to fix, or release the payout).
-- Everything is written by the server (lib/disputes). Clients can only read what belongs to them.

-- Reasons: the spec's list. The older names are carried over.
alter table disputes drop constraint if exists disputes_reason_check;
update disputes set reason = case reason when 'does_not_work' then 'not_working' when 'bug_fix' then 'other' else reason end;
alter table disputes add constraint disputes_reason_check check (reason in ('not_as_described', 'not_working', 'malware', 'copyright', 'other'));

alter table disputes alter column status drop default;
alter table disputes alter column status type text using (case status::text when 'open' then 'open' when 'seller_fixing' then 'open' else 'decided' end);
alter table disputes alter column status set default 'open';
alter table disputes add constraint disputes_status_check check (status in ('open', 'seller_replied', 'decided'));

alter table disputes
  add column from_state text,                       -- the order state it was opened from (delivered or accepted)
  add column seller_reply text,
  add column seller_replied_at timestamptz,
  add column seller_due_at timestamptz,
  add column admin_due_at timestamptz,
  add column decision text check (decision in ('refund_full', 'refund_partial', 'fix_requested', 'release')),
  add column refund_cents int check (refund_cents is null or refund_cents > 0),
  add column if not exists decided_by uuid references profiles(id),
  add column decided_at timestamptz;

-- A rejected dispute (verdict "release") is a strike against the buyer who opened it; three flag the account for review (profiles.flagged, no automatic ban).
-- This replaces the version from 0002, which looked for the old status 'closed'.
create or replace function record_dispute_outcome() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'decided' and old.status <> 'decided' and new.decision = 'release' and new.opened_by is not null then
    update profiles set strikes = strikes + 1, flagged = flagged or strikes + 1 >= 3 where id = new.opened_by;
  end if;
  return new;
end $$;

-- Only one dispute at a time for an order. Opening one is done by the server, which checks the window and moves the order to "disputed".
create unique index disputes_one_open on disputes (order_id) where status <> 'decided';
drop policy if exists disputes_insert on disputes;
revoke insert on disputes from authenticated;
grant select, insert, update on disputes to service_role;

create table dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references disputes(id) on delete cascade,
  author_id uuid not null references profiles(id),
  text text not null check (char_length(text) between 1 and 2000),
  file_path text,
  created_at timestamptz not null default now()
);
create index on dispute_evidence (dispute_id, created_at);
alter table dispute_evidence enable row level security;
create policy dispute_evidence_read on dispute_evidence for select using (
  exists (select 1 from disputes d join orders o on o.id = d.order_id where d.id = dispute_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())) or is_admin()
);
grant select on dispute_evidence to authenticated;
grant select, insert on dispute_evidence to service_role;

-- A partial refund is recorded on the order, so the ledger knows how much of the escrow went back to the buyer.
alter table orders add column refunded_cents int not null default 0 check (refunded_cents >= 0);

create or replace function order_apply(p_order uuid, p_from text, p_patch jsonb, p_event jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur text; k text; v jsonb;
begin
  select status into cur from orders where id = p_order for update;
  if not found or cur <> p_from then return false; end if;
  for k, v in select * from jsonb_each(p_patch) loop
    if k not in ('status', 'fee_cents', 'price_cents', 'due_at', 'delivered_at', 'review_ends_at', 'accepted_at', 'payout_after', 'bugfix_until', 'funded_at', 'cancelled_at',
                 'payment_ref', 'payment_brand', 'payment_last4', 'attempts', 'domain', 'github_username', 'lines', 'licence', 'code_released_at', 'refunded_cents') then
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
