-- Abuse reports: remember whether the reporter was a verified-email account or a buyer who ordered that listing.
-- Only such reports count toward the automatic pause (a competitor cannot pause a listing with throwaway accounts).
alter table abuse_reports add column if not exists verified boolean not null default false;
