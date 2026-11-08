-- Free beta (owner, 2026-11-07): a buyer requests a website, an admin approves or declines, nothing is charged. No ledger row: the record is an order_events row.
-- destructive-ok: the status check is replaced by the same list plus three new states; every existing row still passes (owner's decision, 2026-11-07)
-- requires: orders, products, profiles
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in
  ('draft', 'awaiting_payment', 'payment_review', 'funded', 'release_pending', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'paid_out',
   'disputed', 'fix_requested', 'overdue', 'refunded', 'cancelled', 'beta_requested', 'beta_approved', 'beta_declined'));

create table if not exists beta_requests (
  order_id uuid primary key references orders(id) on delete restrict,
  buyer_id uuid not null references profiles(id) on delete restrict,
  product_id uuid references products(id) on delete restrict,
  product_key text not null,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  country text not null check (country ~ '^[A-Z]{2}$'),
  company text not null default '' check (char_length(company) <= 120),
  use_for text not null check (char_length(use_for) between 3 and 1000),
  domain text not null default '' check (char_length(domain) <= 253),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 500),
  sales_notified_at timestamptz,
  feedback_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists beta_requests_waiting on beta_requests (created_at) where decided_at is null;
create index if not exists beta_requests_buyer on beta_requests (buyer_id, product_key);
alter table beta_requests enable row level security;
revoke all on beta_requests from anon, authenticated;

create table if not exists beta_feedback (
  order_id uuid primary key references beta_requests(order_id) on delete restrict,
  rating int not null check (rating between 1 and 5),
  worked text not null default '' check (char_length(worked) <= 2000),
  improve text not null default '' check (char_length(improve) <= 2000),
  created_at timestamptz not null default now()
);
alter table beta_feedback enable row level security;
revoke all on beta_feedback from anon, authenticated;
