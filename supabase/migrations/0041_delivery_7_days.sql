-- Owner decision 2026-10-09: a seller may promise delivery in 1 to 7 days (it was 1 to 3).
alter table products drop constraint if exists products_delivery_days_check;
alter table products add constraint products_delivery_days_check check (delivery_days between 1 and 7);
