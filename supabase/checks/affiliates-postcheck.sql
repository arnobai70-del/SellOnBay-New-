-- Affiliate program, AFTER migrations 0086 and 0087 (owner, 2026-11-12). READ ONLY: it changes nothing. Run in Supabase > SQL editor.
-- Every row must say ok = true. Any false: keep the program off and roll back (supabase/rollback/), after a backup.
with t(name) as (values ('affiliates'), ('affiliate_clicks'), ('affiliate_attributions'), ('affiliate_commissions'), ('affiliate_withdrawals'), ('affiliate_ledger'), ('affiliate_events')),
     f(sig) as (values ('affiliate_approve_commission(uuid,timestamp with time zone)'), ('affiliate_reverse_commission(uuid,text,timestamp with time zone)'),
                       ('affiliate_request_withdrawal(uuid,integer,integer,text,text)'), ('affiliate_decide_withdrawal(uuid,text,text,uuid,timestamp with time zone)'))
select 'seven affiliate tables, all with row level security' as check,
       (select count(*) from t join pg_class c on c.relname = t.name and c.relnamespace = 'public'::regnamespace where c.relrowsecurity) = 7 as ok
union all select 'browsers (anon, authenticated) have no right on any affiliate table',
       not exists (select 1 from t, unnest(array['anon', 'authenticated']) r(role), unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p(priv)
                   where has_table_privilege(r.role, 'public.' || t.name, p.priv))
union all select 'the server cannot delete from any affiliate table', not exists (select 1 from t where has_table_privilege('service_role', 'public.' || t.name, 'DELETE'))
union all select 'the server can read but not write the ledger and withdrawals',
       has_table_privilege('service_role', 'public.affiliate_ledger', 'SELECT') and not has_table_privilege('service_role', 'public.affiliate_ledger', 'INSERT')
       and not has_table_privilege('service_role', 'public.affiliate_ledger', 'UPDATE') and not has_table_privilege('service_role', 'public.affiliate_withdrawals', 'INSERT')
       and not has_table_privilege('service_role', 'public.affiliate_withdrawals', 'UPDATE')
union all select 'four money functions: server only', (select bool_and(has_function_privilege('service_role', f.sig, 'EXECUTE') and not has_function_privilege('anon', f.sig, 'EXECUTE')
       and not has_function_privilege('authenticated', f.sig, 'EXECUTE')) from f)
union all select 'money functions are security definer with a fixed search_path',
       (select count(*) from pg_proc where proname in ('affiliate_approve_commission', 'affiliate_reverse_commission', 'affiliate_request_withdrawal', 'affiliate_decide_withdrawal')
        and prosecdef and proconfig::text like '%search_path=public%') = 4
union all select 'guard and append-only triggers in place',
       (select count(*) from pg_trigger where tgname in ('affiliate_commission_guard', 'affiliate_ledger_no_change', 'affiliate_events_no_change') and not tgisinternal) = 3
union all select 'one open withdrawal per affiliate (partial unique index)', to_regclass('public.affiliate_withdrawals_one_open') is not null
union all select 'refund columns on buyer subscription payments (0087)',
       (select count(*) from information_schema.columns where table_name = 'buyer_sub_payments' and column_name in ('refunded_at', 'refunded_by', 'refund_reason')) = 3
union all select 'no affiliate data yet', (select count(*) from affiliates) = 0 and (select count(*) from affiliate_ledger) = 0
union all select 'the program is still off (no setting, or enabled = false)',
       coalesce((select (value::jsonb ->> 'enabled')::boolean from app_settings where key = 'affiliates:settings'), false) = false;
