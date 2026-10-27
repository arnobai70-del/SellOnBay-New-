-- SellOnBay 2.0, Phase 5 (placeholders P10 + refunds; provisional number). Manual-first payments (owner decisions D-I, F-4, F-5).
-- Payment methods are entered by Finance (bank transfer and local wallet details live only in this table, never in code). A buyer's payment is
-- an attempt with a reference and a private proof; it funds nothing until Finance reconciles it against funds actually received. The same
-- reference cannot be used twice. Several reconciled attempts may add up to the amount due; anything above it becomes a refund for Finance.
-- Refunds are authorised by Finance (or Super Admin acting as Finance, F-12) and recorded with how and when the money went back.
-- Orders gain two states: payment_review (a manual payment waits for reconciliation) and release_pending (Phase 6: waiting for release approval).
-- requires: orders, profiles, sob_append_only (0056)

insert into storage.buckets (id, name, public, file_size_limit) values ('payment-proofs', 'payment-proofs', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;
-- No storage policies: only the service role reads or writes payment proofs.

-- destructive-ok: the status check is replaced by the same list plus two new states; every existing row still passes (owner-approved 2.0 plan)
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in
  ('draft', 'awaiting_payment', 'payment_review', 'funded', 'release_pending', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'paid_out',
   'disputed', 'fix_requested', 'overdue', 'refunded', 'cancelled'));

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bank_transfer', 'local_wallet')),
  label text not null check (char_length(label) between 2 and 80),
  instructions text not null check (char_length(instructions) between 10 and 2000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  kind text not null default 'manual' check (kind in ('manual', 'gateway')),
  method_id uuid references payment_methods(id),
  provider text,
  reference text not null check (char_length(reference) between 3 and 100),
  reference_key text not null,
  amount_claimed_cents int not null check (amount_claimed_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  paid_on date,
  proof_path text,
  status text not null default 'submitted' check (status in ('submitted', 'reconciled', 'rejected', 'expired', 'gateway_pending', 'confirmed', 'failed')),
  amount_received_cents int check (amount_received_cents >= 0),
  statement_ref text check (char_length(statement_ref) <= 120),
  received_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'reconciled' or (amount_received_cents is not null and statement_ref is not null and received_at is not null and reviewed_by is not null))
);
-- The same payment reference (per method) can only be used once, unless Finance rejected the earlier use.
create unique index payment_attempts_one_reference on payment_attempts (coalesce(method_id::text, provider), reference_key) where status <> 'rejected';
create index payment_attempts_order on payment_attempts (order_id, created_at);
create index payment_attempts_queue on payment_attempts (status, created_at) where status = 'submitted';

-- Once reconciled or rejected, an attempt's money facts never change.
create or replace function payment_attempts_fixed() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'payment attempts are never deleted'; end if;
  if old.status in ('reconciled', 'rejected', 'confirmed') then
    if (new.status, new.amount_received_cents, new.statement_ref, new.received_at, new.reference, new.amount_claimed_cents, new.order_id)
       is distinct from (old.status, old.amount_received_cents, old.statement_ref, old.received_at, old.reference, old.amount_claimed_cents, old.order_id) then
      raise exception 'a decided payment attempt is fixed';
    end if;
  end if;
  return new;
end $$;
create trigger payment_attempts_fixed before update or delete on payment_attempts for each row execute function payment_attempts_fixed();

create table payment_events (
  id bigint generated always as identity primary key,
  attempt_id uuid references payment_attempts(id) on delete restrict,
  refund_id uuid,
  order_id uuid not null,
  actor_id uuid references profiles(id) on delete set null,
  event text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index payment_events_order on payment_events (order_id, id);
create trigger payment_events_no_change before update or delete on payment_events for each row execute function sob_append_only();
create trigger payment_events_no_truncate before truncate on payment_events for each statement execute function sob_append_only();

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  attempt_id uuid references payment_attempts(id),
  kind text not null check (kind in ('overpayment', 'order', 'partial')),
  amount_cents int not null check (amount_cents > 0),
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'cancelled')),
  requested_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  paid_method text check (char_length(paid_method) <= 80),
  paid_ref text check (char_length(paid_ref) <= 120),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('approved', 'paid') or approved_by is not null),
  check (status <> 'paid' or (paid_ref is not null and paid_at is not null))
);
create index refunds_open on refunds (status, created_at) where status in ('requested', 'approved');
create unique index refunds_one_overpayment on refunds (attempt_id) where kind = 'overpayment';

create or replace function refunds_fixed() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'refunds are never deleted'; end if;
  if old.status in ('paid', 'cancelled') and (new.status, new.amount_cents, new.paid_ref, new.paid_at) is distinct from (old.status, old.amount_cents, old.paid_ref, old.paid_at) then
    raise exception 'a finished refund is fixed';
  end if;
  if new.amount_cents <> old.amount_cents and old.status <> 'requested' then raise exception 'an approved refund amount never changes'; end if;
  return new;
end $$;
create trigger refunds_fixed before update or delete on refunds for each row execute function refunds_fixed();

alter table payment_methods enable row level security;
alter table payment_attempts enable row level security;
alter table payment_events enable row level security;
alter table refunds enable row level security;
revoke all on payment_methods, payment_attempts, payment_events, refunds from anon, authenticated;
-- No client grants: buyers see their own attempts and the active methods through the server, which checks ownership.
grant select, insert, update on payment_methods, payment_attempts, refunds to service_role;
grant select, insert on payment_events to service_role;
grant usage on sequence payment_events_id_seq to service_role;
