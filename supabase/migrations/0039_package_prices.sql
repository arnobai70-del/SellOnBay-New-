-- The seller sets the price of "with setup help" and "with customisation" for their own listing. 0 means the seller does not offer it.
-- Existing listings keep what every listing had before: $30 and $100. Server only (the app reads products with the service key).
alter table products
  add column if not exists setup_price_cents integer not null default 3000 check (setup_price_cents between 0 and 100000),
  add column if not exists custom_price_cents integer not null default 10000 check (custom_price_cents between 0 and 500000);
