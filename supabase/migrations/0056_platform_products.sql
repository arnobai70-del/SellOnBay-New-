-- SellOnBay 2.0, Phase 2 (placeholder P02; provisional number).
-- 1. Who owns a product: an external seller (as every product until now) or SellOnBay itself. Platform-owned products carry no external seller
--    commission split (O-2). Every existing row keeps 'seller'.
-- 2. One shared trigger function that makes a table append-only, used by the 2.0 event and history tables. It names the table in its error.
-- requires: products
alter table products add column if not exists owner_type text not null default 'seller' check (owner_type in ('seller', 'platform'));

create or replace function sob_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
