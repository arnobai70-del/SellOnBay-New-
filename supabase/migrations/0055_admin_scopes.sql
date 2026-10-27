-- SellOnBay 2.0, Phase 1 (placeholder P01; the final number is chosen after the production migration history is reconciled).
-- Admin permissions (owner decision D-H): Super Admin plus scoped Finance, Catalog, Support, Content and Delivery. "negotiator" is reserved for a
-- later role and is refused by the code until the owner enables it.
-- Null keeps today's behaviour for existing admins (treated as Super Admin by lib/admin/scopes.ts) until a Super Admin assigns scopes.
-- Only the server writes this column: clients may update full_name and nothing else on profiles (0004_grants.sql), and that stays so.
-- requires: profiles
alter table profiles add column if not exists admin_scopes text[]
  check (admin_scopes is null or admin_scopes <@ array['super', 'finance', 'catalog', 'support', 'content', 'delivery', 'negotiator']::text[]);
