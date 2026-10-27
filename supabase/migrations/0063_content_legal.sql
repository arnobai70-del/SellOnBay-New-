-- SellOnBay 2.0, Phase 1 remainder (placeholders P04 + P05; provisional number). CMS history and versioned legal documents.
-- content_revisions: every save of a site-builder or SEO setting (app_settings key) is a numbered revision; a rollback writes a new revision
-- from an older one, so history is never rewritten. value NULL = "back to the built-in version".
-- legal_documents: legal texts (terms, privacy, licences...) as numbered versions. A draft can be edited; once published or retired the text
-- never changes; one published version per document; a published version is retired when the next one is published.
-- Nothing in app_settings or any existing table changes. requires: profiles, sob_append_only (0056)

create table content_revisions (
  id uuid primary key default gen_random_uuid(),
  key text not null check (char_length(key) between 1 and 300),
  version int not null check (version >= 1),
  value jsonb,
  action text not null check (action in ('save', 'rollback')),
  from_version int check (from_version >= 1),
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (key, version),
  check ((action = 'rollback') = (from_version is not null))
);
create index content_revisions_key on content_revisions (key, version desc);
create trigger content_revisions_no_change before update or delete on content_revisions for each row execute function sob_append_only();
create trigger content_revisions_no_truncate before truncate on content_revisions for each statement execute function sob_append_only();

create table legal_documents (
  id uuid primary key default gen_random_uuid(),
  doc_key text not null check (doc_key in ('terms', 'privacy', 'refunds', 'acceptable_use', 'seller_agreement', 'dmca', 'licences')),
  version int not null check (version >= 1),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 20 and 200000),
  summary text not null default '' check (char_length(summary) <= 500),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  lawyer_reviewed boolean not null default false,
  reviewed_note text not null default '' check (char_length(reviewed_note) <= 500),
  created_by uuid references profiles(id) on delete set null,
  published_by uuid references profiles(id) on delete set null,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doc_key, version),
  check ((status = 'draft') = (published_at is null))
);
create unique index legal_documents_one_published on legal_documents (doc_key) where status = 'published';

-- A draft may change; a published or retired version keeps its words forever and only moves published -> retired. Only drafts are deleted.
create or replace function legal_documents_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'a published legal document is never deleted'; end if;
    return old;
  end if;
  if old.status = 'draft' then return new; end if;
  if new.doc_key <> old.doc_key or new.version <> old.version or new.title <> old.title or new.body <> old.body or new.summary <> old.summary
     or new.lawyer_reviewed <> old.lawyer_reviewed or new.reviewed_note <> old.reviewed_note or new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by then
    raise exception 'a published legal document cannot change';
  end if;
  if not (old.status = new.status or (old.status = 'published' and new.status = 'retired')) then raise exception 'legal document status can only go published -> retired'; end if;
  return new;
end $$;
create trigger legal_documents_guard before update or delete on legal_documents for each row execute function legal_documents_guard();
create trigger legal_documents_no_truncate before truncate on legal_documents for each statement execute function sob_append_only();

-- Publishing retires the current version and publishes the draft in one transaction, so a document is never left without a published version.
create or replace function legal_publish(p_id uuid, p_by uuid) returns boolean language plpgsql as $$
declare k text;
begin
  select doc_key into k from legal_documents where id = p_id and status = 'draft' for update;
  if k is null then raise exception 'not a draft'; end if;
  update legal_documents set status = 'retired', retired_at = now(), updated_at = now() where doc_key = k and status = 'published';
  update legal_documents set status = 'published', published_by = p_by, published_at = now(), updated_at = now() where id = p_id;
  return true;
end $$;
revoke all on function legal_publish(uuid, uuid) from public, anon, authenticated;
grant execute on function legal_publish(uuid, uuid) to service_role;

alter table content_revisions enable row level security;
alter table legal_documents enable row level security;
revoke all on content_revisions, legal_documents from anon, authenticated;
-- No client grants: the server reads published texts and admins write through the server (lib/cms, lib/legal).
grant select, insert on content_revisions to service_role;
grant select, insert, update, delete on legal_documents to service_role;
