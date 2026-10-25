-- 1. Admin rights in the database need the authenticator code, like every admin page and API (lib/admin/guard.ts). Before this, an admin signed in
--    with only a password could read every admin-visible table (payout details, orders, messages) straight through the REST API.
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not banned)
$$;

-- 2. Seller profiles (and with them the payout method and account) are written only by the server, which checks the authenticator code, bans and
--    writes the audit log. No page wrote them from the browser; the grant only let a stolen password redirect a seller's payouts.
revoke insert, update on seller_profiles from authenticated;
