# Deploy to Hostinger (glass redesign release)

The full step-by-step (backup, migrations, Supabase settings, upload, scheduler, checks) is in `docs/HOSTINGER_UPLOAD.md`, and what still needs doing before launch is in `docs/LAUNCH_CHECKLIST.md`. This page lists the server settings this release adds. Set them in Hostinger's environment variables, never in a file in GitHub. Deploy only with the owner's written ok.

## Email: Zoho ZeptoMail

| Variable | Value |
| --- | --- |
| `ZEPTOMAIL_API_KEY` | The Send Mail token from ZeptoMail (Mail Agents › your agent › SMTP/API › API). **Paste the token WITHOUT the `Zoho-enczapikey ` in front.** The app trims spaces, removes that word if it is there anyway, and always sends `Authorization: Zoho-enczapikey <token>`. |
| `ZEPTOMAIL_HOST` | `api.zeptomail.com` (or the regional host ZeptoMail shows, for example `api.zeptomail.eu`). Host name only, no `https://`. |
| `EMAIL_ALLOW_ALL` | Leave unset until launch: until then only our own `@sellonbay.com` and test addresses get email, and the rest is logged. Set `1` at launch. |

The sender addresses (support@, sales@, billing@, ...) are set in Admin › Settings › Contact & social; they must be on sellonbay.com and verified in ZeptoMail.

## The other new settings

| Variable | What it does |
| --- | --- |
| `CRON_SECRET` | The scheduler's key. Call `POST /api/cron/orders` every few minutes with `Authorization: Bearer <CRON_SECRET>`: auto-accept, beta feedback, sale start and end, Server health alerts, email retries. |
| `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS` | How the host passes the visitor's address (rate limits; maintenance testers only count when this is set). |
| `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON` | Admin › Visitors (Viewer access to the property). Without them the page shows "Connect GA4". |
| `SUPABASE_ACCESS_TOKEN` | Server health's last backup and advisor counts. |
| `HOST_KIND`, `DB_PLAN_MB`, `STORAGE_PLAN_MB`, `REQUEST_TIMING_SAMPLE` | Server health: `shared` on Hostinger's Node.js hosting, the Supabase plan limits (defaults 500 and 1024), every n-th API request timed (default 2). |

Never set `EXAMPLE_ORDERS`, `LAUNCHBAY_DEMO` or `ENABLE_TEST_CHECKOUT` on the live server.

## The release build

On the `release/glass-ui` branch with nothing uncommitted, run `npm run package:hostinger`. It makes `SellOnBay-HOSTINGER.zip` from the last commit with `git archive` (only committed files, never `.env.local` or backups; the zip's comment is the commit it was made from) and pushes or deploys nothing. Upload it, then build on the server with `npm ci && npm run build` and start with `npm start`. The previous zip is kept beside it as `SellOnBay-HOSTINGER-previous-<commit>.zip` to roll back.

## Scheduled jobs (hPanel › Advanced › Cron Jobs)

Two jobs. Both are POST requests that carry `CRON_SECRET` (set in the Node.js app's environment) as a Bearer token. Use "Custom" and paste the
command; replace `YOUR_CRON_SECRET` with the same value as the app's `CRON_SECRET`.

| Job | Schedule (cron) | Command |
|---|---|---|
| Orders: delivery timers, auto-accept, beta jobs, email outbox, reminders, clean-up | `*/5 * * * *` (every 5 minutes) | `curl -s -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://sellonbay.com/api/cron/orders > /dev/null 2>&1` |
| Payouts: the weekly batch | `0 2 * * 4` (Thursday 02:00) | `curl -s -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://sellonbay.com/api/cron/payouts > /dev/null 2>&1` |

hPanel cron runs in the server's time zone; payouts are counted in UTC, so any hour on Thursday works. After the first run, Admin › Server health
shows "Last run" for each job. A 401 answer means the secret in the command and in the app differ.
