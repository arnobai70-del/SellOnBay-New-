-- Seller opt-in 24-hour express delivery (spec: $10 to $20). The price is the seller's; the limits live in lib/config.ts and are checked again here.
alter table products add column express_price_cents int check (express_price_cents is null or express_price_cents between 1000 and 2000);
