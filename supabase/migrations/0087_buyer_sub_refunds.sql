-- Buyer subscription refunds (owner, 2026-11-12). Adds only: three nullable columns on buyer_sub_payments, so an admin can record that a
-- verified payment was refunded (by hand, outside SellOnBay, like the payment itself). Nothing existing changes; a payment without these
-- columns set is not refunded. The affiliate program reads refunded_at and reverses the commission of a refunded payment automatically.
-- requires: buyer_sub_payments (0085)
alter table buyer_sub_payments add column if not exists refunded_at timestamptz;
alter table buyer_sub_payments add column if not exists refunded_by uuid references profiles(id);
alter table buyer_sub_payments add column if not exists refund_reason text check (refund_reason is null or char_length(refund_reason) <= 300);
create index if not exists buyer_sub_payments_refunded on buyer_sub_payments (refunded_at) where refunded_at is not null;
