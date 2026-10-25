-- Free tools and AI cost control (spec 10 and 11): how many runs each visitor used today, how many tokens each tool used, and the saved answers
-- for identical inputs (kept 30 days, so the same question never costs twice). Written only by the server.

create table ai_usage (
  subject text not null,                 -- a visitor cookie id, an address hash, or "global"
  day date not null,
  tool text not null,
  count int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (subject, day, tool)
);
create table free_tool_cache (
  tool text not null,
  input_hash text not null,
  output jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tool, input_hash)
);
alter table ai_usage enable row level security;
alter table free_tool_cache enable row level security;
grant select, insert, update on ai_usage to service_role;
grant select, insert, update, delete on free_tool_cache to service_role;
