# Buyer subscriptions: review, rollout and test report

Branch: `feat/buyer-subscriptions`. Not merged and not deployed. Migration 0085 has not been applied to the live database (owner, 2026-11-12).

## Owner decisions (2026-11-12)

1. Only SellOnBay-owned websites can be chosen (`products.owner_type = 'platform'`). Third-party sellers' websites are never offered, so no
   seller share is owed. This is checked on the server for every pick (`subscribable()` in `lib/buyerSubs/rules.ts`). **Note:** on the live
   database all 43 live listings have `owner_type = 'platform'`, but they are linked to 7 seller accounts (`seller_id`). Before switching
   subscriptions on, confirm that these listings really belong to SellOnBay, or set `owner_type = 'seller'` on any that do not.
2. A website chosen with a subscription is a $0 order marked `payment_ref = 'subscription'`. Every order screen says "Subscription"
   (order page, buyer overview, buyer orders, admin orders), and the beta feedback link is not shown on these orders.
3. Migration 0085 waits for: this review, a verified backup and staging tests.
4. No merge into `main` and no zip until approved.
5. `[TEST]` records are listed below. Nothing is deleted.

## Migration 0085 review

| Check | Result |
|---|---|
| Adds only | 5 new tables, 3 functions, 1 trigger, 3 seed rows. No existing table, column, constraint or row is changed or dropped. |
| Safety script (`check:migration-safety`) | Passes: no drops, deletes, renames, type changes or new required columns. |
| Runs on all earlier migrations (`check:migrations`, in-process Postgres) | Passes. |
| Browser access | Row level security on and every grant revoked from `anon` and `authenticated`; only the server (service key) reads and writes. |
| Server grants | `select, insert, update` for `service_role` (the test `migration-grants` checks every new table, so the beta-request failure cannot happen here). No `delete` grant. |
| Credits | `buyer_sub_take_credit()` locks the subscription row (`for update`), requires `active` and an unexpired date, and never passes the limit; a table check (`credits_used <= credits_total`) backs it. Tested on a real Postgres. |
| Functions | `security definer` with a fixed `search_path`; execute revoked from `public`, `anon` and `authenticated`, granted to `service_role` only. |
| History | `buyer_sub_events` is append-only (a trigger refuses update and delete). Tested. |
| Payments | A payment reference can be used once (unique index on the normalised reference, rejected ones excepted). |
| Plans | Never deleted, only archived (`archived_at`), so a subscription always keeps its plan. Each subscription stores what was bought (`plan_snapshot`), so later price edits never change it. |
| Rollback | Safe while no real subscriptions exist; see below. |

## Production rollout (no staging, owner 2026-11-12)

Both systems ship **off**. Nothing is visible to buyers or sellers until a Super Admin opens them in Admin › Subscription Management.

1. **Backup.** A full read-only `pg_dump` of the live database (schemas public, auth and storage, custom format) goes in `backups/`
   (git-ignored, never uploaded) and is checked with `pg_restore --list` for the data of `orders`, `products`, `profiles`, `ledger_entries` and
   `app_settings`. Also confirm today's automatic backup in Supabase › Database › Backups.
2. **Migration 0085** (only after the owner's approval): run the file in Supabase › SQL editor, or `supabase db push` with the project linked.
   It only adds tables, functions and three plan rows. Then `node scripts/migration-probe.mjs` must show 0085 as complete.
3. **Code**: merge `feat/buyer-subscriptions` into `main`, `npm run package:hostinger`, upload. The first build log line names the commit.
4. **Check on the live site** (still off): `/subscriptions` is a 404 for visitors; Admin › Subscription Management opens with both switches
   off; the seller Account page shows "Your plan" with no request buttons; a regular purchase and the beta request still work.
5. **Turning on later** is one click per system in Admin › Subscription Management, with no redeploy.

Order matters: the migration goes before the new code. Without the tables the code still runs (buyer subscriptions fall back to memory and
stay off), but nothing should be switched on until 0085 is applied.

### Rollback

- **Code**: upload the previous zip (`main` before the merge), or revert the merge commit and package again.
- **Switches**: turning a system off in the admin panel hides it at once; existing data is kept.
- **Database** (only while no real buyer subscription exists):

```sql
drop table if exists buyer_sub_events, buyer_sub_payments, buyer_sub_selections, buyer_subscriptions, buyer_sub_plans cascade;
drop function if exists buyer_sub_take_credit(uuid, uuid), buyer_sub_return_credit(uuid), buyer_sub_events_append_only();
delete from app_settings where key in ('buyer_subs:settings', 'seller_subs:settings');
```

Seller plan versions saved from the admin panel are ordinary `seller_plans` rows (the existing table); a new version is undone with
"Withdraw", not deleted. A full restore, if ever needed: `pg_restore --clean --if-exists` from the backup above.

### Seller subscriptions (existing system, no new table)

The seller section uses `seller_plans`, `seller_subscriptions` and `subscription_events` from migration 0057. An edit inserts the plan's next
version (`effective_from` now); running seller subscriptions point at their own version, and every order keeps the fee it recorded. The
switch and display words are the `app_settings` key `seller_subs:settings` (absent = off).

## `[TEST]` records (nothing deleted)

Read-only inventory of 2026-11-11 (UTC). Backup: `backups/test-data-2026-11-11.json` (git-ignored, 57 KB), with every row listed here.

| Item | Rows | Used by a live feature? |
|---|---|---|
| `[TEST]` accounts (`profiles`): 5 buyers, 1 seller, 1 buyer marked seller, 2 admins | 9 | No customer data. Their sign-ins are test logins only. |
| Test listing `test-beta-website-qa` | 1 | Paused, not public. Its 7 orders are all from test buyers. |
| Orders (test buyers) and their events | 7 + 18 | No. All on the test listing, $0, no ledger rows. |
| Beta requests | 5 | All five beta requests on the site are test buyers'. |
| Audit log entries by test admins | 46 | History only. |
| Notifications to test accounts | 21 | No. |
| Seller verifications (test seller) | 2 | No. |
| Guide `test-guide-check` (unpublished) and its revision | 1 + 1 | No, unpublished. |
| Listing sale created by a test admin | 1 | Ended on 2026-11-08. |
| Page-word revisions, maintenance history by test admins | 4 + 2 | History only. |
| **Live settings last changed by a test admin** | 7 | **Yes, in use**: `allowedCountries`, `site:contact`, `marketing:coupons`, `paymentsMode`, `site:blocks:/guides`, `cms:doc:page:home`, `cms:draft:page:home`, and the "search" maintenance row (off). The values stay; only their "changed by" points at a test admin. Deleting the test admins first needs those links cleared, not the settings. |

## Test report (branch)

See the report in the conversation of 2026-11-12, and re-run with `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:migrations`,
`npm run check:migration-safety` and the demo e2e suite (`tests/e2e`, demo build without a database).
