-- Free sample link (public, shown on the listing) and limited trial copy link (private: buyers only get it through a signed, expiring link).
alter table products add column if not exists sample_url text;
alter table products add column if not exists trial_url text;

-- Trial downloads are logged in the same append-only table; for them order_id holds the product id.
alter table download_events drop constraint if exists download_events_kind_check;
alter table download_events add constraint download_events_kind_check check (kind in ('real', 'demo', 'trial'));
