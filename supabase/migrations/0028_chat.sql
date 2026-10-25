-- Order chat (spec 8.4). Messages are written only by the server, after the contact-details filter and a rate limit; blocked ones go to blocked_messages
-- and count as strikes. The two people on the order read them (policy from 0001), and Supabase Realtime tells their browsers a new one arrived.

alter table messages add column sender_role text check (sender_role in ('buyer', 'seller', 'admin'));
create index if not exists messages_order_time on messages (order_id, created_at);
grant select, insert on messages to service_role;

-- Realtime only exists on Supabase. Elsewhere this is skipped without error. The row-level policy still decides who receives each change.
do $$ begin
  alter publication supabase_realtime add table messages;
exception when others then null;
end $$;
