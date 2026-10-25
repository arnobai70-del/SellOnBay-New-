-- Table privileges. RLS decides which rows; these grants decide which operations and columns are even allowed.
-- Without them every client query fails with "permission denied". Money and state columns are never writable by clients.

grant usage on schema public to anon, authenticated, service_role;

-- The server (service role) bypasses RLS but still needs table privileges.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Read access for signed-in people. Row visibility is enforced by the RLS policies.
grant select on profiles, seller_profiles, orders, order_events, change_requests, wallets, ledger_entries, payouts,
                messages, blocked_messages, disputes, reviews, domains, deployments, abuse_reports to authenticated;
grant select on reviews to anon;

-- Own profile: name only (role, strikes, banned, flagged stay server-side).
revoke update on profiles from authenticated;
grant update (full_name) on profiles to authenticated;

-- Seller profile: verification flags are never writable by the seller.
grant insert (user_id, display_name, bio, payout_method, payout_ref) on seller_profiles to authenticated;
grant update (display_name, bio, payout_method, payout_ref) on seller_profiles to authenticated;

-- Listings: sellers can create and edit their own. Status changes beyond draft/in_review are admin-only (policies + server).
-- code_url is write-only for clients: it is not in the select grant below.
revoke all on products from anon, authenticated;
grant select (id, slug, seller_id, name, category, tagline, description, includes, theme, price_cents, delivery_days,
              demo_url, license, status, scan_result, created_at, updated_at) on products to authenticated;
grant insert (slug, seller_id, name, category, tagline, description, includes, theme, price_cents, delivery_days,
              demo_url, code_url, license, status) on products to authenticated;
grant update (name, category, tagline, description, includes, theme, price_cents, delivery_days,
              demo_url, code_url, license, status) on products to authenticated;

-- Buyers can open a dispute and leave a review on their own accepted order (policies check ownership).
grant insert (order_id, opened_by, reason, detail, evidence_urls) on disputes to authenticated;
grant insert (order_id, product_id, buyer_id, rating, body) on reviews to authenticated;
grant insert (site_url, reporter_id, reason) on abuse_reports to authenticated;

-- The public catalogue view (no code_url).
grant select on products_public to anon, authenticated;

-- TRUNCATE, TRIGGER and REFERENCES bypass row security. Browser roles must never have them.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
