# Deployment and database setup

Owner's rule (2026-10-20): all work is prepared in this GitHub repository. Nobody applies a migration, changes the live Supabase database, deletes or resets data, deploys or restarts the live site, or changes production environment variables without the owner's written permission for that step. This file is the order to follow once that permission is given. A unit test (`tests/unit/deployment-doc.test.ts`) fails when a migration file is missing from the list below.

## 1. What can be checked without a database

Run these on every change. CI runs them on every pull request.

| Check | Command |
| --- | --- |
| Lint (0 errors) | `npm run lint` |
| Types | `npm run typecheck` |
| Unit tests | `npm test` |
| Every migration, in order, in an in-process Postgres | `npm run check:migrations` |
| No new migration loses data or breaks the running site | `npm run check:migration-safety` |
| Production build | `npm run build` |
| No secret in the browser bundle | `npm run check:bundle` (after a build) |
| Demo server smoke test | `npm run smoke:demo` |
| Blue-green script plan and switch (stand-ins, no server) | `node --test deploy/blue-green.test.mjs` |
| Browser tests in demo mode (no database) | build with `LAUNCHBAY_DEMO=1`, start on port 3002, `npm run test:e2e` (the real-server tests fail without port 3000; that is expected) |

## 2. What needs a staging database (later)

These tests create users, orders, ledger entries and files, so they run only against a separate staging Supabase project, never production. See `docs/STAGING_GATE.md` for the guard (`scripts/verify-staging-target.mjs`) and the manual GitHub workflow.

- Browser tests against the real server (port 3000 with `.env.local` pointing at **staging**): `admin`, `buy-real`, `chat`, `extras`, `guard`, `handover`, `listing`, `orders`, `presale`, `privacy` and `rls` in `tests/e2e`.
- `tests/e2e/delivery.e2e.cjs` (real file delivery).
- Module maintenance with the real table: switch a module on in the Maintenance Manager, restart the app, and check it is still closed. Then check the row and its history in `module_maintenance` and `module_maintenance_history`.

## 3. Migration order

Apply the files in `supabase/migrations/` strictly in number order, each one once. Never edit a file that has been applied; fix forward with a new file. As far as this repository records, the dev project had 0001 to 0040 applied on 2026-10-09. Check the real state first in the Supabase dashboard: Database → Migrations, or the `supabase_migrations.schema_migrations` table.

| File | What it adds |
| --- | --- |
| 0001_init.sql | Base schema, RLS on every table |
| 0002_protect_sellers.sql | Seller protection rules |
| 0003_accept_orders.sql | Accepting an order, payout and bug-fix windows |
| 0004_grants.sql | Table and column privileges |
| 0005_demos.sql | Hosted demo sites |
| 0006_apps.sql | Mobile apps |
| 0007_more_platforms.sql | Web and desktop apps |
| 0008_developers.sql | Developer profiles |
| 0009_demo_orders.sql | Demo orders (replaced by 0015) |
| 0010_digital_products.sql | Digital products |
| 0011_trial_pack.sql | Trial package on hire requests |
| 0012_delivery.sql | Licence keys and download log |
| 0013_presale_questions.sql | Pre-sale questions |
| 0014_sample_trial.sql | Free sample and trial copy links |
| 0015_orders_v2.sql | Real orders and order events |
| 0016_ledger.sql | Double-entry ledger, idempotent webhooks |
| 0017_delivery_licences_certificates.sql | Licences, handover, extra work, certificates |
| 0018_ledger_spec_shape.sql | Ledger accounts in the spec's shape |
| 0019_disputes.sql | Disputes |
| 0020_strikes_notifications.sql | Chat strikes and notifications |
| 0021_admin.sql | Audit log, review notes, payout batches |
| 0022_express.sql | Express delivery |
| 0023_reviews.sql | Reviews |
| 0024_abuse_auto_pause.sql | Abuse reports pause a listing |
| 0025_data_requests.sql | Data export and deletion requests |
| 0026_scan.sql | Listing scan results and file versions |
| 0027_dev_trial.sql | Developers' own trial package |
| 0028_chat.sql | Order chat |
| 0029_ai_usage.sql | Free tools usage and AI cost control |
| 0030_abuse_verified.sql | Verified reporters |
| 0031_abuse_hardening.sql | Connection and device trail, admin blocks |
| 0032_risk.sql | Daily counters, emergency switches, held orders |
| 0033_ledger_risk.sql | Seller reserve and debt, dispute liability |
| 0034_consents.sql | Logged "I accept" clicks |
| 0035_email_blocks_chargeback_ban.sql | Email blocklist, chargeback ban |
| 0036_product_info.sql | Documentation and requirements for digital products |
| 0037_product_versions.sql | New versions of a digital product |
| 0038_repo_access.sql | Repository delivery |
| 0039_package_prices.sql | Seller's own package prices |
| 0040_app_settings.sql | Admin settings without a deploy |
| 0041_delivery_7_days.sql | Delivery 1 to 7 days |
| 0042_ai_atomic_quotas.sql | Atomic AI quotas (needs 0029) |
| 0043_products_server_writes_only.sql | Listings written only by the server |
| 0044_presale_hide_ip.sql | Seller cannot read the asker's IP |
| 0045_admin_aal2_payout_details.sql | Admin rights need the authenticator code |
| 0046_order_promise_snapshot.sql | What a digital listing promised at purchase |
| 0047_close_direct_writes.sql | Abuse reports written only by the server |
| 0048_posts.sql | Blog posts with meta title and description |
| 0049_module_maintenance.sql | Module maintenance and its history |
| 0050_more_indexes.sql | Indexes for lookups the code already makes |
| 0051_email_outbox.sql | Email queue with retries (needs 0020) |
| 0052_visitor_analytics.sql | Visitor counts, clicks and daily reports for the admin |
| 0053_paypal_payout_method.sql | Sellers can choose PayPal as their payout method |
| 0054_delivery_hours.sql | Delivery promised in hours on listings and orders |
| 0055_admin_scopes.sql | Admin permissions (Super, Finance, Catalog, Support, Content, Delivery); provisional number |
| 0056_platform_products.sql | Platform-owned products; shared append-only trigger; provisional number |
| 0057_seller_plans.sql | Versioned seller plans (Free, Pro, Business), subscriptions and their log; plan and seller gross on new orders; provisional number |
| 0058_file_objects.sql | Private quarantine and product-files buckets; source file records, events and pinned versions (immutable once approved); provisional number |
| 0059_requests_quotations.sql | Purchase requests and versioned quotations (immutable once issued), their logs, and accept_quotation (order created in the same transaction); provisional number |
| 0060_payments.sql | Manual payments: methods, attempts (one use per reference, fixed once decided), refunds, payment log, private payment-proofs bucket; order states payment_review and release_pending; provisional number |
| 0061_release_entitlements.sql | Release approval fields on orders (a quotation order cannot be delivered without one), order_apply widened, entitlements and their versions; provisional number |
| 0062_conversations.sql | Admin-mediated messages (buyer and SellOnBay, SellOnBay and seller, internal notes) and support tickets; provisional number |
| 0063_content_legal.sql | CMS history (append-only revisions of site-builder and SEO settings) and versioned legal documents (published versions fixed, atomic publish); provisional number |
| 0064_revisions_custom_dev.sql | Revision policies (seller proposes, Catalog approves), revisions and their log, custom-development assignment and paid-revision link on purchase_requests; provisional number |
| 0065_reports_country.sql | Sales PDF export log (kept; files deleted after 24 hours from the private `reports` bucket) and first-party country counts (code only; off until legal approval); provisional number |
| 0066_account_links.sql | Link intents (single use, at most 15 minutes) and the append-only social sign-in link log; providers stay off until B-7; provisional number |
| 0067_close_default_grants.sql | SECURITY: takes back Supabase's default browser privileges on products_public (updatable security-definer view), ledger_balances, bump_counter() and sequences; new objects start closed; privileges only; provisional number |
| 0068_column_grants_hold.sql | SECURITY: narrow column grants hold again (notifications read_at only, no seller profile delete by clients, no anon writes on client-policy tables); privileges only; provisional number |
| 0069_file_approval_without_scan.sql | Owner decision 2026-10-29: approving a source file no longer needs a clean malware scan (REMOVED BY OWNER, SECURITY RISK ACCEPTED); SHA-256, size, private copy and reviewer still required; scan_* columns kept; apply before the release that stops scanning; provisional number |
| 0070_product_tags.sql | Owner 2026-11-03: optional tags on a listing (text[], at most 8), set by the seller on the listing form and used by site search; nullable, so the running site works before and after; the code checks for the column and leaves tags out until it exists |
| 0071_cron_runs.sql | Owner 2026-11-03: one row per run of the orders and payouts jobs (start, finish, ok, first 500 characters of an error) for the admin system page; server only (RLS on, no client grant); kept 30 days |
| 0072_app_errors.sql | Owner 2026-11-03: server error counts per kind and hour (fingerprint of route, status and first message line, already blanked by lib/monitor.ts) and log_app_error(), service role only; kept 30 days |
| 0073_system_db_stats.sql | Owner 2026-11-03: system_db_stats() returns the database size and connection count for the admin system page; read only, service role only |
| 0074_flat_plan.sql | Owner 2026-11-07: version 2 of the free plan at a flat 22% fee; older plan versions stop being offered, and orders keep the fee they recorded |
| 0075_public_store_and_contact.sql | Owner 2026-11-07: public seller store fields, listing stack, featured and beta opt-in, contact messages and newsletter tables; only adds |

Almost every file only adds or tightens. One exception: 0016 drops the old `wallets` and `ledger_entries` tables from 0001 and rebuilds the ledger, so on a database that already holds money records, back up and read 0016 before running it. Files 0043, 0045 and 0047 remove client write rights. After them, check that sellers can still save listings through the site, because the site writes through the server.

### Migration safety

During a deploy the old site keeps running for a while on the new database (and with blue-green both versions run at once), so every new migration must leave the old code working. `npm run check:migration-safety` (in CI, rules in `scripts/lib/migration-safety.mjs`) fails when a migration after 0049 drops a table, column, type or schema, empties a table, deletes rows, renames a table or column, changes a column type, makes a column required, or adds a required column with no default. Files up to 0049 are history and are not checked again; the ones that did such steps are listed above.

Do these changes in steps instead:

- **Rename:** add the new column, copy the data, let the code write both, and drop the old column only in a later release.
- **Required column:** add it with a default, or add it as optional, fill it, and make it required in a later release.
- **Remove a table or column:** first ship code that no longer uses it, then remove it in a later migration.

If a destructive step is really needed, take a backup, get the owner's written agreement, and put `-- destructive-ok: <why, who agreed and when>` on the line just above that one statement.

## 4. Applying migrations (only with permission)

1. Do it on **staging first**: a separate Supabase project with the same files. Run section 2 there.
2. Back up production: `npm run db:backup` (see RUNBOOK "Backups"), and the dashboard backup if the plan has one. Keep the backup outside GitHub (the repository is public).
3. Apply the missing files in order, one at a time (`supabase db push`, or paste each into the SQL editor). Stop at the first error and do not continue.
4. Apply the migrations **before** deploying the code that needs them. Every file only adds, so the old code keeps working on the new database. A few features check for their table and fall back to this server's memory until it exists: orders, admin settings, SEO words and module maintenance. Other features expect their migration to be there.
5. After the migration, open `/dashboard/admin/launch` and `/dashboard/admin/maintenance`. The maintenance screen must no longer say "Saved in this server's memory only".

## 5. Deploying the site (only with permission)

The hosting plan is not decided yet: a Hostinger VPS or Hostinger's Node.js web hosting.

- **Today (one app instance):** pull `main`, `npm ci`, `npm run build`, restart the Node process. The site is down for the few seconds the restart takes. Before a risky change, put only the affected module into maintenance (Admin → System → Maintenance Manager), not the whole site.
- **Zero downtime (needs a VPS):** blue-green with `deploy/blue-green.sh`. Hostinger's Node.js web hosting runs one copy only, so there the "today" way above stays. The scripts are ready in the repository but have not been run on any server.

### Blue-green on a VPS

Two copies of the site live side by side, `blue` (port 3101) and `green` (port 3102), each in its own folder under `/srv/sellonbay`. nginx sends visitors to one of them. A deploy builds the new version in the copy that is not serving, starts it, checks `/api/health` on its own port, and only then points nginx at it (nginx checks the new setting with `nginx -t` first and keeps the old one if it is refused). The old copy keeps running, so going back is one switch. If the new copy does not answer, visitors never leave the old one.

One-time setup (with the owner's permission):

1. Install Node 22, nginx and git. Create a `sellonbay` user and `/srv/sellonbay` owned by it.
2. Put the production variables in `/etc/sellonbay/env` (readable only by `sellonbay` and root). Create `/etc/sellonbay/port-blue` containing `PORT=3101` and `/etc/sellonbay/port-green` containing `PORT=3102`.
3. Copy `deploy/sellonbay@.service` to `/etc/systemd/system/`, then `systemctl daemon-reload` and `systemctl enable sellonbay@blue sellonbay@green`.
4. Adapt `deploy/nginx-sellonbay.conf.example` (server name, certificates) and create `/etc/nginx/sellonbay-upstream.conf` with `server 127.0.0.1:3101;`.
5. Behind nginx, set `TRUSTED_PROXY_HOPS=1` so rate limits see the visitor's address (`lib/clientIp.ts`); add one more hop if Cloudflare is in front too.
6. Point the cron jobs at the public address (as today), so they always reach the copy that is serving.
7. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (an Upstash Redis database) in `/etc/sellonbay/env`, so both copies share one count for rate limits (`lib/rateLimit.ts`). Without them each copy counts on its own, which doubles the limits while both run.

Each release:

1. Apply any new migrations first (section 4). `npm run check:migration-safety` keeps them safe for the copy that is still running.
2. `deploy/blue-green.sh deploy` (or `deploy/blue-green.sh deploy <tag or commit>`). `DRY_RUN=1` prints the plan without doing anything.
3. Check the site. If something is wrong: `deploy/blue-green.sh rollback`. `deploy/blue-green.sh status` shows which copy serves and whether each one answers.

Both copies read the same database, so module maintenance applies to both within 10 seconds (the cache in `lib/maintenance/state.ts`). Orders and payments are written by whichever copy gets the request, through the same state machine and ledger, so a switch does not lose or double them.

Environment variables are set on the host, never in GitHub. `/dashboard/admin/launch` lists which ones are set (names only, never values).

## 6. Rolling back

- **Code:** go back to the previous build (blue-green: `deploy/blue-green.sh rollback`; one instance: check out the previous commit, build, restart).
- **Database:** migrations are not reversed. Fix forward with a new migration. Restore a backup only as a last resort, with the owner (RUNBOOK "Restore a backup"), because it loses everything written since the backup.
- **One module misbehaving:** close only that module in the Maintenance Manager. If no admin screen opens, run `update module_maintenance set enabled = false;` in the SQL editor to reopen every module.
