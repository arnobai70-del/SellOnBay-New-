-- Listings are written only by the server (POST /api/listings and the admin pages, with the service role), which checks the seller's role,
-- the authenticator code, bans, rate limits, links, prices and the scan. The insert and update grants from 0004 let any signed-in account
-- write a listing straight through Supabase and skip all of that, so they are taken away. Reads are unchanged; code_url stays unreadable.
revoke insert, update, delete on products from anon, authenticated;
drop policy if exists products_insert on products;
drop policy if exists products_update on products;
