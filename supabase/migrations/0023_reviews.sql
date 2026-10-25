-- Reviews: only the buyer of an accepted order, one per order, written by the server (lib/reviews.ts). The product's rating is kept up to date by a trigger.
-- Starter listings are not rows in `products`, so a review is tied to the listing by its key (the slug or starter id) and product_id stays optional.

alter table reviews alter column product_id drop not null;
alter table reviews add column product_key text;
alter table reviews add constraint reviews_body_len check (char_length(body) <= 1000);
create index on reviews (product_key);

alter table products add column rating_avg numeric(3, 2), add column rating_count int not null default 0;

create or replace function update_product_rating() returns trigger language plpgsql security definer set search_path = public as $$
declare k text := coalesce(new.product_key, old.product_key);
begin
  update products p set
    rating_avg = (select round(avg(rating)::numeric, 2) from reviews r where r.product_key = p.slug),
    rating_count = (select count(*) from reviews r where r.product_key = p.slug)
  where p.slug = k;
  return coalesce(new, old);
end $$;
create trigger reviews_rating after insert or update or delete on reviews for each row execute function update_product_rating();

-- No client can write a review any more: the server checks that the order is accepted and belongs to the buyer.
drop policy if exists reviews_insert on reviews;
revoke insert on reviews from authenticated;
grant select, insert on reviews to service_role;
