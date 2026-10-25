-- Accepting an order: sets the 7-day payout and bug-fix windows and releases the source files.
-- Only the server (service role) may call these functions.

create or replace function accept_order(p_order uuid, p_actor uuid default null, p_auto boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status <> 'delivered' then return false; end if;

  update orders set
    status = 'accepted',
    accepted_at = now(),
    payout_after = now() + interval '7 days',
    bugfix_until = now() + interval '7 days',
    code_released_at = now()
  where id = p_order;

  insert into order_events (order_id, actor_id, type, detail)
  values (p_order, p_actor, case when p_auto then 'auto_accepted' else 'accepted' end, '{}');
  return true;
end $$;

-- Buyer did nothing for 48 hours after delivery: accept for them.
create or replace function auto_accept_due() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from orders where status = 'delivered' and review_ends_at <= now() loop
    if accept_order(r.id, null, true) then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke execute on function accept_order(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function auto_accept_due() from public, anon, authenticated;

-- Run the auto-accept check every 10 minutes.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'auto-accept-orders';
select cron.schedule('auto-accept-orders', '*/10 * * * *', $$select auto_accept_due()$$);
