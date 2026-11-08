-- Guides editor (owner, 2026-11-08): rich content (sanitized HTML plus the editor's JSON), category, tags, author, OG image, canonical,
-- scheduled and unpublished states, covers uploaded to our own storage, and revisions with restore. Server only, like posts (0048).
-- requires: posts, profiles
alter table posts add column if not exists body_html text not null default '' check (char_length(body_html) <= 400000);
alter table posts add column if not exists body_json jsonb;
alter table posts add column if not exists category text not null default '' check (char_length(category) <= 60);
alter table posts add column if not exists tags text[] not null default '{}' check (cardinality(tags) <= 12);
alter table posts add column if not exists author text not null default '' check (char_length(author) <= 80);
alter table posts add column if not exists og_image text check (og_image is null or ((og_image ~ '^https://' or og_image ~ '^/blog/media/') and char_length(og_image) <= 500));
alter table posts add column if not exists canonical text check (canonical is null or (canonical ~ '^https://' and char_length(canonical) <= 500));
alter table posts add column if not exists publish_at timestamptz;

-- destructive-ok: the status check is replaced by the same states plus scheduled and unpublished; every existing row still passes (owner, 2026-11-08)
alter table posts drop constraint if exists posts_status_check;
alter table posts add constraint posts_status_check check (status in ('draft', 'scheduled', 'published', 'unpublished'));
-- destructive-ok: the cover check is replaced by the same rule plus pictures uploaded to our own storage (/blog/media/...); every existing row still passes
alter table posts drop constraint if exists posts_cover_url_check;
alter table posts add constraint posts_cover_url_check check (cover_url is null or ((cover_url ~ '^https://' or cover_url ~ '^/blog/media/') and char_length(cover_url) <= 500));
create index if not exists posts_scheduled on posts (publish_at) where status = 'scheduled';

create table if not exists post_revisions (
  id bigserial primary key,
  post_id uuid not null references posts(id) on delete cascade,
  title text not null,
  body_html text not null default '',
  body_json jsonb,
  saved_by uuid references profiles(id) on delete set null,
  autosave boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists post_revisions_post on post_revisions (post_id, created_at desc);
alter table post_revisions enable row level security;
revoke all on post_revisions from anon, authenticated;
grant select, insert, delete on post_revisions to service_role;
grant usage, select on sequence post_revisions_id_seq to service_role;
