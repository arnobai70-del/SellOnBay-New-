-- The log of a buyer's "I accept" click (time, address, browser, device, version of the words). Evidence for disputes and chargebacks, so it is append-only:
-- a row can only disappear together with its order. Server only: clients get nothing.
create table order_consents (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  kind text not null check (kind in ('accept')),
  text_version text not null,
  ip text,
  user_agent text,
  device_hash text,
  created_at timestamptz not null default now()
);
create index order_consents_order on order_consents (order_id, created_at);

create or replace function order_consents_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from orders where id = old.order_id) then return old; end if;
  -- the only edit allowed is the database clearing the user id when an account is deleted
  if tg_op = 'UPDATE' and new.user_id is null and old.user_id is not null
     and new.id = old.id and new.order_id = old.order_id and new.kind = old.kind and new.text_version = old.text_version
     and new.ip is not distinct from old.ip and new.user_agent is not distinct from old.user_agent
     and new.device_hash is not distinct from old.device_hash and new.created_at = old.created_at then return new; end if;
  raise exception 'order_consents is append-only';
end $$;
create trigger order_consents_no_update before update on order_consents for each row execute function order_consents_append_only();
create trigger order_consents_no_delete before delete on order_consents for each row execute function order_consents_append_only();
create or replace function order_consents_no_truncate() returns trigger language plpgsql as $$
begin raise exception 'order_consents is append-only'; end $$;
create trigger order_consents_no_truncate before truncate on order_consents for each statement execute function order_consents_no_truncate();

alter table order_consents enable row level security;
revoke all on order_consents from anon, authenticated;
grant select, insert on order_consents to service_role;
