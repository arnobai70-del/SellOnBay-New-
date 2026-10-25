-- Double-entry ledger and idempotent webhooks. Rules and entry shapes live in lib/ledger.ts; the database enforces the ones that protect money:
-- every entry balances, escrow and seller balances never go below zero, the same entry key is posted only once, and rows can never be changed or removed.

-- The first draft tables were never used by any code. A stored balance per user ("wallet") is replaced by sums over the ledger.
drop table if exists wallets;
drop table if exists ledger_entries;

create table ledger_entries (
  id bigint generated always as identity primary key,
  entry_key text not null,               -- one per business event, for example pay:<order>, accept:<order>; makes posting idempotent
  order_id uuid,                         -- no foreign key on purpose: the history must outlive any order row
  account text not null,
  amount_cents bigint not null check (amount_cents > 0),
  side text not null check (side in ('debit', 'credit')),
  memo text not null default '',
  created_at timestamptz not null default now(),
  unique (entry_key, account, side)
);
create index on ledger_entries (account);
create index on ledger_entries (order_id);

create or replace function ledger_append_only() returns trigger language plpgsql as $$
begin raise exception 'ledger_entries is append-only'; end $$;
create trigger ledger_no_update before update or delete on ledger_entries for each row execute function ledger_append_only();
create trigger ledger_no_truncate before truncate on ledger_entries for each statement execute function ledger_append_only();

-- Post one entry set (a jsonb array of {account, amountCents, side}) all or nothing. Returns false if this key was already posted.
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

  -- one writer at a time per account, always in the same order, so two payments cannot both spend the same escrow
  for acc in select distinct x->>'account' as a from jsonb_array_elements(p_lines) x order by 1 loop
    perform pg_advisory_xact_lock(hashtext(acc));
  end loop;
  if exists (select 1 from ledger_entries where entry_key = p_key) then return false; end if;

  begin
    insert into ledger_entries (entry_key, order_id, account, amount_cents, side, memo)
    select p_key, p_order, x->>'account', (x->>'amountCents')::bigint, x->>'side', coalesce(p_memo, '') from jsonb_array_elements(p_lines) x;
  exception when unique_violation then return false;
  end;

  for acc in select distinct account from ledger_entries where entry_key = p_key loop
    if acc like 'order_escrow:%' or acc like 'seller_pending:%' or acc like 'seller_available:%' then
      select coalesce(sum(case side when 'credit' then amount_cents else -amount_cents end), 0) into bal from ledger_entries where account = acc;
      if bal < 0 then raise exception 'ledger: % cannot go below zero', acc; end if;
    end if;
  end loop;
  return true;
end $$;
revoke execute on function ledger_post(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function ledger_post(text, uuid, text, jsonb) to service_role;

create view ledger_balances as
  select account, sum(case side when 'credit' then amount_cents else -amount_cents end)::bigint as net_cents   -- credits minus debits
  from ledger_entries group by account;

-- Payment provider events. The provider's event id is claimed first; a repeat is ignored, so a replayed webhook changes nothing.
create table webhook_events (
  provider text not null,
  event_id text not null,
  type text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table ledger_entries enable row level security;
alter table webhook_events enable row level security;
grant select, insert on ledger_entries to service_role;
grant usage on sequence ledger_entries_id_seq to service_role;
grant select on ledger_balances to service_role;
grant select, insert, delete on webhook_events to service_role;
