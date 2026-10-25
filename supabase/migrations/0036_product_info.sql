-- What a buyer of a digital product is told before buying: where the documentation is, what it needs to run, and for how many days (from the
-- purchase) the seller helps and sends updates. 0 days means "none". Server only (the app reads products with the service key).
alter table products
  add column if not exists docs_url text,
  add column if not exists requirements text,
  add column if not exists support_days integer not null default 0 check (support_days between 0 and 730),
  add column if not exists update_days integer not null default 0 check (update_days between 0 and 730);
