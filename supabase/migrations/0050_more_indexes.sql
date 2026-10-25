-- Indexes for lookups the code already makes on every request or job, found by matching each .eq() filter in lib/ and app/ against the
-- indexes of 0001-0049. Adds indexes only; no table, column or row changes. The tables are small today, so a plain create index is quick;
-- on a big table later, build the index with "create index concurrently" by hand first (outside a transaction) and this file then skips it.
create index if not exists blocked_messages_sender_created_idx on blocked_messages (sender_id, created_at desc); -- chat strikes count per sender
create index if not exists products_seller_idx on products (seller_id); -- seller dashboard, data export, account deletion
create index if not exists hire_requests_buyer_idx on hire_requests (buyer_id, created_at desc); -- buyer dashboard
create index if not exists abuse_reports_reporter_idx on abuse_reports (reporter_id); -- reports per reporter
create index if not exists disputes_opened_by_idx on disputes (opened_by); -- rejected disputes per buyer
create index if not exists disputes_status_idx on disputes (status); -- admin dispute queue
create index if not exists download_events_user_idx on download_events (user_id, created_at desc); -- download limits and data export
create index if not exists payouts_status_idx on payouts (status); -- weekly payout screen
create index if not exists reviews_buyer_idx on reviews (buyer_id); -- one review per buyer and data export
create index if not exists change_requests_order_idx on change_requests (order_id); -- extra work on an order page
create index if not exists order_consents_user_idx on order_consents (user_id); -- data export
create index if not exists profiles_role_idx on profiles (role); -- finding the admins to notify
