-- Protects sellers from buyers who take the work and then dispute or reject it.

-- 1. Source code stays private until the buyer accepts. The live site is reviewed on the buyer's domain.
--    Column-level revoke: no client query can read code_url. The server (service role) releases it after acceptance.
revoke select on products from anon, authenticated;
grant select (id, slug, seller_id, name, category, tagline, description, includes, theme, price_cents, delivery_days,
              demo_url, license, status, scan_result, created_at, updated_at) on products to authenticated;

alter table orders add column code_released_at timestamptz;   -- set by the server when status becomes accepted

-- 2. Disputes need evidence and end with a recorded verdict.
alter table disputes add column evidence_urls text[] not null default '{}';
alter table disputes add column verdict text check (verdict in ('refund_full', 'refund_partial', 'rejected'));
alter table disputes add column decided_by uuid references profiles(id);

-- 3. Repeat rejected disputes add a strike. Three strikes flags the account for admin review (no automatic ban).
alter table profiles add column flagged boolean not null default false;

create or replace function record_dispute_outcome() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and old.status <> 'closed' and new.verdict = 'rejected' then
    update profiles
      set strikes = strikes + 1,
          flagged = flagged or strikes + 1 >= 3
      where id = new.opened_by;
  end if;
  return new;
end $$;

create trigger disputes_outcome after update on disputes for each row execute function record_dispute_outcome();
