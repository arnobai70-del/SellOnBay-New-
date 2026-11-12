-- Affiliate program (owner, 2026-11-12): a separate system from buyer and seller subscriptions. Every rule (fees, qualification, rates, cookie
-- days, minimum withdrawal, badges, eligible products) is the app_settings key 'affiliates:settings', edited in Admin > Affiliate Management;
-- nothing is hard-coded here. Off until an admin turns it on. Server-only tables (like 0076 and 0085): row level security on, no browser grants;
-- the app reads and writes with the service key and checks ownership itself. Money is an append-only ledger with one key per entry, so a
-- commission can never be approved, reversed or paid twice.
-- requires: profiles

-- One affiliate per account: a buyer or seller applies without a new account, and the affiliate role never touches seller money or permissions.
create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9]{4,16}$'),
  display_name text not null default '' check (char_length(display_name) <= 60),
  public_leaderboard boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'qualified', 'suspended', 'rejected')),
  qualification_started_at timestamptz not null default now(),
  qualification_ends_at timestamptz not null,
  verified_at timestamptz,
  fee_cents int not null default 0 check (fee_cents >= 0), -- the registration fee that applied when they joined (0 during the promotion)
  fee_waived boolean not null default false,
  terms_version text not null check (char_length(terms_version) between 1 and 40),
  payout_method text not null default '' check (char_length(payout_method) <= 40),
  payout_details text not null default '' check (char_length(payout_details) <= 200), -- server-only; shown masked
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table affiliates enable row level security;
revoke all on affiliates from anon, authenticated;

-- Clicks on referral links: no personal data, only a keyed hash of the visitor; one per visitor, link and day.
create table if not exists affiliate_clicks (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  product_key text not null default '' check (char_length(product_key) <= 200),
  visitor_hash text not null check (char_length(visitor_hash) between 8 and 128),
  day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (affiliate_id, product_key, visitor_hash, day)
);
create index if not exists affiliate_clicks_aff on affiliate_clicks (affiliate_id, created_at desc);
alter table affiliate_clicks enable row level security;
revoke all on affiliate_clicks from anon, authenticated;

-- What a referral led to: a sign-up, an order, a buyer subscription or a seller plan. One affiliate per thing, ever (first one wins).
create table if not exists affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  kind text not null check (kind in ('signup', 'order', 'buyer_sub', 'seller_sub')),
  ref_id text not null check (char_length(ref_id) between 1 and 80),
  customer_id uuid references profiles(id) on delete restrict,
  product_key text not null default '',
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);
create index if not exists affiliate_attributions_aff on affiliate_attributions (affiliate_id, created_at desc);
alter table affiliate_attributions enable row level security;
revoke all on affiliate_attributions from anon, authenticated;

-- One commission per paid thing (source_ref), with the rate and basis recorded when it was made: later rate changes never touch it.
create table if not exists affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  attribution_id uuid not null references affiliate_attributions(id) on delete restrict,
  kind text not null check (kind in ('first_purchase', 'repeat_purchase', 'buyer_sub_new', 'buyer_sub_renewal', 'seller_sub')),
  source_ref text not null check (char_length(source_ref) between 1 and 120),
  basis_cents int not null check (basis_cents >= 0),
  rate_bps int not null check (rate_bps between 0 and 10000),
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'reversed')),
  approve_after timestamptz,
  approved_at timestamptz,
  reversed_at timestamptz,
  reverse_reason text not null default '' check (char_length(reverse_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_ref)
);
create index if not exists affiliate_commissions_aff on affiliate_commissions (affiliate_id, created_at desc);
create index if not exists affiliate_commissions_status on affiliate_commissions (status, approve_after);
alter table affiliate_commissions enable row level security;
revoke all on affiliate_commissions from anon, authenticated;

-- Withdrawals: requested by the affiliate, decided by an admin, paid by hand with a reference.
create table if not exists affiliate_withdrawals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'paid')),
  method text not null default '' check (char_length(method) <= 40),
  details_masked text not null default '' check (char_length(details_masked) <= 80),
  payout_reference text not null default '' check (char_length(payout_reference) <= 120),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
-- one open withdrawal per affiliate at a time
create unique index if not exists affiliate_withdrawals_one_open on affiliate_withdrawals (affiliate_id) where status in ('requested', 'approved');
alter table affiliate_withdrawals enable row level security;
revoke all on affiliate_withdrawals from anon, authenticated;

-- The money: approved commissions in, reversals and withdrawals out. Append-only; entry_key makes every entry happen once.
create table if not exists affiliate_ledger (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  entry_key text not null unique check (char_length(entry_key) between 3 and 160),
  kind text not null check (kind in ('commission', 'reversal', 'withdrawal', 'withdrawal_returned')),
  amount_cents int not null, -- signed: in is positive, out is negative
  commission_id uuid references affiliate_commissions(id) on delete restrict,
  withdrawal_id uuid references affiliate_withdrawals(id) on delete restrict,
  at timestamptz not null default now()
);
create index if not exists affiliate_ledger_aff on affiliate_ledger (affiliate_id, at desc);
alter table affiliate_ledger enable row level security;
revoke all on affiliate_ledger from anon, authenticated;

-- Who did what (admin decisions and the program's own steps). Append-only.
create table if not exists affiliate_events (
  id bigint generated always as identity primary key,
  affiliate_id uuid references affiliates(id) on delete restrict,
  actor_id uuid references profiles(id),
  event text not null check (char_length(event) <= 60),
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists affiliate_events_aff on affiliate_events (affiliate_id, at desc);
alter table affiliate_events enable row level security;
revoke all on affiliate_events from anon, authenticated;

create or replace function affiliate_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
drop trigger if exists affiliate_ledger_no_change on affiliate_ledger;
create trigger affiliate_ledger_no_change before update or delete on affiliate_ledger for each row execute function affiliate_append_only();
drop trigger if exists affiliate_events_no_change on affiliate_events;
create trigger affiliate_events_no_change before update or delete on affiliate_events for each row execute function affiliate_append_only();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Money moves only through the four functions below (owner, 2026-11-12: atomic and idempotent). Each runs in one transaction: it locks the
-- affiliate's row first (so every money step of one affiliate runs one after the other), then the commission or withdrawal row, checks the
-- state, writes the ledger entry and the new status together, or does nothing. The app cannot write the ledger or the withdrawals directly
-- (see the grants), and a commission's status can change only inside these functions (the guard trigger).

-- Commission rows: created pending by the app; status, approval and reversal only inside the functions; a closed commission's money never changes.
create or replace function affiliate_commission_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('affiliate.in_fn', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.approved_at is not null or new.reversed_at is not null then
      raise exception 'affiliate_commission_guard: a commission starts pending';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.approved_at is distinct from old.approved_at or new.reversed_at is distinct from old.reversed_at then
    raise exception 'affiliate_commission_guard: status changes only through affiliate_approve_commission or affiliate_reverse_commission';
  end if;
  if old.status <> 'pending' and (new.amount_cents <> old.amount_cents or new.basis_cents <> old.basis_cents or new.rate_bps <> old.rate_bps) then
    raise exception 'affiliate_commission_guard: a closed commission never changes';
  end if;
  if new.rate_bps <> old.rate_bps or new.source_ref <> old.source_ref or new.affiliate_id <> old.affiliate_id then
    raise exception 'affiliate_commission_guard: the rate, source and affiliate are fixed';
  end if;
  return new;
end $$;
drop trigger if exists affiliate_commission_guard on affiliate_commissions;
create trigger affiliate_commission_guard before insert or update on affiliate_commissions for each row execute function affiliate_commission_guard();

-- Approve a pending commission: amount = basis x rate (rounded down), booked once. Returns 'approved', or the status it already had, or 'not_found'.
create or replace function affiliate_approve_commission(p_id uuid, p_at timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare
  v_aff uuid;
  c affiliate_commissions%rowtype;
  v_amount int;
begin
  perform set_config('affiliate.in_fn', '1', true);
  select affiliate_id into v_aff from affiliate_commissions where id = p_id;
  if v_aff is null then return 'not_found'; end if;
  perform 1 from affiliates where id = v_aff for update;
  select * into c from affiliate_commissions where id = p_id for update;
  if c.status <> 'pending' then return c.status; end if;
  v_amount := floor(c.basis_cents::numeric * c.rate_bps / 10000)::int;
  if v_amount <= 0 then return 'zero'; end if;
  insert into affiliate_ledger (affiliate_id, entry_key, kind, amount_cents, commission_id, at)
    values (c.affiliate_id, 'commission:' || c.id, 'commission', v_amount, c.id, p_at);
  update affiliate_commissions set status = 'approved', approved_at = p_at, amount_cents = v_amount, updated_at = now() where id = p_id;
  return 'approved';
end $$;

-- Reverse a commission (refund, or an admin who found fraud): an approved one takes its money back out, once. Returns 'reversed',
-- 'already_reversed' or 'not_found'.
create or replace function affiliate_reverse_commission(p_id uuid, p_reason text, p_at timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare
  v_aff uuid;
  c affiliate_commissions%rowtype;
begin
  perform set_config('affiliate.in_fn', '1', true);
  select affiliate_id into v_aff from affiliate_commissions where id = p_id;
  if v_aff is null then return 'not_found'; end if;
  perform 1 from affiliates where id = v_aff for update;
  select * into c from affiliate_commissions where id = p_id for update;
  if c.status = 'reversed' then return 'already_reversed'; end if;
  if c.status = 'approved' then
    insert into affiliate_ledger (affiliate_id, entry_key, kind, amount_cents, commission_id, at)
      values (c.affiliate_id, 'reversal:' || c.id, 'reversal', -c.amount_cents, c.id, p_at);
  end if;
  update affiliate_commissions set status = 'reversed', reversed_at = p_at, reverse_reason = left(coalesce(p_reason, ''), 300), updated_at = now() where id = p_id;
  return 'reversed';
end $$;

-- Ask for a withdrawal: reserves the amount. Only one open request, never more than the balance less what is already reserved.
-- Raises not_found, closed, below_minimum, open_withdrawal or insufficient; returns the new withdrawal's id.
create or replace function affiliate_request_withdrawal(p_affiliate uuid, p_amount int, p_min int, p_method text, p_masked text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a affiliates%rowtype;
  v_balance bigint;
  v_open bigint;
  v_id uuid;
begin
  select * into a from affiliates where id = p_affiliate for update;
  if not found then raise exception 'not_found'; end if;
  if a.status = 'rejected' then raise exception 'closed'; end if;
  if p_amount is null or p_amount <= 0 or p_amount < greatest(coalesce(p_min, 0), 1) then raise exception 'below_minimum'; end if;
  select coalesce(sum(amount_cents), 0) into v_open from affiliate_withdrawals where affiliate_id = p_affiliate and status in ('requested', 'approved');
  if v_open > 0 then raise exception 'open_withdrawal'; end if;
  select coalesce(sum(amount_cents), 0) into v_balance from affiliate_ledger where affiliate_id = p_affiliate;
  if p_amount > v_balance then raise exception 'insufficient'; end if;
  insert into affiliate_withdrawals (affiliate_id, amount_cents, method, details_masked)
    values (p_affiliate, p_amount, left(coalesce(p_method, ''), 40), left(coalesce(p_masked, ''), 80))
    returning id into v_id;
  return v_id;
end $$;

-- An admin decides a withdrawal: approve (requested), reject (requested or approved; the reservation ends) or paid (approved, needs the
-- payout reference; books the money out once). Paid a second time returns 'already_paid' and books nothing. Raises not_found, bad_state,
-- no_reference or insufficient (a commission was reversed after the request); returns the new status.
create or replace function affiliate_decide_withdrawal(p_id uuid, p_action text, p_reference text, p_admin uuid, p_at timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare
  v_aff uuid;
  w affiliate_withdrawals%rowtype;
  v_balance bigint;
  v_ref text := left(btrim(coalesce(p_reference, '')), 120);
begin
  select affiliate_id into v_aff from affiliate_withdrawals where id = p_id;
  if v_aff is null then raise exception 'not_found'; end if;
  perform 1 from affiliates where id = v_aff for update;
  select * into w from affiliate_withdrawals where id = p_id for update;
  if p_action = 'approve' then
    if w.status <> 'requested' then raise exception 'bad_state:%', w.status; end if;
    update affiliate_withdrawals set status = 'approved', decided_by = p_admin, decided_at = p_at where id = p_id;
    return 'approved';
  elsif p_action = 'reject' then
    if w.status not in ('requested', 'approved') then raise exception 'bad_state:%', w.status; end if;
    update affiliate_withdrawals set status = 'rejected', decided_by = p_admin, decided_at = p_at where id = p_id;
    return 'rejected';
  elsif p_action = 'paid' then
    if w.status = 'paid' then return 'already_paid'; end if;
    if w.status <> 'approved' then raise exception 'bad_state:%', w.status; end if;
    if char_length(v_ref) < 3 then raise exception 'no_reference'; end if;
    select coalesce(sum(amount_cents), 0) into v_balance from affiliate_ledger where affiliate_id = w.affiliate_id;
    if v_balance < w.amount_cents then raise exception 'insufficient'; end if;
    insert into affiliate_ledger (affiliate_id, entry_key, kind, amount_cents, withdrawal_id, at)
      values (w.affiliate_id, 'withdrawal:' || w.id, 'withdrawal', -w.amount_cents, w.id, p_at);
    update affiliate_withdrawals set status = 'paid', paid_at = p_at, payout_reference = v_ref, decided_by = coalesce(decided_by, p_admin) where id = p_id;
    return 'paid';
  end if;
  raise exception 'bad_action';
end $$;

revoke all on function affiliate_approve_commission(uuid, timestamptz) from public, anon, authenticated;
revoke all on function affiliate_reverse_commission(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function affiliate_request_withdrawal(uuid, int, int, text, text) from public, anon, authenticated;
revoke all on function affiliate_decide_withdrawal(uuid, text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function affiliate_approve_commission(uuid, timestamptz) to service_role;
grant execute on function affiliate_reverse_commission(uuid, text, timestamptz) to service_role;
grant execute on function affiliate_request_withdrawal(uuid, int, int, text, text) to service_role;
grant execute on function affiliate_decide_withdrawal(uuid, text, text, uuid, timestamptz) to service_role;

-- The server (service key) reads and writes them; browsers never do. No delete grant anywhere. The ledger and the withdrawals are written
-- only by the functions above, so the server may read them but not write them directly. Supabase's default privileges give service_role
-- every right on a new table, so everything is taken away first and only what is needed is given back (found by the real-Postgres test).
revoke all on affiliates, affiliate_clicks, affiliate_attributions, affiliate_commissions, affiliate_withdrawals, affiliate_ledger, affiliate_events from service_role;
grant select, insert, update on affiliates to service_role;
grant select, insert on affiliate_clicks to service_role;
grant select, insert on affiliate_attributions to service_role;
grant select, insert, update on affiliate_commissions to service_role;
grant select on affiliate_withdrawals to service_role;
grant select on affiliate_ledger to service_role;
grant select, insert on affiliate_events to service_role;
grant usage, select on all sequences in schema public to service_role;
