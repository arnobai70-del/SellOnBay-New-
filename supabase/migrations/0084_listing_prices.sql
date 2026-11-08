-- Real launch prices and sales only (owner, 2026-11-08). A history of every price a listing had (kept by a trigger, so no code path can skip it),
-- and the sale records. During a sale the listing's price IS the sale price (set and reset by the scheduled job), so the history shows what was
-- really charged. Server only.
-- requires: products, profiles
create table if not exists listing_price_history (
  id bigserial primary key,
  product_id uuid not null references products(id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  from_creation boolean not null default false, -- true when this row starts at the listing's creation (the history is complete from there)
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists listing_price_history_product on listing_price_history (product_id, valid_from desc);
create unique index if not exists listing_price_history_open on listing_price_history (product_id) where valid_to is null;
alter table listing_price_history enable row level security;
revoke all on listing_price_history from anon, authenticated;
grant select on listing_price_history to service_role;

create or replace function record_listing_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into listing_price_history (product_id, price_cents, valid_from, from_creation) values (new.id, new.price_cents, now(), true);
  elsif new.price_cents is distinct from old.price_cents then
    update listing_price_history set valid_to = now() where product_id = new.id and valid_to is null;
    insert into listing_price_history (product_id, price_cents, valid_from) values (new.id, new.price_cents, now());
  end if;
  return new;
end
$$;
revoke all on function record_listing_price() from public, anon, authenticated;
drop trigger if exists products_price_history on products;
create trigger products_price_history after insert or update of price_cents on products for each row execute function record_listing_price();

-- Listings that exist today start their history now: nothing is known about their earlier prices, so no "was" price can be shown for them
-- until 30 days of history exist (the EU rule needs the lowest price of the 30 days before a sale).
insert into listing_price_history (product_id, price_cents, valid_from)
select p.id, p.price_cents, now() from products p
where not exists (select 1 from listing_price_history h where h.product_id = p.id);

create table if not exists listing_sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  kind text not null check (kind in ('launch', 'sale')),
  regular_cents integer not null check (regular_cents >= 2000),
  sale_cents integer not null check (sale_cents >= 2000 and sale_cents < regular_cents),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at and ends_at <= starts_at + interval '30 days'),
  started_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists listing_sales_product on listing_sales (product_id, starts_at desc);
create index if not exists listing_sales_due on listing_sales (starts_at, ends_at) where ended_at is null and cancelled_at is null;
alter table listing_sales enable row level security;
revoke all on listing_sales from anon, authenticated;
grant select, insert, update on listing_sales to service_role;
