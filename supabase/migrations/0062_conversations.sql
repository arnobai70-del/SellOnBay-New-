-- SellOnBay 2.0, Phase 7 (placeholders P14 + P17; provisional number). Admin-mediated communication (owner decision D-B) and support tickets.
-- Three channels about a request, an order or a support ticket: buyer <-> SellOnBay, SellOnBay <-> seller, and internal notes for admins only.
-- A buyer and a seller never write to each other. The old buyer-seller chat (`messages`) is not changed: it stays readable to its two
-- participants and to Support, and receives no new messages (the routes refuse them).
-- requires: profiles, orders, purchase_requests (0059), sob_append_only (0056)

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references profiles(id) on delete restrict,
  opener_role text not null check (opener_role in ('buyer', 'seller')),
  order_id uuid references orders(id) on delete restrict,
  subject text not null check (char_length(subject) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'waiting_user', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_open on support_tickets (status, updated_at);
create index support_tickets_user on support_tickets (opened_by, created_at desc);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('request', 'order', 'ticket')),
  subject_id uuid not null,
  channel text not null check (channel in ('buyer_admin', 'admin_seller', 'internal')),
  sender_id uuid references profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('buyer', 'seller', 'admin')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  -- a buyer writes only in buyer_admin, a seller only in admin_seller; internal is admins only
  check ((sender_role = 'buyer' and channel = 'buyer_admin') or (sender_role = 'seller' and channel = 'admin_seller') or sender_role = 'admin')
);
create index conversation_messages_subject on conversation_messages (subject_type, subject_id, channel, created_at);
create trigger conversation_messages_no_change before update or delete on conversation_messages for each row execute function sob_append_only();
create trigger conversation_messages_no_truncate before truncate on conversation_messages for each statement execute function sob_append_only();

alter table support_tickets enable row level security;
alter table conversation_messages enable row level security;
revoke all on support_tickets, conversation_messages from anon, authenticated;
-- No client grants: the server checks who is part of which channel before reading or writing.
grant select, insert, update on support_tickets to service_role;
grant select, insert on conversation_messages to service_role;
