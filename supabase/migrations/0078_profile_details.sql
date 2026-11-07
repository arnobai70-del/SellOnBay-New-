-- Global market (owner, 2026-11-07): country, international phone and company on the profile, for invoices and domain registration. Only adds.
-- The person's own name stays writable through their session (0004); these three are written by the server after it checks who is asking, so clients get no grant.
-- requires: profiles
alter table profiles
  add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$'),
  add column if not exists phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column if not exists company text check (company is null or char_length(company) <= 120);
