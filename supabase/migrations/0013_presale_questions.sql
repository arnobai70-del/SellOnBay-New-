-- Questions a buyer asks a seller before buying. Written only by the server after the chat filter, rate limits and bot check.
-- Blocked attempts go to blocked_messages with the text and the reason, for admins to review.

create table presale_messages (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id) on delete cascade,
  seller_id uuid references profiles(id) on delete set null,   -- null for the made-up starter listings
  product_key text not null,                                   -- listing slug, or the starter id
  body text not null check (char_length(body) between 5 and 600),
  ip text,
  reply text check (reply is null or char_length(reply) between 2 and 600),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index on presale_messages (buyer_id, seller_id, created_at);
create index on presale_messages (seller_id, created_at);
alter table presale_messages enable row level security;
create policy presale_read on presale_messages for select using (buyer_id = auth.uid() or seller_id = auth.uid() or is_admin());
grant select on presale_messages to authenticated;
grant all on presale_messages to service_role;

alter table blocked_messages add column if not exists body text;
alter table blocked_messages add column if not exists context text not null default 'order';
alter table blocked_messages add column if not exists product_key text;
alter table blocked_messages add column if not exists seller_id uuid;
alter table blocked_messages add column if not exists ip text;
grant all on blocked_messages to service_role;
