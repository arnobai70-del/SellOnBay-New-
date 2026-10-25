# Upload to Hostinger, with Supabase: backup first, then the few changes

Nothing here is applied for you. Do the steps in this order, on the live project only after the backup. If you are unsure, do them on a second (staging) Supabase project first (`docs/STAGING_CHECK.md`).

The SEO and CMS work added **no migration and no table**. The only database things the code needs are migrations `0001` to `0053` (0053 only lets sellers choose PayPal as their payout method; apply it before sellers save a PayPal payout account). Check which are missing (step 2), apply only those.

## 1. Back up Supabase (before anything)

1. Dashboard > Database > Backups: take a backup (paid plans) and note the time. On the free plan there is no automatic backup, so also do the next two points.
2. Database dump from this project folder (needs `pg_dump` of the same major version as the database, see `scripts/db-backup.mjs`):
   `SUPABASE_DB_URL="<Connect > Session pooler, port 5432>" BACKUP_PASSPHRASE="<16+ characters>" npm run db:backup`
   It writes an encrypted file in `backups/` (not in git). Keep a copy off this computer, and keep the passphrase.
3. Files (the `demos` and `certificates` buckets): `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run storage:backup` (see `docs/RUNBOOK.md`).
4. Do not put the backup, the passphrase or any key in GitHub (the repository is public).

## 2. See what the project already has

SQL Editor > paste `supabase/check-state.sql` > Run. It is read only. Every `exists = false` row names the migration that is still missing. Both buckets must show `public = false`.

## 3. Apply only the missing migrations

In number order, one file at a time (`supabase/migrations/00NN_*.sql`, paste into the SQL Editor, Run, wait for success before the next). Stop at the first error and send it to me. Never run a file twice and never edit one.

- Missing `0040` or later: apply them. `0040 app_settings` is the one the SEO and CMS settings need (without it they are lost when the server restarts).
- `0016` rebuilds the ledger and drops the old wallet tables. If it is already applied, never run it again; if it is not and the project holds real orders, do not run it before we talk.

## 4. Supabase settings (dashboard, nothing to code)

- Authentication > Multi-factor: TOTP on (sellers and admins sign in with an authenticator code).
- Authentication > URL Configuration: Site URL = your domain, for example `https://www.sellonbay.com`; Redirect URLs: add `https://www.sellonbay.com/auth/callback` and `https://www.sellonbay.com/auth/confirm` (and the same for the address without `www` if you use both).
- Authentication > Providers > Email: confirm email on.
- First admin: sign up on the site, then in the SQL Editor `update public.profiles set role = 'admin' where id = '<your user id>';` and set up the authenticator code at the next sign-in.
- Project Settings > API: copy the Project URL, the `anon` key and the `service_role` key for step 5. The `service_role` key is a secret: server only, never in the browser or in GitHub.

## 5. Hostinger: Node.js app

1. Upload the zip (`SellOnBay-HOSTINGER.zip`), unzip into the app folder, Node 20.9 or newer.
2. Build command: `npm ci && npm run build`. Start command: `npm start`. The app listens on the port Hostinger gives it (`PORT`).
3. Environment variables (set in Hostinger, never in a file in GitHub). **Only these are needed:**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret). The other secret keys (download links, abuse hashing, test-payment webhooks, visitor counts) are made from it, so you do not set them |
| `CRON_SECRET` | any long random text; you also put it in the scheduler (step 4) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | from developer.paypal.com (secret: server only) |
| `PAYPAL_ENV` | `live` for real money (`sandbox` while testing) |

**Optional** (the site works without them, the Launch check says what each adds):

| Variable | What it adds |
|---|---|
| `RESEND_API_KEY` | Real email, including the alerts to sellonbayus@gmail.com. The sender defaults to `noreply@sellonbay.com`, which must be verified in Resend (`EMAIL_FROM` changes it) |
| `PAYPAL_WEBHOOK_ID` | Webhook for refunds made inside PayPal: webhook `https://<your domain>/api/webhooks/payment`, events `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED` |
| `NEXT_PUBLIC_SITE_URL` | Only if your address is not `https://sellonbay.com` (build-time: set it before `npm run build`) |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare bot check on sign-up and sign-in |
| `ADMIN_ALERT_EMAIL` | Another address for the admin alerts (default `sellonbayus@gmail.com`) |
| `GUARD_SALT`, `DELIVERY_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `ANALYTICS_SALT`, `APP_SECRET` | Your own keys instead of the made ones. Do not change them later: it forgets abuse blocks and ends open download links |

PayPal Payouts (paying sellers with one click) must be switched on for your PayPal business account. Never set `EXAMPLE_ORDERS` or `LAUNCHBAY_DEMO` on the live site.

4. Scheduler (Hostinger cron, or any): every few minutes `POST https://your-domain/api/cron/orders` and daily `POST /api/cron/payouts`, header `Authorization: Bearer <CRON_SECRET>`. Without it, the 48-hour auto-accept and the payout timers do not run.
5. HTTPS on, one address (redirect `www` to non-`www` or the other way round).

## 6. After it is up

1. `/api/health` answers ok. Sign in as the admin (with the authenticator code).
2. `/dashboard/admin/launch`: shows which keys are set (names only). `/dashboard/admin/maintenance` must not say "memory only".
3. `/sitemap.xml` and `/robots.txt` open. `/dashboard/admin/seo/links`: run the link check, 0 broken.
4. Search Console and Bing Webmaster Tools: add the site and send `/sitemap.xml`.
5. The made-up example products are gone by themselves on a live site. A real listing needs a seller: sign up as a seller, list, and approve it in the admin.
6. Payments are still the test gateway (test cards only) until the real payment provider is built.

## If something goes wrong

Code: put the previous zip back and restart. Settings: every SEO change is in the audit log and reversible in the admin (`docs/SEO_DEPLOYMENT.md`). Database: migrations are not undone; restore the backup from step 1 only as a last resort, because it loses everything written since.
