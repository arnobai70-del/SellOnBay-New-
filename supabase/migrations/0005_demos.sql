-- Hosted demo sites. A seller uploads a zip; the server opens it, checks it, and stores the files here.
-- The bucket is private: files are only ever read by the server, which serves them from /demo/<slug>/ inside a sandbox.

alter table products add column if not exists demo_path text;                       -- storage folder (the product id), null = no hosted demo
alter table products add column if not exists demo_entry text not null default 'index.html';
alter table products add column if not exists demo_files int not null default 0;
alter table products add column if not exists demo_bytes bigint not null default 0;

insert into storage.buckets (id, name, public, file_size_limit)
values ('demos', 'demos', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
-- No storage policies on purpose: clients cannot touch this bucket, only the service role can.

create or replace view products_public with (security_invoker = false) as
  select id, slug, seller_id, name, category, tagline, description, includes, theme, price_cents, delivery_days,
         demo_url, license, created_at, (demo_path is not null) as has_demo
  from products where status = 'live';
grant select on products_public to anon, authenticated;
