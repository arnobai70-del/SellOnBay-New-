-- SellOnBay 2.0, Phase 8 (placeholders P15 + P16; provisional number). Product revision policies, revision requests, custom development.
-- revision_policies: the seller proposes a product's revision terms; Catalog approves. Decided rows never change (approved -> superseded only).
-- revisions: a buyer asks for a change on a released order; an admin decides the kind. Defects never use the included allowance.
-- A released revision keeps its release facts; "not done" closes it and opens a follow-up. Free
-- revisions (defect, included change) go seller -> release approval -> buyer; a paid change or feature becomes a custom development request
-- linked to the order (purchase_requests.parent_order_id), so it follows request -> quotation -> payment -> release like any purchase.
-- purchase_requests gains the developer assigned to a custom job (a seller, or SellOnBay itself when empty) and the link to a parent order.
-- Only additions: no existing row or column changes. requires: profiles, products, orders, purchase_requests (0059), file_objects (0058), sob_append_only (0056)

alter table purchase_requests add column assigned_seller_id uuid references profiles(id) on delete restrict;
alter table purchase_requests add column assigned_at timestamptz;
alter table purchase_requests add column parent_order_id uuid references orders(id) on delete restrict;

create table revision_policies (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  version int not null check (version >= 1),
  included int not null check (included between 0 and 50),
  window_days int not null check (window_days between 0 and 365),
  scope text not null default '' check (char_length(scope) <= 1000),
  extra_price_cents int check (extra_price_cents >= 0),
  support_terms text not null default '' check (char_length(support_terms) <= 1000),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'superseded')),
  proposed_by uuid references profiles(id) on delete set null,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_reason text not null default '' check (char_length(decision_reason) <= 500),
  created_at timestamptz not null default now(),
  unique (product_id, version),
  check (included = 0 or char_length(scope) >= 5),
  check ((status = 'proposed') = (decided_at is null))
);
create unique index revision_policies_one_approved on revision_policies (product_id) where status = 'approved';
create unique index revision_policies_one_proposed on revision_policies (product_id) where status = 'proposed';

create or replace function revision_policies_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'revision policies are never deleted'; end if;
  if old.status = 'proposed' then return new; end if;
  if new.product_id <> old.product_id or new.version <> old.version or new.included <> old.included or new.window_days <> old.window_days or new.scope <> old.scope
     or new.extra_price_cents is distinct from old.extra_price_cents or new.support_terms <> old.support_terms or new.decided_at is distinct from old.decided_at then
    raise exception 'a decided revision policy cannot change';
  end if;
  if not (old.status = new.status or (old.status = 'approved' and new.status = 'superseded')) then raise exception 'revision policy status can only go approved -> superseded'; end if;
  return new;
end $$;
create trigger revision_policies_guard before update or delete on revision_policies for each row execute function revision_policies_guard();
create trigger revision_policies_no_truncate before truncate on revision_policies for each statement execute function sob_append_only();

create table revisions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  buyer_id uuid not null references profiles(id) on delete restrict,
  seller_id uuid references profiles(id) on delete restrict,
  description text not null check (char_length(description) between 20 and 4000),
  buyer_hint text not null check (buyer_hint in ('defect', 'change')),
  kind text check (kind in ('defect', 'included', 'paid', 'feature')),
  status text not null default 'submitted' check (status in ('submitted', 'declined', 'quoted', 'assigned', 'release_pending', 'delivered', 'closed')),
  counts_allowance boolean not null default false,
  decision_note text not null default '' check (char_length(decision_note) <= 2000),
  request_id uuid references purchase_requests(id) on delete restrict,
  file_id uuid references file_objects(id) on delete restrict,
  delivery_note text not null default '' check (char_length(delivery_note) <= 2000),
  submitted_for_release_at timestamptz,
  release_due_at timestamptz,
  released_at timestamptz,
  released_by uuid references profiles(id) on delete set null,
  -- when the buyer says a delivered revision is not done, it is closed and a follow-up continues it (never counted again)
  follows_id uuid references revisions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- defects never use the allowance; only an included change can, and a follow-up never does
  check (not counts_allowance or (kind = 'included' and follows_id is null)),
  -- nothing reaches the buyer without a release approval
  check (status not in ('delivered', 'closed') or kind in ('paid', 'feature') or released_at is not null),
  -- a paid change or feature is quoted through its own linked request
  check (status <> 'quoted' or (request_id is not null and kind in ('paid', 'feature')))
);
create index revisions_order on revisions (order_id, created_at);
create unique index revisions_one_open on revisions (order_id) where status in ('submitted', 'assigned', 'release_pending');
create index revisions_queue on revisions (status, updated_at) where status in ('submitted', 'release_pending');

-- Once released, what was released stays as it was.
create or replace function revisions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'revisions are never deleted'; end if;
  if old.released_at is not null and (new.released_at is distinct from old.released_at or new.file_id is distinct from old.file_id or new.released_by is distinct from old.released_by) then
    raise exception 'a released revision keeps its release facts';
  end if;
  if old.kind is not null and new.kind is distinct from old.kind then raise exception 'a revision keeps its kind once decided'; end if;
  if old.order_id <> new.order_id or old.buyer_id <> new.buyer_id then raise exception 'a revision keeps its order and buyer'; end if;
  return new;
end $$;
create trigger revisions_guard before update or delete on revisions for each row execute function revisions_guard();
create trigger revisions_no_truncate before truncate on revisions for each statement execute function sob_append_only();

create table revision_events (
  id bigint generated always as identity primary key,
  revision_id uuid not null references revisions(id) on delete restrict,
  actor_id uuid references profiles(id) on delete set null,
  event text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create trigger revision_events_no_change before update or delete on revision_events for each row execute function sob_append_only();
create trigger revision_events_no_truncate before truncate on revision_events for each statement execute function sob_append_only();

alter table revision_policies enable row level security;
alter table revisions enable row level security;
alter table revision_events enable row level security;
revoke all on revision_policies, revisions, revision_events from anon, authenticated;
-- No client grants: buyers, sellers and admins go through the server (lib/revisions), which checks who is part of which order.
grant select, insert, update on revision_policies, revisions to service_role;
grant select, insert on revision_events to service_role;
