# Affiliate program: build, rollout and rollback

Branch: `feat/affiliates`. Not merged and not deployed. Migration 0086 has not been applied to the live database (owner, 2026-11-12).
The program ships **off**: the public page is a 404, registration and link tracking are closed, and nothing is shown to buyers or sellers
until a Super Admin turns it on in Admin › Affiliate Management › Program settings.

## What it is

A separate system from Buyer and Seller Subscriptions. It reads orders, buyer subscription payments and seller plans to see what a referral
led to, and never changes any of them (the only hooks are one-line, never-blocking `attributeFromRequest` calls after an order, a sign-up, a
buyer subscription and a seller plan request are created).

| Part | Where |
|---|---|
| Rules (pure, tested) | `lib/affiliates/rules.ts` |
| Server logic, memory fallback | `lib/affiliates/service.ts` |
| Tables | `supabase/migrations/0086_affiliates.sql` |
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

## Money rules

- Basis: what the buyer paid for the website and its options, less refunds; domains, hosting and taxes never count.
- A commission records its rate when it is made; a later rate change never touches it.
- One commission per paid thing (`source_ref` unique), one ledger entry per key (`commission:`, `reversal:`, `withdrawal:`), so a job that runs
  twice never pays twice. The ledger is append-only (trigger).
- A refund reverses the commission; if it was approved, a reversal entry takes the money back out.
- One open withdrawal per affiliate (partial unique index). Paid needs an approval first and a payout reference, and books the money once.
- Self-referrals never count; the first affiliate wins; nothing is paid for recruiting affiliates.
- While the program is off, earned commissions keep being approved or reversed, and withdrawals keep working.

## Privacy and security

- The referral cookie (`sob_ref`) is HMAC-signed (`AFFILIATE_SECRET`, derived from the server secret if unset), httpOnly, and is set only
  when the browser accepted analytics cookies. Clicks keep a keyed hash, never the address. Bots are skipped and clicks are rate limited.
- Affiliates never see buyers' names or details. Payout details are stored server-side and shown masked.
- Tables: row level security on, nothing granted to `anon` or `authenticated`, `service_role` without delete.
- Settings need a Super Admin; affiliates, commissions and withdrawals need Finance or Super. Every admin change is audited and written to
  `affiliate_events`.
- Terms are versioned; each affiliate keeps the version they accepted.

## Tests

- `tests/unit/affiliates.test.ts`: rules; the full flow in memory (join, no duplicate account, signed cookie, self-referral, first affiliate
  wins, cookie window, commission made, approved after the hold, qualification, rate change not retroactive, refund reversal, withdrawal
  minimum, one open request, paid once, program off keeps the money); 0086 on an in-process Postgres (unique keys, one open withdrawal,
  append-only ledger, no client grants). Also: 15% new buyer subscription, 5% renewal, 10% paid seller plan, each once over repeated runs;
  sign-ups count as leads only; a missed target charges nothing and an admin can restart it; suspend and reactivate; the audit log; the
  leaderboard opt-out; anon and signed-in roles get "permission denied" on every table; the rollback script removes exactly the seven
  tables, leaves the rest, and 0086 applies again afterwards.
- `tests/e2e/affiliates.spec.ts` (demo build): off by default, twelve admin sections, the switch opens and closes the public page with the
  saved rates, no cookie while off, the public and admin pages fit 390px and 1280px without sideways scrolling.

## Production rollout (only with the owner's written approval)

1. Backup: a read-only `pg_dump` of the live database into `backups/` (git-ignored), checked with `pg_restore --list`; confirm today's
   automatic backup in Supabase.
2. Apply migration 0086 (Supabase › SQL editor or `supabase db push`). It only adds tables; nothing existing changes.
3. Check: `select count(*) from affiliates;` returns 0 and the admin page opens.
4. Merge `feat/affiliates` into `main`, build the zip (`npm run package:hostinger`), deploy.
5. The program stays off. When the owner decides, a Super Admin turns it on in Program settings.

## Rollback

- Turn the program off in Program settings: the page, registration and tracking stop at once; money stays.
- Code: redeploy the previous zip. The tables can stay (nothing reads them).
- Tables: only while no real affiliate money exists, after a backup and with the owner's approval, run
  `supabase/rollback/0086_affiliates_down.sql` (not a migration; tested on an in-process Postgres).
