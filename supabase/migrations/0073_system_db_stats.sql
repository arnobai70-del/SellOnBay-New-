-- Database size and connections for the admin "Server and system" page (owner, 2026-11-03). Read only: it reports numbers and changes
-- nothing. It runs as its owner to see pg_stat_activity for this database, so only the server (service role) may call it.
create or replace function system_db_stats() returns table (db_bytes bigint, connections integer, max_connections integer)
language sql stable security definer set search_path = public, pg_catalog as $$
  select pg_database_size(current_database()),
         (select count(*)::integer from pg_stat_activity where datname = current_database()),
         current_setting('max_connections')::integer
$$;
revoke all on function system_db_stats() from public, anon, authenticated;
grant execute on function system_db_stats() to service_role;
