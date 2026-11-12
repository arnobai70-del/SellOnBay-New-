-- Rollback for 0087_buyer_sub_refunds.sql (owner, 2026-11-12). NOT a migration: run by hand only with the owner's written approval, after a
-- backup. It removes the refund records of buyer subscription payments; roll back 0086 first if the affiliate program relies on them.
-- destructive-ok: rollback script only, never applied automatically; owner approval required before use
drop index if exists buyer_sub_payments_refunded;
alter table buyer_sub_payments drop column if exists refund_reason;
alter table buyer_sub_payments drop column if exists refunded_by;
alter table buyer_sub_payments drop column if exists refunded_at;
