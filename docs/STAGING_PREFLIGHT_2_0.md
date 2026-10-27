# SellOnBay 2.0 staging preflight (2026-10-28)

Staging project: `occketfmjwciilzuddkv` ("SellOnBay New", ap-southeast-2, Postgres 17, created 2026-10-27).
Production project, never touched by any step here: `knvxtgzrylvkhyrcezlq` ("MARKETPLACE PROJECT"; the live site's bundle uses it).

Status: NOTHING applied. Every step below waits for the owner's separate written permission.

## 1. What was verified (read-only)

| Check | Result |
|---|---|
| Project exists and is healthy | Yes (`list_projects`) |
| Live site uses it | No: sellonbay.com's JavaScript names only the production project |
| Applied migrations | None (`list_migrations` is empty) |
| Tables in `public` | None; `storage` has Supabase's own tables, 0 buckets |
| Extensions already on | `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`, `plpgsql` |
| MCP access | Yes (read tools work) |
| Supabase CLI | Not installed. The old local link to production (`supabase/.temp`) was removed and is now git-ignored |

## 2. Static review of 0001-0066

| Area | Finding |
|---|---|
| Order | 66 files, numbers 0001 to 0066 with no gaps or duplicates. The whole chain runs in order in the in-process Postgres check (`npm run check:migrations`: all ok) |
| RLS | Every one of the 81 tables created in `public` turns RLS on |
| Client grants | Only column-level grants to `authenticated` (0001, 0004, 0020); 0043, 0045 and 0047 take client writes away again. Every 2.0 table (0055-0066) has no client grant at all |
| `security definer` | Every such function fixes its `search_path` |
| Storage | Buckets only (0005, 0017, 0058, 0060, 0065), all private; no policies on `storage.objects`, so no "must be owner of table objects" problem |
| Auth | One trigger on `auth.users` (0001, `handle_new_user`, reads only `full_name`; the role defaults to buyer) |
| pg_cron | 0003 enables `pg_cron` and schedules a job; 0015 unschedules it again. The extension stays enabled, unused |
| Realtime | 0028 adds `messages` to `supabase_realtime`, wrapped so it cannot fail the migration |
| Destructive steps | 0015, 0016, 0019, 0023, 0043 drop old objects of earlier files (harmless on an empty database). 0053 and 0060 replace a check constraint with a wider one, marked `destructive-ok` |

### Compatibility risks

1. **Never run on real Supabase: 0041-0066.** 0001-0040 were applied to the old dev project with `supabase db push` on 2026-10-09; nothing after 0040 has met a real Supabase. The local check stubs `auth.users` (3 columns), `auth.uid()`/`auth.jwt()`, `storage.buckets` (4 columns), `cron`, and the `anon`/`authenticated`/`service_role` roles.
2. **Storage buckets** (0005, 0017, 0058, 0060, 0065) insert `id, name, public, file_size_limit` only; the real table has more columns with defaults, so this should work, but it is first proved on staging.
3. **Migration history.** `supabase db push` records versions `0001`... Supabase MCP `apply_migration` records a timestamp version with the file name. Mixing the two on one project makes the CLI think nothing is applied. Choose one tool for staging and keep it; production uses whatever the production project already used (check its history first, Appendix A, needs separate permission).
4. **Provisional numbers 0055-0066.** If production turns out to have files with these numbers already, they must be renumbered before production; staging is unaffected.
5. **0016** rebuilds the ledger tables; on staging (empty) it is harmless. On production it must be read with the backup in hand (DEPLOYMENT.md).

## 3. Proposed sequence (for approval)

Apply **all 66 files, one at a time, in this order**, to `occketfmjwciilzuddkv` only. Stop at the first error and report it; never edit an applied file.

```
0001_init 0002_protect_sellers 0003_accept_orders 0004_grants 0005_demos 0006_apps 0007_more_platforms 0008_developers 0009_demo_orders
0010_digital_products 0011_trial_pack 0012_delivery 0013_presale_questions 0014_sample_trial 0015_orders_v2 0016_ledger
0017_delivery_licences_certificates 0018_ledger_spec_shape 0019_disputes 0020_strikes_notifications 0021_admin 0022_express 0023_reviews
0024_abuse_auto_pause 0025_data_requests 0026_scan 0027_dev_trial 0028_chat 0029_ai_usage 0030_abuse_verified 0031_abuse_hardening 0032_risk
0033_ledger_risk 0034_consents 0035_email_blocks_chargeback_ban 0036_product_info 0037_product_versions 0038_repo_access 0039_package_prices
0040_app_settings 0041_delivery_7_days 0042_ai_atomic_quotas 0043_products_server_writes_only 0044_presale_hide_ip 0045_admin_aal2_payout_details
0046_order_promise_snapshot 0047_close_direct_writes 0048_posts 0049_module_maintenance 0050_more_indexes 0051_email_outbox
0052_visitor_analytics 0053_paypal_payout_method 0054_delivery_hours 0055_admin_scopes 0056_platform_products 0057_seller_plans
0058_file_objects 0059_requests_quotations 0060_payments 0061_release_entitlements 0062_conversations 0063_content_legal
0064_revisions_custom_dev 0065_reports_country 0066_account_links
```

Recommended tool: the Supabase MCP `apply_migration` with the explicit project id `occketfmjwciilzuddkv` and the file name as the migration
name (no credentials leave the dashboard connection). Alternative: install the Supabase CLI, `supabase link --project-ref occketfmjwciilzuddkv`
(the owner types the database password), `supabase db push --dry-run`, then `supabase db push`; this rehearses the production method.

## 4. Verification after the migrations

1. `list_migrations`: 66 entries, in order.
2. `list_tables` (public): the 81 tables; each with RLS on.
3. Security advisor (`get_advisors security`): no table without RLS, no exposed `security definer` without `search_path`.
4. Read-only SQL: no `anon`/`authenticated` privilege on any 2.0 table; the six buckets exist and are private with the stated size limits; `cron.job` has no `auto-accept-orders` job; `seller_plans` seed rows equal `CONFIG.plans` (15/10/5%, 5/25/100 listings, $19/$193.80, $49/$499.80).
5. The migration checker's own assertions, re-run as read-only queries where they only read.

## 5. Auth and project settings to set on staging (owner, in the dashboard; not done)

- URL configuration: Site URL and Redirect URLs = the staging address only.
- MFA: TOTP on. Email sign-in on, email confirmation on. Every social provider OFF.
- Note for B-7: record the project's identity-linking behaviour before any provider is ever enabled.
- Backups: check what the plan includes.

## 6. Staging app configuration

`deploy/staging.env.example` (no secrets). With `SITE_STAGE=staging` the app (lib/stage.ts, proven locally on a staging-mode build):
answers 401 without the staging password (except `/api/health` and the secret-protected `/api/cron/*`), sends `X-Robots-Tag: noindex,
nofollow, noarchive` on every response, serves `Disallow: /` and an empty sitemap, marks pages noindex, and answers 503 to everything if the
password is missing, the Supabase URL is not the staging project or names production, the site URL is sellonbay.com, or GA4 is not "off".
Without `SITE_STAGE` nothing changes (unit-tested).

## 7. Hosting recommendation (nothing created)

| Option | Fit | Cost (check on the provider's site) |
|---|---|---|
| A. Small VPS (for example Hostinger, the planned production type) with `deploy/blue-green.sh` | Rehearses the real production setup and rollback | Monthly VPS fee |
| B. Vercel (Pro for business use) | Native Next.js; quickest to stand up; app password is ours (lib/stage.ts) | Monthly seat fee |
| C. This computer + Cloudflare Tunnel (cloudflared is installed) behind Cloudflare Access | Free and isolated, but only up while the computer is on | Free tier |

Recommendation: **A** for the final staging run (it is the production rehearsal B-13 asks for); **C** if a quick look is needed before buying a VPS.

## 8. Test fixtures and staging E2E (after the migrations, separate permission)

1. `node scripts/staging-fixtures.mjs` (dry run) then `--apply`: 2 buyers, 2 sellers, one admin per permission (super, finance, catalog,
   support, content, delivery), all `@example.test`, one shared test password from `STAGING_FIXTURE_PASSWORD`. Refuses any project but staging.
2. Sign in once as each seller and admin and enrol TOTP with a test authenticator.
3. Staging scenario by hand: seller lists a site and uploads a zip (scanner stays BLOCKED, so files stop in review: expected); buyer requests;
   Support quotes; Super approves a price change; buyer accepts; Finance adds a test payment method and reconciles a made-up reference;
   Delivery approves the release (work order with a note); buyer messages Support, opens a ticket, asks for a revision; seller and Finance export PDFs.
4. Automated: `STAGING_CONFIRM=I_UNDERSTAND_STAGING_WRITES node scripts/verify-staging-target.mjs`, then the RLS workflow (`staging-rls.yml`)
   and the BLOCKED browser specs with `REAL_URL` set to the staging address.
5. Afterwards: export the results into IMPLEMENTATION_STATUS.md; staging data stays (append-only logs keep history by design).
