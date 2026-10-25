-- Email queue: a notification's email is written here and sent after the response (and by the scheduled job when that fails), so a slow
-- or broken email provider never slows a page, and a failed email is tried again. One row per notification; the address is looked up at
-- send time and never stored here. Server only. Adds one table and one function; nothing existing changes.
create table email_outbox (
  id bigserial primary key,
  notification_id uuid not null unique references notifications(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  next_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_outbox_due_idx on email_outbox (next_at) where status in ('pending', 'sending');
alter table email_outbox enable row level security;
revoke all on email_outbox from anon, authenticated;
grant select, insert, update on email_outbox to service_role;
grant usage on sequence email_outbox_id_seq to service_role;

-- Takes up to max_rows due emails (or just one, by id) for sending. Each copy of the site gets different rows (skip locked); a taken row is
-- held for five minutes, so a copy that stops mid-send gives it back by itself.
create or replace function claim_email_outbox(max_rows int, only_id bigint default null)
returns table (id bigint, notification_id uuid, attempts int) language sql as $$
  update email_outbox o set status = 'sending', attempts = o.attempts + 1, next_at = now() + interval '5 minutes'
  where o.id in (
    select e.id from email_outbox e
    where e.status in ('pending', 'sending') and e.next_at <= now() and (only_id is null or e.id = only_id)
    order by e.next_at
    limit greatest(least(max_rows, 200), 0)
    for update skip locked
  )
  returning o.id, o.notification_id, o.attempts
$$;
revoke all on function claim_email_outbox(int, bigint) from public, anon, authenticated;
grant execute on function claim_email_outbox(int, bigint) to service_role;
