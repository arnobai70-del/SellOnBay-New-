-- Abuse reports count each reporter once (an account, or a hash of the address, never the address itself), so enough different people
-- reporting the same listing can pause it automatically until an admin looks (lib/abuse.ts).
alter table abuse_reports add column reporter_key text;
create index on abuse_reports (created_at desc);
grant select, insert, update on abuse_reports to service_role;
