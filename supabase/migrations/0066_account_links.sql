-- SellOnBay 2.0, Phase 10 (placeholder P19; provisional number). Link intents and the link log for social sign-in (Addendum section 3).
-- A link intent is made on the server for one signed-in user and one provider, after a fresh re-authentication, and can be used once within
-- a few minutes. account_link_events records every link, unlink, refusal and any identity that appeared without an intent (append-only).
-- These tables do NOT make social login safe on their own: the Addendum requires automatic identity linking to be confirmed off at the
-- Supabase Auth level for each provider before it is enabled (blocker B-7). requires: profiles, sob_append_only (0056)

create table link_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'azure', 'github', 'gitlab', 'apple')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);
create index link_intents_user on link_intents (user_id, created_at desc);

-- An intent is used once and never changes otherwise.
create or replace function link_intents_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then return old; end if; -- removed with the account (on delete cascade) or by the expiry clean-up
  if new.user_id <> old.user_id or new.provider <> old.provider or new.created_at <> old.created_at or new.expires_at <> old.expires_at then
    raise exception 'a link intent cannot change';
  end if;
  if old.used_at is not null and new.used_at is distinct from old.used_at then raise exception 'a link intent is used once'; end if;
  return new;
end $$;
create trigger link_intents_guard before update or delete on link_intents for each row execute function link_intents_guard();

create table account_link_events (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null,
  provider text not null,
  action text not null check (action in ('linked', 'unlinked', 'refused', 'unexpected_identity', 'admin_social_refused', 'signin_refused')),
  detail text not null default '' check (char_length(detail) <= 500),
  created_at timestamptz not null default now()
);
create index account_link_events_user on account_link_events (user_id, created_at desc);
create trigger account_link_events_no_change before update or delete on account_link_events for each row execute function sob_append_only();
create trigger account_link_events_no_truncate before truncate on account_link_events for each statement execute function sob_append_only();

alter table link_intents enable row level security;
alter table account_link_events enable row level security;
revoke all on link_intents, account_link_events from anon, authenticated;
grant select, insert, update, delete on link_intents to service_role;
grant select, insert on account_link_events to service_role;
