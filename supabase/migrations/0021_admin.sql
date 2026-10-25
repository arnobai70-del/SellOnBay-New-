-- Admin tools: audit log of every admin action, review notes on listings and developer profiles, weekly payout batches (CSV export, marked paid by hand),
-- and who decided an abuse report. All of it is written by the server; admins read through the app.

-- Every admin action. Never changed or removed. No foreign key on purpose: the record outlives the account.
create table audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid,
  action text not null,
  target_type text not null,
  target_ref text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on audit_log (created_at desc);
create index on audit_log (target_type, target_ref);
create or replace function audit_log_append_only() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_no_change before update or delete on audit_log for each row execute function audit_log_append_only();
create trigger audit_log_no_truncate before truncate on audit_log for each statement execute function audit_log_append_only();
alter table audit_log enable row level security;
create policy audit_log_admin on audit_log for select using (is_admin());
grant select on audit_log to authenticated;
grant select, insert on audit_log to service_role;
grant usage on sequence audit_log_id_seq to service_role;

-- Review decisions: the seller sees the note.
alter table products add column review_note text, add column reviewed_by uuid, add column reviewed_at timestamptz;
alter table dev_profiles add column review_note text, add column reviewed_by uuid, add column reviewed_at timestamptz;

-- Abuse reports: who decided and what they wrote.
alter table abuse_reports add column note text, add column decided_by uuid, add column decided_at timestamptz;

-- Payouts, weekly. A batch row per seller per week: scheduled, then exported in the CSV, then marked paid by an admin with the transfer reference.
alter table payouts alter column status drop default;
alter table payouts alter column status type text using status::text;
alter table payouts alter column status set default 'scheduled';
alter table payouts add constraint payouts_status_check check (status in ('scheduled', 'exported', 'paid', 'failed'));
alter table payouts
  add column week_start date,
  add column reference text,
  add column exported_at timestamptz,
  add column marked_paid_by uuid,
  add column order_count int not null default 0,
  add column created_at timestamptz not null default now();
create unique index payouts_one_per_seller_week on payouts (seller_id, week_start) where status <> 'failed';
grant select, insert, update on payouts to service_role;

alter table seller_profiles drop constraint if exists seller_profiles_payout_method_check;
alter table seller_profiles add constraint seller_profiles_payout_method_check check (payout_method in ('bank', 'payoneer', 'wise'));

-- Which orders a payout pays. An order can be in only one payout; a failed payout releases its orders again.
create table payout_items (
  order_id uuid primary key,
  payout_id uuid not null references payouts(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0)
);
create index on payout_items (payout_id);
alter table payout_items enable row level security;
grant select, insert, delete on payout_items to service_role;
