-- Ledger risk rules: a seller reserve (a share of earnings kept back for some days, set by default and overridable per seller), a seller debt
-- account (a claw-back the seller cannot cover is netted off later earnings), and the dispute record (who was at fault and the fee).
-- Server only: clients get nothing.
create table seller_risk (
  seller_id uuid primary key references profiles(id) on delete cascade,
  reserve_percent integer not null check (reserve_percent between 0 and 100),
  reserve_days integer not null check (reserve_days between 0 and 180),
  note text,
  set_by uuid references profiles(id) on delete set null,
  set_at timestamptz not null default now()
);

create table reserves (
  order_id uuid primary key references orders(id) on delete cascade,
  seller_id text not null,
  cents integer not null check (cents > 0),
  release_at timestamptz not null,
  released_at timestamptz,
  released_cents integer,
  payout_id uuid references payouts(id) on delete set null -- the payout that paid the released reserve out
);
create index reserves_due on reserves (release_at) where released_at is null;

alter table disputes
  add column if not exists liability text check (liability in ('seller', 'buyer_fraud', 'platform')),
  add column if not exists fee_cents integer not null default 0 check (fee_cents >= 0),
  add column if not exists fee_charged_cents integer not null default 0 check (fee_charged_cents >= 0);

-- Same function as in 0018, except that a seller's reserve account also may not go below zero.
create or replace function ledger_post(p_key text, p_order uuid, p_memo text, p_lines jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare ln jsonb; d bigint := 0; c bigint := 0; acc text; bal bigint;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then raise exception 'ledger: an entry needs at least two lines'; end if;
  for ln in select * from jsonb_array_elements(p_lines) loop
    if (ln->>'amountCents')::bigint <= 0 then raise exception 'ledger: amounts must be positive'; end if;
    if ln->>'side' = 'debit' then d := d + (ln->>'amountCents')::bigint;
    elsif ln->>'side' = 'credit' then c := c + (ln->>'amountCents')::bigint;
    else raise exception 'ledger: bad side'; end if;
  end loop;
  if d <> c then raise exception 'ledger: entry % does not balance (debits %, credits %)', p_key, d, c; end if;

  for acc in select distinct x->>'account' as a from jsonb_array_elements(p_lines) x order by 1 loop
    perform pg_advisory_xact_lock(hashtext(acc));
  end loop;
  if exists (select 1 from ledger_entries where entry_id = p_key) then return false; end if;

  insert into ledger_accounts (account, kind)
    select distinct x->>'account', split_part(x->>'account', ':', 1) from jsonb_array_elements(p_lines) x
    on conflict (account) do nothing;

  begin
    insert into ledger_entries (entry_id, order_id, account, amount_cents, direction, memo)
    select p_key, p_order, x->>'account', (x->>'amountCents')::bigint, x->>'side', coalesce(p_memo, '') from jsonb_array_elements(p_lines) x;
  exception when unique_violation then return false;
  end;

  for acc in select distinct account from ledger_entries where entry_id = p_key loop
    if acc like 'order_escrow:%' or acc like 'seller_pending:%' or acc like 'seller_available:%' or acc like 'seller_reserve:%' then
      select coalesce(sum(case direction when 'credit' then amount_cents else -amount_cents end), 0) into bal from ledger_entries where account = acc;
      if bal < 0 then raise exception 'ledger: % cannot go below zero', acc; end if;
    end if;
  end loop;
  return true;
end $$;
revoke execute on function ledger_post(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function ledger_post(text, uuid, text, jsonb) to service_role;

alter table seller_risk enable row level security;
alter table reserves enable row level security;
revoke all on seller_risk, reserves from anon, authenticated;
grant select, insert, update, delete on seller_risk to service_role;
grant select, insert, update on reserves to service_role;
