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

## Before applying it to the live database

1. **Backup.** In Supabase › Database › Backups, check that today's automatic backup exists, or take a manual one. Also export the schema
   and data with `supabase db dump --linked -f backups/pre-0085.sql` (needs the database password) and keep the file outside the repository.
   Verify it: the file opens and lists `create table` statements for `orders`, `products` and `profiles`.
2. **Staging.** There is no staging project yet: "SellOnBay New" is paused. Either restore it, or create a Supabase branch from the
   production project (it copies the schema and migrations, not the data, and costs per hour). Apply 0001 to 0085 there, point a test
   server at it (`SITE_STAGE=staging`), and run the steps under "Staging tests".
3. **Apply.** `supabase db push` with the project linked (or paste the file into the SQL editor), then run `node scripts/migration-probe.mjs` to
   confirm 0085 shows as complete.
4. Subscriptions stay **off** after the migration until an admin opens them in Admin › Buyer subscriptions.

### Staging tests

- Admin: open the feature, edit a plan's price, limit and benefits, duplicate and archive a plan, add a coupon in Marketing.
- Buyer: choose a plan with the coupon, report a payment; admin verifies it; the plan is active with the right number of websites.
- Buyer: choose a website; the $0 order shows "Subscription" and its files download; try to choose more than the limit (refused) and a
  third-party seller's website (not offered, refused by the server).
- Admin: suspend, reactivate, extend by 10 days, cancel; the history and the audit log show every step.
- Renewal: submit a renewal payment, verify it, check the new end date on the subscription and every chosen website.
- Run the orders job with a test subscription that has ended: it becomes "Expired"; one 14 days from its end gets one reminder.

### Rollback (only while no real subscription exists)

```sql
drop table if exists buyer_sub_events, buyer_sub_payments, buyer_sub_selections, buyer_subscriptions, buyer_sub_plans cascade;
drop function if exists buyer_sub_take_credit(uuid, uuid), buyer_sub_return_credit(uuid), buyer_sub_events_append_only();
delete from app_settings where key = 'buyer_subs:settings';
```

The app keeps working without the tables: subscriptions fall back to memory and the feature stays off.

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
