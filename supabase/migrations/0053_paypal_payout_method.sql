-- Sellers can choose PayPal as the way they are paid (owner, 2026-10-23). Only widens the allowed list; nothing existing changes or is removed.
-- destructive-ok: the old check is replaced by the same check plus 'paypal'; every row that passed before still passes (owner asked for PayPal payouts)
alter table seller_profiles drop constraint if exists seller_profiles_payout_method_check;
alter table seller_profiles add constraint seller_profiles_payout_method_check check (payout_method in ('bank', 'payoneer', 'wise', 'paypal'));
