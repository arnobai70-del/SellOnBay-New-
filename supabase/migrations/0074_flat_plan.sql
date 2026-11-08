-- Owner, 2026-11-07: a flat fee, seller 78% and platform 22%. Version 2 of the 'free' plan carries it (the numbers mirror CONFIG.flatPlan; a test compares them).
-- Older plan rows stay, because orders and quotations point at them, and only stop being offered. Their prices and rates are not touched: orders keep the fee they recorded.
-- requires: seller_plans (0057)
insert into seller_plans (code, version, name, monthly_cents, yearly_cents, commission_bps, listing_limit, featured, offered) values
  ('free', 2, 'Standard', 0, 0, 2200, 100, false, true);

update seller_plans set offered = false where (code, version) in (('free', 1), ('pro', 1), ('business', 1));
