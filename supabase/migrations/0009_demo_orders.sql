-- Demo commerce: orders paid through the demo gateway. One jsonb document per order, written only by the server (service role).
-- This stays until the real payment provider is connected; real orders then use the orders table from 0001.
create table demo_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references profiles(id) on delete set null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table demo_orders enable row level security;
grant all on demo_orders to service_role;
