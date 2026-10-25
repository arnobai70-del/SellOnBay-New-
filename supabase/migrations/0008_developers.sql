-- Developers you can hire. Profiles are written only by the server (service role) after validation; new ones start in review.
-- hire_requests are the buyer's brief plus the chosen package. Payment into escrow is not built yet, so they stay awaiting_payment.

create table dev_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  headline text not null check (char_length(headline) between 10 and 120),
  gig text not null check (char_length(gig) between 10 and 120),
  country text not null default '' check (char_length(country) <= 60),
  bio text not null check (char_length(bio) between 40 and 1200),
  langs text[] not null default '{}' check (cardinality(langs) between 1 and 8),
  skills jsonb not null default '[]',
  areas text[] not null default '{}' check (cardinality(areas) between 1 and 8),
  packs jsonb not null,
  avail text not null default 'Available now' check (avail in ('Available now', 'Busy for a week', 'Booked')),
  status listing_status not null default 'in_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger dev_profiles_updated before update on dev_profiles for each row execute function set_updated_at();
alter table dev_profiles enable row level security;
create policy dev_profiles_read on dev_profiles for select to authenticated using (status = 'live' or user_id = auth.uid() or is_admin());

create table hire_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id) on delete cascade,
  dev_key text not null,
  dev_user_id uuid references profiles(id) on delete set null,
  pack text not null check (pack in ('Basic', 'Standard', 'Premium')),
  price_cents int not null check (price_cents > 0),
  days int not null check (days between 1 and 60),
  brief text not null check (char_length(brief) between 20 and 2000),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'in_escrow', 'working', 'delivered', 'accepted', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table hire_requests enable row level security;
create policy hire_requests_read on hire_requests for select to authenticated using (buyer_id = auth.uid() or dev_user_id = auth.uid() or is_admin());

grant select on dev_profiles, hire_requests to authenticated;
grant all on dev_profiles, hire_requests to service_role;
