# Runbook

How to operate SellOnBay. Short on purpose. Where something is not built yet it says so.

## Applying database changes

Only with the owner's permission. The full order, the checks to run first and the deployment steps are in `docs/DEPLOYMENT.md`.

1. Back up first: `npm run db:backup` (below), and the Supabase dashboard backup if your plan has one.
2. Apply the files in `supabase/migrations/` in number order: Supabase SQL editor (paste, run), or a Postgres client with the project's connection string.
3. After a migration that adds tables, check the grants in that file (clients get the minimum, never TRUNCATE) and run `npm run test:e2e` with the real database: `tests/e2e/rls.spec.ts` tries every forbidden action as the wrong user.
4. Migrations are never edited after they have been applied. Fix forward with a new file.

## Scheduled job

`POST /api/cron/orders` with `Authorization: Bearer $CRON_SECRET`, every 5 to 10 minutes. It runs `runDueJobs`: auto-accept after the review window, mark late orders `overdue`, end the 7-day payout hold, and make sure the ledger and certificates match every open order. It is safe to run twice. Orders are also brought up to date whenever somebody opens them. Each run of either job writes its finish time (`app_settings`, key `heartbeat:orders` or `heartbeat:payouts`); `/dashboard/admin/launch` shows both times and marks Scheduled jobs as to do when the orders job has not finished for 30 minutes or the payout job for 8 days (`CONFIG.cron`).

## Orders and money

- Rules and numbers: `lib/config.ts`. State machine: `lib/orders/machine.ts`. Every change of state writes a row to `order_events` (append-only, nobody can edit or delete it).
- The ledger (`ledger_entries`, double entry, append-only) is the record of money. `select * from ledger_balances;` shows each account (credits minus debits). `platform_cash` is the only account where debits grow it. Escrow, seller pending and seller available are never below zero.
- **Reconcile** (monthly, and before any payout): for each provider payment in the provider dashboard, the matching `pay:<order id>` entry must exist and have the same amount. Sum of `order_escrow:*` balances = money held for open orders. Payouts: `seller_available:*` after payouts must be zero or a positive balance that still waits for the weekly run.
- Payment events arrive at `POST /api/webhooks/payment`. They are checked (signature, age under 5 minutes) and each event id is processed once. A rejected event (wrong amount, unknown order) is logged in the response and never funds anything.

## Disputes (built)

The buyer reports a problem on the order page (during the review window, or in the 7 days after accepting). The order is held (`disputed`): no auto-accept, no payout. The seller replies within 48 hours (`POST /api/disputes/[id]/reply`), you decide within 5 days at `/dashboard/admin/disputes`: refund in full, refund part (taken from the seller's share), ask the seller to fix, or reject and pay the seller. A decision moves the order and the ledger, tells both sides, and is written to the audit log. Three rejected disputes flag the buyer (`profiles.flagged`, a database trigger). Refunds are told to the payment provider through `PaymentProvider.refund` (fake today: no real money moves until D1).

## Payout day (Sunday, built; money is sent by hand)

1. The Sunday job (`POST /api/cron/payouts` with `CRON_SECRET`) or the button on `/dashboard/admin/payouts` makes the week's batch: one payout per seller, from orders whose 7-day hold ended. Sellers with no payout method or account on file are left out and listed with the reason.
2. Download the CSV (this locks the batch as "exported"). Send each transfer with Payoneer, Wise or the bank.
3. Mark each payout paid with the transfer reference. That moves the ledger (`seller_available` to `payout_out`) and the orders to `paid_out`, tells the seller, and is written to the audit log. If a transfer fails, mark it failed and the orders go into the next batch.

## Abuse reports and hosted demos

Reports come in at `/report-abuse`. Open reports are at `/dashboard/admin/abuse`: suspend (pauses the listing the link points to) or dismiss. Never serve seller files with `allow-same-origin`. 

## Security page (abuse hardening)

`/dashboard/admin/security` shows accounts that share a connection or device, connections that keep hitting a limit, and active blocks. Offices and families share connections: look at the accounts before blocking. Set `GUARD_SALT` (long random value) before launch; changing it later forgets old hashes and breaks existing blocks. Limits are in `lib/config.ts` (`limits`). The daily cron (`POST /api/cron/orders`) purges events older than 90 days.

## Risk page (metrics, emergency switch, held orders, clean-up)

`/dashboard/admin/risk`. Check it daily: the table shows the last 14 days and flags an unusual rise (alerts also arrive as admin notifications). During a flood of fake buyers turn on "Pause checkout for new buyers" (turn it off again when it is over; both are in the audit log). Orders from new or flagged buyers appear under "waiting for a safety check": look at the buyer and the payment, then release or cancel. Clean-up bans fake accounts and removes their reviews and reports, but keeps all evidence. Keep the audit log, `order_events`, `download_events` and `security_events` if you ever need a lawyer's notice.

## Module maintenance (migration 0049)

One part of the site (seller dashboard, checkout, SEO...) can be closed while the rest keeps working. The modules and which pages and APIs belong to each are in `lib/maintenance/config.ts`; the saved state is the `module_maintenance` table, and every change is copied into `module_maintenance_history` by the database. Payment webhooks, the scheduled jobs, `/api/health`, the audit log and the maintenance screen itself are never closed.
If a mistake leaves everything stuck and no admin screen opens, reopen every module from the Supabase SQL editor: `update module_maintenance set enabled = false;` (the history keeps the record).

## Ledger risk, evidence and chargebacks

The seller reserve is off until you set `CONFIG.reserve` (percent and days) or a rule for one seller on the Risk page. A seller can owe money (shown on their dashboard) after a refund or fee the ledger could not take from them; new earnings pay it off. In Disputes, always say whose fault it was and the fee the dispute cost: a seller at fault is charged the fee. Download the evidence PDF (order page, seller dashboard or Disputes) when answering a chargeback or a dispute. A lost chargeback bans the buyer for good; the seller's money for that order is your decision in Disputes.

## Approving listings and developers

`/dashboard/admin` lists new listings and developer profiles. Open the demo and the files first (open the files in a sandbox before approving; there is no scan). Approve, send back or reject, with a note the seller sees.

## Backups (daily, encrypted)

`npm run db:backup` saves the data of every app table (schema `public`) and the accounts (schema `auth`, without logins in progress) into `backups/sellonbay-<date>-<time>.dump.enc`, encrypted with your passphrase. The tables themselves are not in the file: they come back from `supabase/migrations`.

- Needs the PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) of the same major version as the database or newer (Supabase > Settings > Infrastructure shows it), and Node 20.
- Set `SUPABASE_DB_URL` (Supabase > Connect > Session pooler, port 5432; not the transaction pooler 6543) and `BACKUP_PASSPHRASE` (16 characters or more, kept in a password manager: a lost passphrase means a backup nobody can open). `BACKUP_DIR` and `BACKUP_KEEP` (default 14) are optional.
- Run it every day from a machine you trust (your computer or a small VPS cron job), and copy the file somewhere else too (a cloud drive). Never commit backups: the repository is public. `backups/` is in `.gitignore`.
- pg_dump may warn about "circular foreign-key constraints" on `orders`. That is expected; the restore handles it.
- Uploaded files (Storage buckets: hosted demos, pictures, trial copies, certificates) are not in the database backup. `npm run storage:backup` saves them into `backups/sellonbay-files-<date>-<time>.zip.enc` (needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the same `BACKUP_PASSPHRASE`; every file is checked against its fingerprint before the zip is kept). Run it with the database backup. The service role key reads every private file: only on a machine you trust.

## Restore a backup (test this once before launch)

1. Create a new Supabase project (never restore into the live one), and apply every file in `supabase/migrations` to it in number order.
2. `RESTORE_DB_URL=<new project> BACKUP_PASSPHRASE=... npm run db:restore -- backups/<file>.dump.enc --yes`. It refuses a database without the SellOnBay tables or one that already has accounts, runs as one transaction (all or nothing), and prints the number of accounts, listings, orders and ledger entries: compare them with the live site.
3. Files: `RESTORE_SUPABASE_URL=<new project> RESTORE_SERVICE_ROLE_KEY=<its service key> BACKUP_PASSPHRASE=... npm run storage:restore -- backups/<files>.zip.enc --yes`. It refuses a bucket that already has files (add `--merge` only if you mean it).
4. Re-set the environment variables of the app to the new project's keys. Everybody signs in again (sessions are not copied).
5. Run `npm run test:e2e` against it, and open one order and one listing (with its demo) by hand.
6. Write the date of the test here: ______

The full set of timed drills (restore, point-in-time recovery, rollback, maintenance, outside services down) is in `docs/RECOVERY_DRILL.md`.

## Sign-in emails (Supabase → Authentication)

- URL configuration: Site URL `https://sellonbay.com`; redirect URLs `https://sellonbay.com/auth/callback` and `https://sellonbay.com/auth/confirm`.
- Links that work in any browser: by default a confirm or reset link only works in the browser that asked for it. To make it work on another device, change the templates under Emails:
  - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- Why this matters: with the default links, a confirm email opened in another browser, on a phone, or by a mail scanner fails with "Email link is invalid or has expired" (otp_expired). The `/auth/confirm` link works in any browser, and opening it only shows a button, so a scanner cannot use the link up; pressing the button confirms the address.
- The site builds its redirects from the address the visitor used, and from `NEXT_PUBLIC_SITE_URL` when the server only sees its own address (0.0.0.0:3000), so set `NEXT_PUBLIC_SITE_URL=https://sellonbay.com` before the build.
- Seller and admin accounts enter their authenticator code during a reset; the page sends them there and back.

## Cloudflare (put it in front before launch)

- Proxy DNS (orange cloud), SSL mode Full (strict).
- WAF managed rules on, Bot Fight Mode on.
- Rate limits on `/login`, `/api/*`, the chat and the free tools.
- Turnstile on sign-up, sign-in, chat send and free tools. The app has the widget on the pre-sale question form, the free site-ideas tool, and sign in, sign up and password reset; set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Sign in, sign up and reset turn the check on by themselves once real keys are set (no rebuild needed) and stay open without them, so a host without keys never locks people out. Chat send has no widget yet.
- Do not cache `/api/*`, `/orders/*`, `/pay/*`, `/dashboard/*`.

## Security checklist (spec section 9). Tick when done and tested.

- [ ] Cloudflare in front (above)
- [x] Security headers: CSP, HSTS, X-Content-Type-Options, frame-ancestors, referrer policy (`next.config.ts`, tested in `tests/e2e/security.spec.ts`; scripts and styles still allow 'unsafe-inline', tighten with nonces later)
- [x] Service-role key only on the server; `scripts/check-bundle.mjs` (run in CI after the build) and `tests/unit/secrets.test.ts` check that no secret is in the browser bundle
- [x] Every API input is validated with Zod (`lib/schemas.ts`, `lib/validate.ts`)
- [x] No `dangerouslySetInnerHTML` (a unit test fails if one appears)
- [x] Uploaded files: type and size limits, random names, never served from the app origin with scripts (hosted demos are sandboxed)
- [x] Webhooks: signature checked, age checked, each event processed once
- [x] Audit log for every admin action (`audit_log`, append-only, `/dashboard/admin/audit`)
- [ ] Daily database backups, and a restore tested once (above; timed drills in `docs/RECOVERY_DRILL.md`)
- [x] Dependency audit: CI fails on a high or critical advisory in a production dependency (`npm audit --omit=dev --audit-level=high`); Dependabot is enabled (`.github/`).
- [x] Privacy: cookie notice, data export and delete request flow (`/account/privacy`, admins process deletions under Accounts), retention note on the Privacy page
- [ ] Real Turnstile keys set (the test keys check nothing)

## Things that must be true before the first real payment

- Decision D1 made, provider contract read, a lawyer has reviewed the escrow wording, refund wording, seller agreement and handover certificate (every page tagged `[LAWYER REVIEW]`).
- `GUARD_SALT` set to a long random value.
- `PAYMENT_WEBHOOK_SECRET`, `DELIVERY_SECRET`, `CRON_SECRET` set. The demo controls (`/api/demo/orders/*/skip`, "Demo controls" in the order page) and the demo pay form removed.

## Health check

`GET /api/health` answers `{"ok":true}` with status 200 while the app is up. Point the host's health check and an uptime monitor at it. It never shows keys or database state; the launch check page (`/dashboard/admin/launch`) is for that.

## More operations

- **Make an admin**: there is no built-in admin login. Sign up on the site with your own email and password, then run `update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');` in the Supabase SQL editor. Sign in again: the site asks you to set up an authenticator app (2FA), which every admin page needs.
- **SEO and blog**: Admin > SEO and blog. Write posts (guides, news) with their own address, meta title and meta description; the editor shows how the post looks in Google and what to improve. Published posts are at `/blog`, in the sitemap and in `/blog/feed.xml`. The same page sets the home page's title and description in Google and holds the Google Search Console and Bing codes (paste the HTML tag they give). After adding the site to Search Console, submit `https://sellonbay.com/sitemap.xml` there. Needs migration 0048. Admin > SEO and blog > Edit page titles sets the meta title and description of every other public page (browse, the shelves, how it works, sell, blog, legal pages); the list is `lib/seo/pageList.ts`, saved in `app_settings` as `seo:page:<path>`, empty means the built-in words.
- **Remove fake reviews**: Admin > Risk > Clean up. "Remove all reviews by an account" works even when the account has paid orders (the full account removal refuses those). Orders are kept.
- **Blocked emails**: a blocked mailbox is refused in the sign-in form and on every guarded action (orders, hiring, listings, extra work, disputes, developer profiles), because an account can also be made by calling Supabase directly. Also set Supabase Auth > Rate Limits for sign-ups and sign-ins, since that path skips our own limits.
- **Process a deletion request**: Admin > Accounts > Deletion requests. It is refused (and the person sees why) while an order, a dispute or a payout is open.
- **Abuse reports**: three different reporters pause a listing by themselves. Look at it, then suspend, dismiss, or put it back.
- **AI budget**: `AI_MONTHLY_TOKEN_BUDGET` stops the free tool for the rest of the month when used up. Watch `ai_usage` (subject `global`).
- **Domain renewals**: the scheduled job (`POST /api/cron/orders`) also sends the 30, 7 and 1 day reminders.
