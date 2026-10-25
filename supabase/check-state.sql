-- READ ONLY. Paste into Supabase > SQL Editor and run. It changes nothing.
-- It shows which parts of the schema already exist, so you know which migration files (supabase/migrations) are still to apply.
-- Apply the missing ones in number order, one at a time, after a backup (docs/HOSTINGER_UPLOAD.md).

-- 1. Tables made by the later migrations. A row with exists = false means that migration has not been applied.
select m.migration, m.tbl as what, to_regclass('public.' || m.tbl) is not null as exists
from (values
  ('0031_abuse_hardening', 'security_events'),
  ('0031_abuse_hardening', 'blocks'),
  ('0032_risk', 'daily_counters'),
  ('0032_risk', 'switches'),
  ('0032_risk', 'order_holds'),
  ('0033_ledger_risk', 'seller_risk'),
  ('0033_ledger_risk', 'reserves'),
  ('0034_consents', 'order_consents'),
  ('0037_product_versions', 'product_versions'),
  ('0038_repo_access', 'repo_access_tasks'),
  ('0040_app_settings', 'app_settings'),
  ('0042_ai_atomic_quotas', 'ai_run_reservations'),
  ('0048_posts', 'posts'),
  ('0049_module_maintenance', 'module_maintenance'),
  ('0049_module_maintenance', 'module_maintenance_history'),
  ('0051_email_outbox', 'email_outbox'),
  ('0052_visitor_analytics', 'analytics_visitors'),
  ('0052_visitor_analytics', 'analytics_hits'),
  ('0052_visitor_analytics', 'analytics_reports')
) as m(migration, tbl)
order by m.migration, m.tbl;

-- 2. Columns added to products by the middle migrations.
select m.migration, m.col as what, exists (
  select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'products' and c.column_name = m.col
) as exists
from (values
  ('0036_product_info', 'docs_url'),
  ('0036_product_info', 'support_days'),
  ('0039_package_prices', 'setup_price_cents'),
  ('0039_package_prices', 'custom_price_cents'),
  ('0022_express', 'express_price_cents'),
  ('0014_sample_trial', 'sample_url')
) as m(migration, col)
order by m.migration;

-- 3. The private file buckets the site needs (public must be false for both).
select id, public from storage.buckets where id in ('demos', 'certificates') order by id;

-- 4. Row counts that matter before any change: money and accounts (these tables must never be emptied).
select 'profiles' as what, count(*) from public.profiles
union all select 'products', count(*) from public.products
union all select 'orders', count(*) from public.orders;

-- 5. If you applied migrations with the Supabase CLI, this lists them (it fails with "does not exist" if you pasted the files by hand; that is fine).
-- select version, name from supabase_migrations.schema_migrations order by version;
