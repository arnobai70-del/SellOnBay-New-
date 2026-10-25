-- A developer's own trial package: a fixed-price paid test project of 3 to 5 days, at most $150 (spec section 2, limits live in lib/config.ts).
-- Both empty means the site works out a price from the Basic package.
alter table dev_profiles
  add column trial_price_cents int check (trial_price_cents is null or trial_price_cents between 500 and 15000),
  add column trial_days smallint check (trial_days is null or trial_days between 3 and 5),
  add constraint dev_trial_both check ((trial_price_cents is null) = (trial_days is null));
