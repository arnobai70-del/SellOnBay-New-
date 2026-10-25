-- The 3-day paid trial is a fourth kind of package on a hire request.
alter table hire_requests drop constraint if exists hire_requests_pack_check;
alter table hire_requests add constraint hire_requests_pack_check check (pack in ('Basic', 'Standard', 'Premium', 'Trial'));
