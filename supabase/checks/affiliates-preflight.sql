-- Affiliate program, BEFORE migrations 0086 and 0087 (owner, 2026-11-12). READ ONLY: it changes nothing. Run in Supabase > SQL editor.
-- Every row must say ok = true. Any false: stop, do not apply the migrations.
select 'buyer subscriptions (0085) are in' as check, to_regclass('public.buyer_sub_payments') is not null as ok
union all select 'no affiliate tables yet (0086 not applied)', to_regclass('public.affiliates') is null and to_regclass('public.affiliate_ledger') is null
union all select 'no refund columns yet (0087 not applied)', not exists (select 1 from information_schema.columns where table_name = 'buyer_sub_payments' and column_name = 'refunded_at')
union all select 'no function name clash', not exists (select 1 from pg_proc where proname like 'affiliate\_%')
union all select 'profiles table present', to_regclass('public.profiles') is not null
union all select 'app_settings present', to_regclass('public.app_settings') is not null
union all select 'affiliate program setting absent (= off)', not exists (select 1 from app_settings where key = 'affiliates:settings')
union all select 'gen_random_uuid available', exists (select 1 from pg_proc where proname = 'gen_random_uuid');
