# Affiliate program: build, rollout and rollback

Branch: `feat/affiliates`. Not merged and not deployed. Migrations 0086 and 0087 have not been applied to any live database (owner,
2026-11-12). The program ships **off**: the public page is a 404, registration and link tracking are closed, and nothing is shown to buyers
or sellers until a Super Admin turns it on in Admin › Affiliate Management › Program settings.

## What it is

A separate system from Buyer and Seller Subscriptions. It reads orders, buyer subscription payments and seller plans to see what a referral
led to, and never changes any of them. The only hooks are one-line, never-blocking `attributeFromRequest` calls when a buyer accepts a
quotation (the order is created there; the old instant checkout is closed), a sign-up, a buyer subscription and a seller plan request.

| Part | Where |
|---|---|
| Rules (pure, tested) | `lib/affiliates/rules.ts` |
| Server logic, memory fallback | `lib/affiliates/service.ts` |
| Tables and money functions | `supabase/migrations/0086_affiliates.sql` |
| Buyer subscription refunds | `supabase/migrations/0087_buyer_sub_refunds.sql`, `refundPayment` / `cancelWithRefund` in `lib/buyerSubs/service.ts` |
| Settings | `app_settings` key `affiliates:settings` (absent = off; edited without a redeploy) |
| Public page | `/affiliates` (`app/(glass)/affiliates/page.tsx`), menu link only while on |
| Affiliate dashboard | `/dashboard/buyer/affiliate` (buyers and sellers, same account) |
| Admin | `/admin/affiliates`, twelve sections by `?tab=` |
| APIs | `POST /api/affiliates` (join, profile, withdraw), `POST /api/affiliates/click`, `POST /api/admin/affiliates`, `GET /api/admin/affiliates/export` |
| Jobs | `runAffiliateJobs()` in the order cron (`POST /api/cron/orders`) |

## Defaults (all editable in Admin)

Registration $15, $0 during the promotion, never charged automatically. 60 days to reach 3 verified sales; then "SellOnBay Verified
Affiliate" and the fee is waived. Commission: first website purchase 15%, repeat 5%, new buyer subscription 15%, renewal 5%, seller paid
plan 10%. Cookie 60 days, approval 7 days after acceptance, minimum withdrawal $50, payouts by hand.

## Money: atomic and idempotent

Money moves only through four Postgres functions in 0086. Each runs in one transaction: it locks the affiliate's row first (so every money
step of one affiliate runs one after another), then the commission or withdrawal row, checks the state, and writes the ledger entry and the
new status together, or nothing.

| Function | Does | Repeated or racing calls |
|---|---|---|
| `affiliate_approve_commission(id)` | pending → approved; amount = basis × rate, rounded down; books it | the first approves, the rest return `approved` and book nothing |
| `affiliate_reverse_commission(id, reason)` | → reversed; if it was approved, books the money back out | `already_reversed`, nothing booked |
| `affiliate_request_withdrawal(...)` | reserves an amount: one open request, never more than the balance | `open_withdrawal` / `insufficient` |
| `affiliate_decide_withdrawal(id, action, ref)` | approve, reject (frees the reservation), paid (needs a reference; books the money out once) | paid again returns `already_paid` |

- The app can read the ledger and withdrawals but cannot write them (grants), and a commission's status changes only inside the functions
  (`affiliate_commission_guard` trigger). Supabase gives `service_role` every right on new tables by default, so 0086 takes all of it away
  first and gives back only what is needed; no affiliate table can be deleted from.
- Basis: what the buyer paid for the website and its options, less refunds; domains, hosting and taxes never count. Template purchases only:
  custom development orders and free (beta) orders earn nothing.
- A commission records its rate when it is made; a later rate change never touches it. One commission per paid thing (`source_ref`).
- Refunds reverse: an order that is refunded or cancelled, and (0087) a buyer subscription payment an admin records as refunded ("Record
  refund" on a verified payment, or "Cancel with refund" on the subscription, in Admin › Subscription Management).
- While the program is off, earned commissions keep being approved or reversed, and withdrawals keep working.
- In the demo build (no database) the same rules run in memory, with no pause between check and write.

## Privacy and security

- The referral cookie (`sob_ref`) is HMAC-signed (`AFFILIATE_SECRET`, derived from the server secret if unset), httpOnly, 60 days, and is set
  only when the browser accepted analytics cookies. Clicks keep a keyed hash, never the address. Bots are skipped and clicks are rate limited.
- Affiliates never see buyers' names or details. Payout details are stored server-side and shown masked.
- Row level security on every table; nothing granted to `anon` or `authenticated`; the functions run only for `service_role`.
- Settings need a Super Admin; affiliates, commissions and withdrawals need Finance or Super. Every admin change is audited and written to
  `affiliate_events`. Terms are versioned; each affiliate keeps the version they accepted.
- The demo build has no accounts: a stand-in affiliate account is used there, only on a server marked as a demo (`mayUseDemoAdmin`); a
  production server without keys answers 401.

## Tests

| File | What |
|---|---|
| `tests/unit/affiliates.test.ts` | rules; the whole flow in memory; every rate; refunds of orders and of buyer subscription payments; cancel with refund; missed target; audit log; leaderboard opt-out; requests and payouts sent at the same moment; 0086 and 0087 on an in-process Postgres (keys, client access, rollback of both, re-apply) |
| `tests/unit/affiliates-pg.test.ts` | a REAL Postgres 17 server in a throwaway cluster (temp folder, own port, deleted after): 20 racing approvals book once; 10 racing inserts of one paid thing make one commission; approve and reverse racing always net to zero; 10 racing withdrawal requests reserve once; 10 racing payouts book once; an injected failure after the ledger write rolls the whole step back; a killed connection mid-transaction saves nothing; no direct writes or deletes for the app role; no function access for browser roles. Skipped where PostgreSQL is not installed (`PG_BIN`). |
| `tests/unit/affiliates-dashboard.test.ts` | the signed-in dashboard rendered on the server with a real approved commission, a pending one, a paid withdrawal, badges, rank and activity |
| `tests/e2e/affiliates.spec.ts` (demo build) | off by default; all twelve admin sections; every editor (target, rates, minimum, cookie, badges, benefits, questions, terms, leaderboard) shows on the public page; off with a confirmation; the demo account joins, gets links, saves a payout method, opts out; the cookie is set only with analytics consent; suspend and reactivate; CSV download; phone and desktop widths |

## Production rollout (only with the owner's written approval)

1. Backup: a read-only `pg_dump` of the live database into `backups/` (git-ignored), checked with `pg_restore --list`; confirm today's
   automatic backup in Supabase.
2. Apply 0086, then 0087 (Supabase › SQL editor or `supabase db push`). Both only add; nothing existing changes.
3. Check: `select count(*) from affiliates;` returns 0;
   `select has_table_privilege('service_role', 'affiliate_ledger', 'insert');` returns false; the admin page opens.
4. Merge `feat/affiliates` into `main`, build the zip (`npm run package:hostinger`), deploy.
5. The program stays off. When the owner decides, a Super Admin turns it on in Program settings.

## Rollback

- Turn the program off in Program settings: the page, registration and tracking stop at once; money stays.
- Code: redeploy the previous zip. The tables can stay (nothing reads them).
- Database, only while no real affiliate money exists, after a backup and with the owner's approval: `supabase/rollback/0086_affiliates_down.sql`
  (tables and functions), then `supabase/rollback/0087_buyer_sub_refunds_down.sql` (the three refund columns). Neither is a migration; both
  are tested on an in-process Postgres, and the migrations apply again after them.

## Known limits

- While `PAYMENTS_MODE` is `beta_free`, purchases are free, so they earn no commission. Commissions start with paid orders.
- A referral is remembered only if the visitor accepted analytics cookies before or on the visit through the link.
- The money functions are tested on a real Postgres here, but the app's calls to them through Supabase (PostgREST) have not run against a
  real Supabase project: there is no staging project with keys on this machine. Run `docs/STAGING_CHECK.md` style checks on staging first.
