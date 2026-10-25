-- Visitor analytics for the admin dashboard (owner, 2026-10-21): daily visitors, repeat visitors, product and category opens, Buy clicks and
-- a stored daily report. No cookie: a visitor is a keyed hash of the connection address and browser, made on the server (lib/analytics.ts);
-- the address itself is never stored. Rows are kept CONFIG.analytics.keepDays days. Server only. Adds three tables and four functions;
-- nothing existing changes.
create table analytics_visitors (
  visitor text primary key check (char_length(visitor) between 8 and 64),
  first_day date not null,
  last_day date not null
);
create index analytics_visitors_last_idx on analytics_visitors (last_day);

-- One row per visitor, day, kind of event and key (a page, a product id or a category); n counts repeats, capped so one visitor cannot
-- inflate a number.
create table analytics_hits (
  day date not null,
  visitor text not null,
  event text not null check (event in ('visit', 'page', 'product', 'category', 'buy')),
  key text not null default '' check (char_length(key) <= 120),
  n int not null default 1 check (n between 1 and 50),
  primary key (day, event, key, visitor)
);

create table analytics_reports (
  day date primary key,
  report jsonb not null,
  made_at timestamptz not null default now()
);

alter table analytics_visitors enable row level security;
alter table analytics_hits enable row level security;
alter table analytics_reports enable row level security;
revoke all on analytics_visitors, analytics_hits, analytics_reports from anon, authenticated;
grant select, insert, update, delete on analytics_visitors, analytics_hits to service_role;
grant select, insert, update on analytics_reports to service_role;

-- Records one event. The visitor's first and last day are kept so a later day can tell a returning visitor from a new one.
create or replace function analytics_hit(p_day date, p_visitor text, p_event text, p_key text default '')
returns void language sql as $$
  insert into analytics_visitors (visitor, first_day, last_day) values (p_visitor, p_day, p_day)
  on conflict (visitor) do update set first_day = least(analytics_visitors.first_day, excluded.first_day),
    last_day = greatest(analytics_visitors.last_day, excluded.last_day);
  insert into analytics_hits (day, visitor, event, key) values (p_day, p_visitor, p_event, coalesce(p_key, ''))
  on conflict (day, event, key, visitor) do update set n = least(analytics_hits.n + 1, 50);
$$;

-- One line per day in the range: visitors, of them repeat visitors (first seen on an earlier day), and the event totals.
create or replace function analytics_days(p_from date, p_to date)
returns table (day date, visitors bigint, repeat_visitors bigint, pages bigint, products bigint, categories bigint, buys bigint)
language sql stable as $$
  select h.day,
    count(distinct h.visitor) filter (where h.event = 'visit'),
    count(distinct h.visitor) filter (where h.event = 'visit' and v.first_day < h.day),
    coalesce(sum(h.n) filter (where h.event = 'page'), 0),
    coalesce(sum(h.n) filter (where h.event = 'product'), 0),
    coalesce(sum(h.n) filter (where h.event = 'category'), 0),
    coalesce(sum(h.n) filter (where h.event = 'buy'), 0)
  from analytics_hits h left join analytics_visitors v on v.visitor = h.visitor
  where h.day between p_from and p_to
  group by h.day
$$;

-- The keys of one kind of event with the most opens in the range: total opens and how many different visitors.
create or replace function analytics_top(p_event text, p_from date, p_to date, p_limit int)
returns table (key text, total bigint, people bigint) language sql stable as $$
  select h.key, sum(h.n), count(distinct h.visitor)
  from analytics_hits h
  where h.event = p_event and h.day between p_from and p_to
  group by h.key
  order by 2 desc, 3 desc, 1
  limit greatest(least(p_limit, 500), 1)
$$;

-- Forgets everything older than p_before (run by the scheduled job).
create or replace function analytics_purge(p_before date)
returns bigint language sql as $$
  with h as (delete from analytics_hits where day < p_before returning 1),
       v as (delete from analytics_visitors where last_day < p_before returning 1)
  select (select count(*) from h) + (select count(*) from v)
$$;

revoke all on function analytics_hit(date, text, text, text) from public, anon, authenticated;
revoke all on function analytics_days(date, date) from public, anon, authenticated;
revoke all on function analytics_top(text, date, date, int) from public, anon, authenticated;
revoke all on function analytics_purge(date) from public, anon, authenticated;
grant execute on function analytics_hit(date, text, text, text) to service_role;
grant execute on function analytics_days(date, date) to service_role;
grant execute on function analytics_top(text, date, date, int) to service_role;
grant execute on function analytics_purge(date) to service_role;
