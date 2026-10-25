-- Pre-sale questions: the asker's IP address is evidence for admins (abuse, rate limits), not something the seller may read.
-- 0013 granted every column to signed-in users, so a seller could select ip from the browser. Grant the readable columns only.
revoke select on presale_messages from authenticated;
grant select (id, buyer_id, seller_id, product_key, body, reply, replied_at, created_at) on presale_messages to authenticated;
