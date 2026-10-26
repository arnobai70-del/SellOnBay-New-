-- Delivery in hours (owner, 2026-10-27): a seller may promise a number of hours (one of the choices an admin allows) instead of whole days.
-- Both columns are optional: null keeps the old promise of delivery_days (products) or days (orders), so every existing row stays as it is.
-- The order keeps its own copy, so a later edit of the listing never moves an earlier buyer's deadline. 168 hours = the 7-day maximum.
alter table products add column if not exists delivery_hours smallint check (delivery_hours between 1 and 168);
alter table orders add column if not exists delivery_hours smallint check (delivery_hours between 1 and 168);
