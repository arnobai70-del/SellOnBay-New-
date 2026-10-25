-- Brings the ledger to the shape the spec names: ledger_accounts, and ledger_entries(entry_id, account, order_id, amount_cents, direction, memo).
-- Renames the two columns of 0016 and records every account in ledger_accounts. Data is kept.

alter table ledger_entries rename column entry_key to entry_id;
alter table ledger_entries rename column side to direction;

create table ledger_accounts (
  account text primary key,
  kind text not null,                    -- platform_cash, platform_revenue, order_escrow, seller_pending, seller_available, payout_out
  created_at timestamptz not null default now()
);
insert into ledger_accounts (account, kind)
  select distinct account, split_part(account, ':', 1) from ledger_entries
  on conflict (account) do nothing;
alter table ledger_accounts enable row level security;
grant select, insert on ledger_accounts to service_role;

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
    if acc like 'order_escrow:%' or acc like 'seller_pending:%' or acc like 'seller_available:%' then
      select coalesce(sum(case direction when 'credit' then amount_cents else -amount_cents end), 0) into bal from ledger_entries where account = acc;
      if bal < 0 then raise exception 'ledger: % cannot go below zero', acc; end if;
    end if;
  end loop;
  return true;
end $$;
revoke execute on function ledger_post(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function ledger_post(text, uuid, text, jsonb) to service_role;
