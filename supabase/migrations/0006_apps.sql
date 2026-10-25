-- Mobile apps beside websites: one products table, a platform column, and screenshots instead of a hosted zip.

alter table products add column if not exists platform text not null default 'web' check (platform in ('web', 'android', 'ios'));
alter table products add column if not exists app_stack text;
alter table products add column if not exists app_shots text[] not null default '{}';   -- file names under <product id>/ in the private demos bucket
create index if not exists products_platform_idx on products (platform, status);

grant select (platform, app_stack, app_shots) on products to authenticated;

create or replace view products_public with (security_invoker = false) as
  select id, slug, seller_id, name, category, tagline, description, includes, theme, price_cents, delivery_days,
         demo_url, license, created_at, (demo_path is not null) as has_demo, platform, app_stack
  from products where status = 'live';
grant select on products_public to anon, authenticated;
