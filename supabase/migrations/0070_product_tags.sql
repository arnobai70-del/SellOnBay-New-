-- Tags on a listing (owner, 2026-11-03): up to 8 short words the seller picks so buyers find it in search. Optional: null or an empty
-- list is no tags, so every existing row stays as it is and the running site keeps working before and after this file. The words are checked
-- by the server (lib/listingTags.ts: 2 to 24 characters, letters, numbers and spaces, no contact details); the database keeps the count.
-- Only the server writes listings (0043), so no grant is added; clients read listings through the server as before.
alter table products add column if not exists tags text[] check (tags is null or cardinality(tags) <= 8);
