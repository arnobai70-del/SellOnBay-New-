// Small stand-ins for the parts of Supabase our migrations touch (roles, auth, storage, cron), for an in-process Postgres (PGlite).
// Used by scripts/check-migrations.mjs and the migration probe test. No real database is ever reached.
import fs from 'node:fs';
import path from 'node:path';

export const STAND_INS = `
  create role anon; create role authenticated; create role service_role;
  -- Like Supabase: everything created in public is open to the browser roles unless a migration takes it back (found on staging, 0067).
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create schema cron; create table cron.job (jobid serial, jobname text);
  create function cron.unschedule(j int) returns boolean language sql as $$ select true $$;
  create function cron.schedule(a text, b text, c text) returns int language sql as $$ select 1 $$;
`;

export const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', '..', 'supabase', 'migrations');

/* The migration files in order, as { file, sql }, with the extensions PGlite does not have taken out. */
export function migrationFiles(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(dir, file), 'utf8') }));
}
export const forPglite = (sql) => sql.replace(/create extension if not exists pg_cron;/g, '').replace(/create extension if not exists pgcrypto;/g, '');
