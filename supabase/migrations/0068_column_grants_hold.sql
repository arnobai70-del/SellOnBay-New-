-- SellOnBay 2.0 security fix (found by the staging RLS suite 2026-10-28; provisional number). Privileges only; no row or column changes.
-- With Supabase's default privileges a table-level grant to anon/authenticated sits beside the narrow column grants the migrations meant,
-- and a column grant cannot narrow a table-level one. Where a policy lets a client touch its own rows this widened what it could do:
--   notifications    authenticated could change every column of their own notifications (only read_at was meant)
--   seller_profiles  authenticated could delete their own seller profile, payout details included (the server deletes it on request)
--   anon             held write privileges on profiles, seller_profiles, notifications and abuse_reports (no row matched, but none is meant)
-- The site writes these through the server (service_role), which keeps its privileges.
-- requires: 0001, 0004, 0020

revoke insert, update, delete, truncate, references, trigger, maintain on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;

revoke delete, truncate, references, trigger, maintain on seller_profiles from anon, authenticated;
revoke insert, update on seller_profiles from anon;

revoke insert, update, delete, truncate, references, trigger, maintain on profiles from anon;
revoke insert, update, delete, truncate, references, trigger, maintain on abuse_reports from anon;
