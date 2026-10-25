-- Repository delivery: when the GitHub invite was last sent (it runs out on GitHub after a few days) and the checklist for taking the buyer's access away
-- when the order is refunded or cancelled after the invite. No GitHub automation: the seller removes the buyer by hand, says so, and an admin confirms.
create table repo_access_tasks (
  order_id uuid primary key references orders(id) on delete cascade,
  invite_sent_at timestamptz,
  resends integer not null default 0 check (resends >= 0),
  revoke_state text check (revoke_state in ('pending', 'seller_done', 'confirmed')),
  revoke_requested_at timestamptz,
  revoke_seller_done_at timestamptz,
  revoke_confirmed_at timestamptz,
  revoke_confirmed_by uuid references profiles(id) on delete set null,
  revoke_note text
);
create index repo_access_open on repo_access_tasks (revoke_requested_at) where revoke_state in ('pending', 'seller_done');

alter table repo_access_tasks enable row level security;
revoke all on repo_access_tasks from anon, authenticated;
grant select, insert, update on repo_access_tasks to service_role;
