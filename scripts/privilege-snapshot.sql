-- Read-only privilege snapshot (docs/LAUNCH_READINESS.md section 2). SELECT only: no writes, no row data, no secrets.
-- Run the same file on staging and, with the owner's written approval, on production, then diff the two outputs line by line.
-- Every row is one fact: kind | object | role | detail.
with roles as (select unnest(array['anon', 'authenticated', 'public']) as r)
select * from (
  -- table and view privileges for the client roles
  select 'table' as kind, c.relname as object, g.grantee as role, string_agg(g.privilege_type, ',' order by g.privilege_type) as detail
  from information_schema.role_table_grants g
  join pg_class c on c.relname = g.table_name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = g.table_schema
  where g.table_schema = 'public' and g.grantee in (select r from roles)
  group by c.relname, g.grantee
  union all
  -- MAINTAIN is not in information_schema: read it from the ACL
  select 'maintain', c.relname, a.grantee::regrole::text, 'MAINTAIN'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral aclexplode(c.relacl) a
  where n.nspname = 'public' and a.privilege_type = 'MAINTAIN' and a.grantee <> 0 and a.grantee::regrole::text in (select r from roles)
  union all
  -- column privileges (narrow grants such as notifications.read_at)
  select 'column', table_name || '.' || column_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.column_privileges
  where table_schema = 'public' and grantee in (select r from roles)
  group by table_name, column_name, grantee
  union all
  -- functions the client roles may call
  select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', a.grantee_name, 'EXECUTE'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       lateral (select case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as grantee_name
                from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.privilege_type = 'EXECUTE') a
  where n.nspname = 'public' and a.grantee_name in (select r from roles)
  union all
  -- sequences
  select 'sequence', c.relname, a.grantee::regrole::text, string_agg(a.privilege_type, ',' order by a.privilege_type)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, lateral aclexplode(c.relacl) a
  where n.nspname = 'public' and c.relkind = 'S' and a.grantee <> 0 and a.grantee::regrole::text in (select r from roles)
  group by c.relname, a.grantee
  union all
  -- row level security on every table
  select 'rls', c.relname, '-', case when c.relrowsecurity then 'on' else 'OFF' end || case when c.relforcerowsecurity then ',forced' else '' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  union all
  -- policies (names, command and roles; the expressions are compared by hash so the output stays short)
  select 'policy', tablename || '.' || policyname, array_to_string(roles, ','), cmd || ' ' || md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
  from pg_policies where schemaname = 'public'
  union all
  -- default privileges that new objects will get
  select 'default', d.defaclobjtype::text, a.grantee::regrole::text, string_agg(a.privilege_type, ',' order by a.privilege_type)
  from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace, lateral aclexplode(d.defaclacl) a
  where n.nspname = 'public' and a.grantee <> 0 and a.grantee::regrole::text in (select r from roles)
  group by d.defaclobjtype, a.grantee
  union all
  -- storage buckets: public or not
  select 'bucket', id, '-', case when public then 'PUBLIC' else 'private' end from storage.buckets
) facts
order by kind, object, role;
