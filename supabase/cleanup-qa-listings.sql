-- Removes the 94 test listings of the "QA Seller" accounts (all waiting for review, no orders). Matteo Schiltz's real "Fashion Store" is not touched.
begin;
create temp table qa_ids on commit drop as
  select p.id from products p join profiles pr on pr.id = p.seller_id
  where pr.full_name = 'QA Seller' and p.status = 'in_review';
delete from scan_results where product_id in (select id from qa_ids);
delete from product_files where product_id in (select id from qa_ids);
delete from product_versions where product_id in (select id from qa_ids);
delete from reviews where product_id in (select id from qa_ids);
delete from products where id in (select id from qa_ids);
commit;
-- Check: only Fashion Store should be left.
select p.status, count(*), pr.full_name from products p left join profiles pr on pr.id = p.seller_id group by 1, 3;
