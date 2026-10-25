-- Risk tools: daily counters (for the admin metrics and the unusual-rise alerts), emergency switches, and orders held for a safety check.
-- Server only: clients get nothing.
create table daily_counters (
  day date not null,
  key text not null,
  n integer not null default 0,
  primary key (day, key)
);
create function bump_counter(p_day date, p_key text, p_n integer) returns void language sql security definer set search_path = public as $$
  insert into daily_counters (day, key, n) values (p_day, p_key, p_n)
  on conflict (day, key) do update set n = daily_counters.n + excluded.n
$$;
revoke all on function bump_counter(date, text, integer) from public;
grant execute on function bump_counter(date, text, integer) to service_role;

create table switches (
  key text primary key,
  enabled boolean not null default false,
  reason text,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table order_holds (
  order_id uuid primary key references orders(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id) on delete set null,
  outcome text check (outcome in ('released', 'cancelled')),
  note text
);
create index order_holds_open on order_holds (created_at) where decided_at is null;

alter table daily_counters enable row level security;
alter table switches enable row level security;
alter table order_holds enable row level security;
revoke all on daily_counters, switches, order_holds from anon, authenticated;
grant select, insert, update on daily_counters to service_role;
grant select, insert, update on switches to service_role;
grant select, insert, update on order_holds to service_role;
