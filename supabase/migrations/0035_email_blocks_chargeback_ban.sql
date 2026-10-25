-- Email blocklist (stored as a hash, like connections and devices) and a reason on a ban, so a buyer banned for a lost chargeback stays banned.
alter table blocks drop constraint if exists blocks_kind_check;
alter table blocks add constraint blocks_kind_check check (kind in ('ip', 'device', 'email'));
-- 'chargeback' = permanent: an admin cannot lift it from the Accounts page. Not granted to clients.
alter table profiles add column if not exists ban_reason text;
