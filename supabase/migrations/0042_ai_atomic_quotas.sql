-- Atomic quota claims for future billable AI models. Migration 0029 must run first.
-- This does not turn on a paid provider. All RPC access is service-role only.
create table ai_run_reservations (
  id uuid primary key default gen_random_uuid(),
  tool text not null,
  day date not null,
  cookie_subject text not null,
  ip_subject text not null,
  reserved_tokens bigint not null check (reserved_tokens > 0),
  charged_tokens bigint,
  state text not null default 'pending' check (state in ('pending', 'settled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint ai_charge_within_reservation check (charged_tokens is null or (charged_tokens >= 0 and charged_tokens <= reserved_tokens))
);
create index ai_reservations_month_pending on ai_run_reservations (day) where state = 'pending';
alter table ai_run_reservations enable row level security;
revoke all on ai_run_reservations from anon, authenticated;
grant select, insert, update on ai_run_reservations to service_role;

-- One transactional advisory lock serializes ALL AI tools' reservations and
-- settlements. It is intentionally global: limit checking must be race-free.
create function ai_reserve_run(
  p_tool text, p_cookie_subject text, p_ip_subject text,
  p_day date, p_daily_limit integer, p_monthly_budget bigint, p_reserved_tokens bigint
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cookie_count integer := 0;
  v_ip_count integer := 0;
  v_spent bigint := 0;
  v_pending bigint := 0;
  v_id uuid;
  v_month_start date;
begin
  if p_tool is null or length(p_tool) not between 1 and 64
     or p_cookie_subject is null or length(p_cookie_subject) not between 8 and 256 or p_cookie_subject not like 'cookie:%'
     or p_ip_subject is null or length(p_ip_subject) not between 8 and 256 or p_ip_subject not like 'ip:%'
     or p_cookie_subject = p_ip_subject or p_day is null
     or p_daily_limit is null or p_daily_limit not between 1 and 100
     or p_monthly_budget is null or p_monthly_budget < 1
     or p_reserved_tokens is null or p_reserved_tokens < 1 or p_reserved_tokens > 1000000
  then
    raise exception 'Invalid AI reservation arguments';
  end if;

  perform pg_advisory_xact_lock(58332, 1);
  select coalesce(count, 0) into v_cookie_count
    from ai_usage where subject = p_cookie_subject and day = p_day and tool = p_tool;
  if not found then v_cookie_count := 0; end if;
  select coalesce(count, 0) into v_ip_count
    from ai_usage where subject = p_ip_subject and day = p_day and tool = p_tool;
  if not found then v_ip_count := 0; end if;
  if greatest(v_cookie_count, v_ip_count) >= p_daily_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily');
  end if;

  v_month_start := date_trunc('month', p_day)::date;
  select coalesce(sum(tokens_in + tokens_out), 0) into v_spent
    from ai_usage where subject = 'global' and day >= v_month_start
    and day < (v_month_start + interval '1 month')::date;
  select coalesce(sum(reserved_tokens), 0) into v_pending
    from ai_run_reservations where state = 'pending'
    and day >= v_month_start and day < (v_month_start + interval '1 month')::date;
  if v_spent + v_pending + p_reserved_tokens > p_monthly_budget then
    return jsonb_build_object('allowed', false, 'reason', 'budget');
  end if;

  insert into ai_run_reservations(tool, day, cookie_subject, ip_subject, reserved_tokens)
    values (p_tool, p_day, p_cookie_subject, p_ip_subject, p_reserved_tokens)
    returning id into v_id;
  insert into ai_usage (subject, day, tool, count, tokens_in, tokens_out)
    values (p_cookie_subject, p_day, p_tool, 1, 0, 0)
    on conflict (subject, day, tool) do update set count = ai_usage.count + 1;
  insert into ai_usage (subject, day, tool, count, tokens_in, tokens_out)
    values (p_ip_subject, p_day, p_tool, 1, 0, 0)
    on conflict (subject, day, tool) do update set count = ai_usage.count + 1;
  return jsonb_build_object('allowed', true, 'id', v_id,
    'left', greatest(0, p_daily_limit - greatest(v_cookie_count, v_ip_count) - 1));
end $$;
revoke all on function ai_reserve_run(text, text, text, date, integer, bigint, bigint) from public, anon, authenticated;
grant execute on function ai_reserve_run(text, text, text, date, integer, bigint, bigint) to service_role;

-- Idempotent finalisation. Unknown provider cost should be charged at the
-- RESERVED upper bound by the caller, never silently released on failure.
-- A crashed process leaves its pending reserve counted until audited manually.
create function ai_settle_run(p_id uuid, p_charged_tokens bigint)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v ai_run_reservations%rowtype;
begin
  if p_id is null or p_charged_tokens is null or p_charged_tokens < 0
    then raise exception 'Invalid AI settlement arguments'; end if;
  perform pg_advisory_xact_lock(58332, 1);
  select * into v from ai_run_reservations where id = p_id for update;
  if not found then return false; end if;
  if v.state = 'settled' then return true; end if;
  if p_charged_tokens > v.reserved_tokens then
    raise exception 'AI actual tokens exceeded reservation; manual reconciliation required';
  end if;

  insert into ai_usage (subject, day, tool, count, tokens_in, tokens_out)
    values ('global', v.day, v.tool, 0, p_charged_tokens, 0)
    on conflict (subject, day, tool)
    do update set tokens_in = ai_usage.tokens_in + excluded.tokens_in;
  update ai_run_reservations set state = 'settled',
    charged_tokens = p_charged_tokens, settled_at = now() where id = p_id;
  return true;
end $$;
revoke all on function ai_settle_run(uuid, bigint) from public, anon, authenticated;
grant execute on function ai_settle_run(uuid, bigint) to service_role;
