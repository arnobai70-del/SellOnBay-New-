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

`SellOnBay-HOSTINGER.zip` is made from the committed code with `git archive` (the zip's comment is the commit it was made from). Upload it, then build on the server with `npm ci && npm run build` and start with `npm start`. The previous zip is kept beside it as `SellOnBay-HOSTINGER-previous-<commit>.zip` to roll back.
