-- What a digital listing promised when it was bought: days of seller support and of new versions, counted from the purchase.
-- A seller can change these on the listing at any time (text edits save at once), so the order keeps its own copy and a later
-- shorter period never cuts off an earlier buyer. Null = an order made before this migration; the code then uses the listing's current value.
alter table orders
  add column if not exists support_days integer check (support_days between 0 and 730),
  add column if not exists update_days integer check (update_days between 0 and 730);
