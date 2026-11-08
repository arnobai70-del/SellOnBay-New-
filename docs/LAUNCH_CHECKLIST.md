# Before launch

Written at the end of the glass redesign (2026-11-08). Nothing here is done by itself: each line is for the owner, or for "prepare launch".

## Placeholders to fill

| Placeholder | Where | What it needs |
| --- | --- | --- |
| `[PAYOUT FEE]` | `/sell`, fees table (`app/(glass)/sell/page.tsx`) | What a payout costs the seller (per method, or "none"). |
| `[DOMAIN REFUND POLICY]` | `/domains` (`app/(glass)/domains/page.tsx`) | Whether a registered domain can be refunded (registrar fees usually cannot). |
| `[CONFIRM]` | `/legal/licenses`, "Use for a client" under the standard licence | Yes or No. |
| `[N] months` (twice) | `/legal/licenses`, "Updates from the seller" for the standard and extended licence | How many months of updates each licence includes. |
| `[LAWYER REVIEW]` | Terms, seller agreement, the other legal pages' stamp, the accept-box consent text, the handover certificate, the evidence PDF, licence texts and tiers, quotation terms, sales PDF | A lawyer reads them; then publish each as a version in Admin › Legal documents. |

## Keys and server settings (server environment only, never in git)

- [ ] Change the database password (it was pasted in the chat) and update `.env.local` and the server.
- [ ] `ZEPTOMAIL_API_KEY`, `ZEPTOMAIL_HOST`; at launch `EMAIL_ALLOW_ALL=1` (until then only our own and test addresses get email).
- [ ] `CRON_SECRET` and a scheduler calling `POST /api/cron/orders` every few minutes (auto-accept, beta feedback, sale start and end, health alerts, email retries).
- [ ] `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS` for the host (rate limits, maintenance testers).
- [ ] `GA4_PROPERTY_ID` and `GA4_SERVICE_ACCOUNT_JSON` (Viewer access), and the custom dimension "section" (event scope) in GA4.
- [ ] `SUPABASE_ACCESS_TOKEN` (last backup on Server health), `HOST_KIND`, `DB_PLAN_MB` and `STORAGE_PLAN_MB` matching the Supabase plan.
- [ ] Optional: `FIRST_PARTY_COUNTRY_TRUSTED=1` with the host's country header for the cookieless count.
- [ ] Turnstile keys for sign-in and the contact form.
- [ ] Never set `EXAMPLE_ORDERS`, `LAUNCHBAY_DEMO` or `ENABLE_TEST_CHECKOUT` on the live server.

## Data

- [ ] Fresh backup (database and storage) before anything else.
- [ ] Migrations 0074 to 0084 are applied to the working database. If the live site uses another project, apply them in order (`docs/DEPLOYMENT.md`).
- [ ] "Prepare launch": remove the test data (`docs/CLEANUP.md` group E), the legacy public site (group B) and `PayForm.tsx`, and move `design-reference/` out.

## Money and operations

- [ ] Keep `PAYMENTS_MODE` = free beta until a payment provider (decision D1) is chosen and tested in sandbox; then switch in Admin › Settings with a reason.
- [ ] Cash at a point of sale: who keeps the cash on hand and how it is banked (the ledger account is `platform_cash_on_hand`).
- [ ] Coupons are managed but not yet used at checkout: wire them when live payments start.
- [ ] Domains are registered by hand in the buyer's name (no registrar connected); record each one in Admin › Domains.
- [ ] Finance approves sellers' ID checks before their first Thursday payout.
- [ ] Decide the allowed countries (Admin › Settings; empty = everywhere).

## Going live

- [ ] Merge to main and deploy only with the owner's written ok.
- [ ] After deploy: home, `/websites`, a website, sign-in with the authenticator code, a beta request, admin approval, the 404 page, Server health.
- [ ] Search Console: submit the sitemap and check for errors.
