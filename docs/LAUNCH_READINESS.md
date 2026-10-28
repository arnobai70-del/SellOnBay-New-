# Launch readiness (SellOnBay 2.0)

Prepared 2026-10-28 for the owner's approval. Nothing in this file has been run against production (`knvxtgzrylvkhyrcezlq`): no SQL,
no migration, no privilege change, no deployment, no credential change. Each production step below names the approval it needs.
Staging (`occketfmjwciilzuddkv`) results are in docs/STAGING_LOG.md.

## 1. Production migration-history reconciliation

What we know: the repository has migrations 0001 to 0068. Staging has all 68, applied with the Supabase CLI and recorded once.
Production's history is NOT known. CLAUDE.md records an older push of 0001 to 0040 to "the dev Supabase project", and the read-only
catalogue checks on 2026-10-28 showed production privileges that differ from the files (section 2). So production may hold migrations
applied by hand, or none of 0041 to 0068.

Plan (each step needs the owner's written yes; steps 1 and 2 are read-only):

1. Read the recorded history: `select version, name from supabase_migrations.schema_migrations order by version;`
   (or `supabase migration list --linked` against production). Read only.
2. For each version that is missing or unrecorded, check whether its objects exist: run read-only catalogue probes (tables, columns,
   functions, policies) built from that migration file. This gives three lists: applied and recorded, applied but not recorded, missing.
3. Take a fresh backup (section 3) and copy it off the machine.
4. Apply "applied but not recorded" as history only (`supabase migration repair --status applied <version>`). Use no SQL for these.
5. Apply the missing migrations in order with the CLI, one batch at a time, stopping at the first error. 0067 and 0068 are NOT applied
   unchanged: production privileges differ, so a production-specific privileges migration is written from the section 2 diff, reviewed,
   tried on a staging copy restored from the production backup, and only then applied.
6. Re-run `scripts/privilege-snapshot.sql` and the strict RLS suite (`CI_STAGING_STRICT=1`) against a restored staging copy.
   Production gets the read-only snapshot only.

Approval needed: read-only steps 1, 2 and 6, then a separate yes for 3, 4 and 5 with the reviewed file list.

## 2. Production permission-drift comparison

Tool: `scripts/privilege-snapshot.sql` (SELECT only; no row data). It covers:
- table, column, function and sequence privileges for `anon`, `authenticated` and `public`
- MAINTAIN, RLS on every table, policies (hashed expressions), default privileges and bucket privacy

The same file is run on staging and production and the outputs are diffed line by line.

Staging baseline (2026-10-28, after 0068):

| Check | Count |
| --- | --- |
| Buckets, all private | 6 |
| Tables, RLS on every one | 80 |
| Policies | 29 |
| Table grant rows / anon | 71 / 35 |
| Column grant rows | 730 |
| MAINTAIN rows / anon | 60 / 29 |
| Sequences with anon SELECT and USAGE (Supabase default, no UPDATE) | 17 |
| Functions anon may execute | 28 |
| Default privileges for objects created by `supabase_admin` (platform default; our migrations run as `postgres`) | 3 |

Of the 28 functions, 27 are trigger functions, which cannot be called over the API. The other is `is_admin()`, which the policies need
and which answers false for anon.

Production facts already seen (read-only, 2026-10-28, no rows read):

| Object | Production |
| --- | --- |
| `products_public` | anon has SELECT and MAINTAIN; no writes |
| `ledger_balances` | anon has MAINTAIN only |
| `bump_counter` | postgres and service_role only |
| `notifications` | authenticated has SELECT and MAINTAIN, UPDATE on `read_at` only |
| `seller_profiles` | authenticated has SELECT and MAINTAIN; anon has MAINTAIN |

None of these is exploitable, but they differ from the migration files.

Known candidates for the production-specific privileges file (not run, not approved): revoke MAINTAIN from `anon` and `authenticated`.
From `authenticated`, also revoke INSERT/DELETE on `profiles` and UPDATE/DELETE on `abuse_reports` (RLS already refuses them). The
proposed `revoke maintain` statement stays unexecuted until the full diff is reviewed.

Approval needed: one read-only run of the snapshot on production. The production-specific privileges migration comes later, as its own
approval.

## 3. Backup and restore verification

Follows docs/RECOVERY_DRILL.md (drill 1) and docs/RUNBOOK.md "Backups", with these additions for the launch:

1. Owner confirms the Supabase plan: daily backups kept for how long, and whether point-in-time recovery is on (paid add-on; confirm
   price). Agree the RPO and RTO.
2. On a trusted machine: `npm run db:backup` and `npm run storage:backup` against production (read-only export; owner approval). Copy
   both off the machine, encrypted. Never commit them, and never put them in a public bucket.
3. Restore into a NEW, empty, temporary Supabase project (not staging): apply 0001 to 0068, `npm run db:restore`, `npm run storage:restore`.
4. Verify:
   - row counts per table match the export log
   - the ledger balances to zero overall and no account is below zero (`ledger_balances`)
   - append-only tables still refuse UPDATE and DELETE
   - the privilege snapshot matches the reviewed target
   - signed URLs work from the restored private buckets
   - one synthetic buyer, seller and admin sign in with TOTP
5. Time each step and record it in docs/RECOVERY_DRILL.md. Delete the temporary project, which holds copies of real accounts.
6. Code rollback drill on staging: deploy the previous build and back (section 8).

Approval needed: the production export (step 2) and creating the temporary project (step 3, may cost money).

## 4. SEO and GA4 baseline

Before launch, recorded so the launch can be compared:

- Search Console (B-14): verify `sellonbay.com` (Domain property, DNS TXT added by the owner), then export the last 3 months of pages,
  queries, clicks, impressions and position, plus the indexing report. Keep the export outside the repository.
- Crawl: run a crawler on the current live site and save every URL with its status, canonical, title, description and robots. Compare it
  with `lib/seo/sitemapPlan.ts` (25 addresses when complete) and `publicationGate`. Every old address that had traffic gets a 301 (Admin
  → SEO → Redirects) or a deliberate 410 (`lib/legacy.ts`).
- Checks before switching: `npm run build` sitemap, robots.txt on the live host (not staging's `Disallow: /`), one h1 per page, the
  product structured data without `offers.price` (O-11), and noindex kept on legal pages, FAQ, How it works and Sell.
- GA4 (B-5): create a separate GA4 test property. Set `NEXT_PUBLIC_GA_ID` on a test server only, check DebugView and Realtime with
  consent given and refused (no hit when refused, none with GPC or DNT), then the production property. Staging keeps `NEXT_PUBLIC_GA_ID=off`
  (`lib/stage.ts` refuses anything else). The privacy page text for GA4 and first-party country analytics waits for the lawyer (B-12).
- After launch: compare Search Console clicks and indexed pages weekly for 8 weeks against the baseline. A drop over 20% on a page
  group is investigated.

Owner provides: Search Console access, DNS TXT record, GA4 test and production property ids, the date of the baseline.

## 5. Payment provider eligibility (D1, B-1)

Ask each candidate in writing, before any integration:

- [ ] Marketplace model allowed: we take payment, hold it until acceptance (48 hours plus 7 days), and pay many sellers in many countries.
- [ ] Who is the merchant of record. Who carries chargebacks and refunds. Is a reserve or rolling hold required.
- [ ] Is holding funds before a seller payout legal in the provider's model without our own e-money licence. Get a lawyer's view (escrow
  wording).
- [ ] Our entity: country of incorporation needed (Stripe Connect needs a supported country, for example a US LLC). Bangladesh bank and
  payout support for sellers.
- [ ] Payouts: countries, currencies, payout methods (bank, PayPal), fees, minimums, timing; KYC of sellers by the provider (D4) or by us.
- [ ] Digital goods and source code: allowed category. Restrictions on AI-generated products, templates, scripts.
- [ ] Webhooks: signed, retried, idempotency keys, test (sandbox) mode with test cards. Refund and dispute events.
- [ ] Fees: per transaction, cross-border, currency conversion, payouts, disputes.
- [ ] Data: PCI scope (hosted checkout preferred, so no card data reaches us), DPA, data residency.
- [ ] Written answer saved (date, contact) for Paddle, Lemon Squeezy, Dodo, Stripe Connect, PayPal (the PayPal adapter exists but is untested
  against real sandbox).

Until D1 is decided: payments stay manual (bank transfer or wallet, reconciled by Finance); test cards fund only example orders; no real
provider keys on staging.

## 6. Legal and retention approval

For the lawyer, all texts tagged [LAWYER REVIEW]:

- [ ] Terms of service (`app/(site)/terms`, docs/legal/terms-of-service.md)
- [ ] Privacy policy (`app/(site)/privacy`, docs/legal/privacy-policy.md): Tawk.to, GA4 (B-5), first-party country (B-12), hashed
  device and connection data, cookies
- [ ] Seller agreement (`app/(site)/seller-agreement`): licences and model or property releases, store-rejection risk for apps, chargeback
  liability, reserve, dispute fees, fake accounts
- [ ] Escrow wording: "held until accepted", payout 7 days after acceptance, refunds rule (no "no refunds ever"), 7-day bug-fix guarantee
- [ ] Acceptable use policy and DMCA or copyright notice-and-takedown flow (not written yet)
- [ ] Consumer law for EU and UK buyers (digital content, withdrawal right waiver at release)

Retention (owner and lawyer set the periods; today's code):

| Data | Kept | Where set |
| --- | --- | --- |
| Hashed connection and device events | 90 days | `CONFIG.limits.keepDays` |
| Visitor analytics rows | 90 days | `CONFIG.analytics.keepDays` |
| Rejected or failed files | 7 days, then deleted | `CONFIG.files.rejectedKeepDays` |
| Sales PDF exports | 24 hours | `CONFIG.reports.pdfKeepHours` |
| Orders, order events, ledger, audit log, download events, consents, certificates | Not deleted by the app (append-only, evidence and accounting) | migrations |
| Chat and tickets | Not deleted by the app | migrations |
| Account deletion | On request, through Admin → Privacy; financial records kept | `/account/privacy` |

- [ ] The lawyer confirms how long accounting and tax records must be kept (country of the entity), how long evidence may be kept, and
  what is anonymised on account deletion.

## 7. Launch-blocker register

| Id | Blocker | Status | Owner action |
| --- | --- | --- | --- |
| B-1 / D1 | Payment provider for marketplace payouts | OPEN | Choose after written answers (section 5) |
| B-3 | Malware scanner for 500 MB ZIPs | OPEN; recommended AWS GuardDuty for S3 (docs/SCANNER_EVALUATION.md) | Approve the provider, open the account, choose the region, sign the DPA |
| B-5 | GA4 never checked against Google | OPEN | Give a GA4 test property |
| B-6, B-7 | Social sign-in providers | OFF; account-linking tests S1 to S4, S7 and S12 to S14 waiting | Provider keys and approval of the linking setting |
| B-9, B-10 | Advertising platform access and terms | OFF; P22 migration proposed only | Written platform access, counsel review |
| B-11 | Super Admin review record for versions | OPEN | Name the reviewers |
| B-12 | Privacy text for analytics (GA4, first-party country) | OPEN | Lawyer |
| B-13 | Production inspection, backup and restore | OPEN (sections 1 to 3) | Approve the read-only steps |
| B-14 | Search Console baseline | OPEN (section 4) | Access and DNS TXT |
| B-2, B-4, B-8, B-15 | Defined in the owner's plan; not referenced in code | Check against the plan | Confirm current status |
| D3 | Domain registrar | OPEN (demo only; 503 in production) | Choose NameSilo or Namecheap |
| D4 | KYC for sellers | OPEN | Decide with D1 |
| D5 | Deployment automation | Manual or blue-green scripts ready, never run | Choose the host (VPS or Hostinger Node) |
| — | Email provider | Not configured (sends fail quietly) | Choose a provider and add its domain records |
| — | Turnstile keys (staging and live) | Not set; production fails closed, the presale API refuses every question | Add the Cloudflare Turnstile site |
| — | Staging behind Cloudflare Access | BLOCKED (deploy/cloudflare-access-staging.md) | Written yes for the one CNAME, then sign in once |
| — | Production privilege drift | Documented, not fixed (section 2) | Approve the read-only snapshot |
| — | Lawyer review of all legal texts | OPEN (section 6) | Engage the lawyer |
| — | Test cards and demo controls | Still in code | Remove before the market opens |

## 8. Production deployment and rollback approval package

Sign off each line before the first production deployment of 2.0:

- [ ] Commit to deploy: _______ (a local commit, pushed to GitHub only with the owner's yes). CI green: typecheck, lint, format, unit
  tests, migration checks, build.
- [ ] Staging evidence: strict RLS 14/14, staging journey 8/8, browser suite with the staging server, delivery chain on staging
  (needs B-3), privilege snapshot reviewed.
- [ ] Migrations: the reconciled list from section 1, applied BEFORE the code (every file only adds; `check:migration-safety` green).
- [ ] Backup taken and restore-verified (section 3) within 24 hours before the migration.
- [ ] Environment on the host (names only; `/dashboard/admin/launch` shows which are set):
  - Supabase URL, anon key and service key for production
  - `PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET`, `DELIVERY_SECRET`, `GUARD_SALT`, `ANALYTICS_SALT`
  - Turnstile keys and `NEXT_PUBLIC_SITE_URL=https://sellonbay.com`
  - `NEXT_PUBLIC_GA_ID` as approved
  - `CLIENT_IP_HEADER=cf-connecting-ip` if every request comes through Cloudflare, otherwise `TRUSTED_PROXY_HOPS` = the number of proxies
    (without one of them a visitor can write their own address and slip past the rate limits; `/dashboard/admin/launch` flags it)
  - NOT set: `SITE_STAGE`, `EXAMPLE_ORDERS`, `LAUNCHBAY_DEMO`, `SCAN_PROVIDER=test`
- [ ] Deploy: one instance (pull, `npm ci`, `npm run build`, restart) or blue-green (`deploy/blue-green.sh deploy`), docs/DEPLOYMENT.md
  section 5.
- [ ] Smoke checks within 15 minutes:
  - `/api/health`, the home page and the five categories
  - sign in as a synthetic buyer, seller and admin with TOTP
  - the session cookie: in the browser's developer tools every `sb-<ref>-auth-token` cookie shows Secure, SameSite Lax, path `/`
    (lib/supabase/cookieOptions.ts). It is not HttpOnly on purpose (the browser client reads it). A cookie set before this release keeps
    its old flags until the session refreshes (within the hour the access token lasts) or the person signs in again
  - robots.txt and sitemap are the live ones
  - no noindex on public pages
  - maintenance off
  - a request runs to a quotation
  - the error webhook is quiet
- [ ] Rollback triggers: health failing for 2 minutes, error rate above normal, a payment or ledger error, a security finding.
- [ ] Rollback: code first (`deploy/blue-green.sh rollback` or the previous build). The database is never rolled back: fix forward. Restore
  from backup only with the owner (it loses data since the backup). A single misbehaving module is closed in the Maintenance Manager.
- [ ] Approvals: owner (go or no-go), Super Admin on duty, Finance for the payment path, the person who runs the rollback.
