-- SellOnBay 2.0 security fix (found on the staging project 2026-10-28; provisional number). Only privileges are taken away: no row,
-- column, table or function changes, and the site keeps working because it reads and writes these through the server (service_role).
-- Supabase's default privileges give anon and authenticated every privilege on each object the migration role creates in public. RLS
-- protects the tables, but three objects that run as their owner were open to anyone holding the public anon key:
--   products_public  a security-definer view that Postgres can update: anon could UPDATE, DELETE or INSERT live listings through it
--   ledger_balances  a security-definer view: anon and authenticated could read every account balance
--   bump_counter()   a security-definer function: anon and authenticated could inflate the risk counters
-- requires: 0001 (products_public), 0016 (ledger_balances), 0032 (bump_counter)

revoke insert, update, delete, truncate, references, trigger on products_public from anon, authenticated;
revoke all on ledger_balances from anon, authenticated;
grant select on ledger_balances to service_role;
revoke execute on function bump_counter(date, text, integer) from anon, authenticated;
grant execute on function bump_counter(date, text, integer) to service_role;

-- Nobody outside the server may move a sequence (setval needs UPDATE).
revoke update on all sequences in schema public from anon, authenticated;

-- Objects created from now on by the migration role start closed to the browser roles; each migration grants what a client needs.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
