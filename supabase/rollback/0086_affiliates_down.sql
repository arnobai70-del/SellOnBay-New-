-- Rollback for 0086_affiliates.sql (owner, 2026-11-12). NOT a migration: run by hand only with the owner's written approval, after a backup,
-- and only while no real affiliate money exists (it removes every affiliate, click, commission, withdrawal and ledger row).
-- Turning the program off in Admin > Affiliate Management is the normal rollback and needs none of this.
-- destructive-ok: rollback script only, never applied automatically; owner approval required before use
drop function if exists affiliate_decide_withdrawal(uuid, text, text, uuid, timestamptz);
drop function if exists affiliate_request_withdrawal(uuid, int, int, text, text);
drop function if exists affiliate_reverse_commission(uuid, text, timestamptz);
drop function if exists affiliate_approve_commission(uuid, timestamptz);
drop table if exists affiliate_ledger;
drop table if exists affiliate_events;
drop table if exists affiliate_withdrawals;
drop table if exists affiliate_commissions;
drop table if exists affiliate_attributions;
drop table if exists affiliate_clicks;
drop table if exists affiliates;
drop function if exists affiliate_commission_guard();
drop function if exists affiliate_append_only();
delete from app_settings where key = 'affiliates:settings';
