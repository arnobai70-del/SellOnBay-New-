-- Posts written in the admin panel (blog / guides), each with its own meta title and meta description for search engines.
-- Read and written only by the server (lib/posts.ts, with the admin checks); clients get no access.
create table posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 3 and 120),
  meta_title text check (meta_title is null or char_length(meta_title) <= 70),
  meta_description text check (meta_description is null or char_length(meta_description) <= 170),
  excerpt text not null default '' check (char_length(excerpt) <= 300),
  body text not null default '' check (char_length(body) <= 50000),
  cover_url text check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 500)),
  cover_alt text not null default '' check (char_length(cover_alt) <= 150),
  status text not null default 'draft' check (status in ('draft', 'published')),
  noindex boolean not null default false,
  published_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_published on posts (published_at desc) where status = 'published';
alter table posts enable row level security;
revoke all on posts from anon, authenticated;
grant select, insert, update, delete on posts to service_role;
