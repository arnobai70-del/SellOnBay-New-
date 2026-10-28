# SellOnBay 2.0 implementation status

Read this first when resuming. Plan: `SellOnBay-2.0-Technical-Blueprint-v1.3.md` section 13 (phases), `SellOnBay-2.0-Owner-Decision-Closure-Addendum.md`
(decisions O-1 to O-13, migration placeholders P01 to P23, blockers B-1 to B-15, acceptance criteria section 6), the owner's Full Implementation
Master Instructions, and the owner's 24/7/365 decision (release target 12 consecutive hours, UTC, never an automatic release). The Addendum wins
over the Blueprint; the owner's latest words win over both.

Branch `feat/sellonbay-2.0`. Local commits per phase are allowed. NOT allowed without the owner's separate written approval: push, applying any
migration to any database, production access, deployment, provider credentials, real payments.

Migrations 0055 onwards are provisional numbers (the Addendum's placeholders, in its order). None is applied anywhere. `npm run check:migrations`
runs them all in an in-process Postgres.

## Status by phase

Labels: DONE (built, unit tests pass, local only), PARTIAL, MISSING, BLOCKED (needs a provider, legal or owner action). Nothing is VERIFIED on
staging yet: there is no staging project.

| #   | Phase                            | State                                                                                                       | Commits                              | Migrations                            | Remaining                                                                                         | Blockers                        |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------- |
| 0   | Baseline                         | PARTIAL                                                                                                     | 9825ae2 (lock file)                  | –                                     | Production inspection (Appendix A), backup and restore, SEO crawl, Search Console export, staging | B-13, B-14                      |
| 1   | Foundation                       | DONE, GA4 check BLOCKED                                                                                     | a093148, dd0d2cf + Phase 1 remainder | 0055, 0063                            | GA4 DebugView/Realtime check                                                                      | GA4 test property               |
| 2   | Seller plans                     | DONE                                                                                                        | fa3a183                              | 0056, 0057                            | Check featured placement on the storefront (Phase 12)                                             | B-1 for paid plans              |
| 3   | Secure files                     | DONE, scanner BLOCKED                                                                                       | 1e1c4ac                              | 0058                                  | Real scanner adapter                                                                              | B-3                             |
| 4   | Requests and quotations          | DONE                                                                                                        | 2715e58                              | 0059                                  | –                                                                                                 | –                               |
| 5   | Payments                         | DONE, real methods BLOCKED                                                                                  | 5d2d6a4                              | 0060                                  | –                                                                                                 | B-1                             |
| 6   | Release                          | DONE                                                                                                        | 920d08d                              | 0061                                  | –                                                                                                 | –                               |
| 7   | Messaging and support            | DONE                                                                                                        | a5d1682 + Phase 7 closure            | 0062                                  | –                                                                                                 | –                               |
| 8   | Revisions and custom development | DONE                                                                                                        | Phase 8 commit                       | 0064                                  | Browser checks on staging                                                                         | –                               |
| 9   | Reports and country analytics    | DONE (sales PDF, receipts); GA4 and first-party country BLOCKED                                             | Phase 9 commit                       | 0065                                  | GA4 reader never run against Google; first-party switch-on and privacy text                       | B-5, B-12                       |
| 10  | Social login                     | Extra layers DONE; every provider BLOCKED (off)                                                             | Phase 10 commit                      | 0066                                  | S1-S4, S7, S12-S14 on staging; Supabase automatic-linking setting confirmed per provider          | B-6, B-7                        |
| 11  | Advertising                      | Review flow, guardrails, sealed-token helper DONE (memory only); platform adapters and table BLOCKED        | Phase 11 commit                      | P22 proposed only (supabase/proposed) | Adapters after written access; the P22 migration after B-9                                        | B-9, B-10                       |
| 12  | Storefront, dashboards, CMS      | DONE except the visual redesign (proposal only, waits for owner approval)                                   | 0f149d8 + Phase 12 CMS commit        | –                                     | Redesign items in docs/DESIGN_PROPOSAL_2_0.md                                                     | Owner design sign-off           |
| 13  | Hardening                        | LOCAL testing DONE (results below); staging, RLS on a real database, rollback drill, real providers BLOCKED | Phase 13 commit                      | –                                     | Staging run, reconciliation, Search Console comparison, lawyer-reviewed texts                     | B-11, B-12, B-13, B-14, staging |

## Phase 13 local test results (2026-10-28)

All runs are local, demo mode, no database and no external service (`.env.local` does not exist; `LAUNCHBAY_DEMO=1`). Nothing below
is staging or production evidence.

| Check                                                                           | Result                                                                                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci` clean install                                                          | PASS                                                                                                                                       |
| Production build (normal, and legacy-public for older browser specs)            | PASS                                                                                                                                       |
| TypeScript                                                                      | PASS (0 errors)                                                                                                                            |
| ESLint                                                                          | PASS (0 errors; 34 warnings, all older than 2.0)                                                                                           |
| Prettier on changed files                                                       | PASS (10 older files outside 2.0 were already unformatted)                                                                                 |
| Unit and in-process integration tests (Vitest)                                  | PASS 956/956 when run alone. Run at the same time as the browser suite, 2 timing tests (money-edge-cases, risk) failed and passed on rerun |
| Migration checks in in-process Postgres (0001-0066) and migration safety        | PASS                                                                                                                                       |
| `npm audit`                                                                     | PASS (0 vulnerabilities)                                                                                                                   |
| Accessibility (axe WCAG 2.1 A/AA, keyboard, focus, labels, 360/390/768/1280 px) | PASS 26/26 after fixes                                                                                                                     |
| Full Playwright suite                                                           | 106 PASS, 4 FAIL, 11 BLOCKED, 38 RETIRED, 36 SKIP                                                                                          |

Browser suite details:

- FAIL `seo.spec.ts` (2): an admin edit page for an unknown address shows the 404 page with status 200, because
  `app/(dash)/dashboard/loading.tsx` (older than 2.0) makes dashboard pages stream before `notFound()`. Admin-only, noindex; not fixed.
- FAIL `guest.spec.ts` (1): the visitor panel's Saved list stays empty in the legacy build. Older than 2.0 (the `/guest` page is retired
  on the live structure). Not investigated further.
- FAIL `search.spec.ts` (1): failed in the full run, PASS 2/2 when run alone (the search API allows 90 requests a minute per address; the
  full run uses one address). Flaky, not a code fault.
- BLOCKED (11): need the real server on port 3000 with a Supabase project; no approved isolated test project exists.
- RETIRED (38, tests/e2e/retired.ts): 35 depend on instant checkout, which 2.0 closed on purpose (not reopened); 3 test digital-product
  listings, which new listings no longer offer. The 2.0 purchase chain is tested in process instead.
- SKIP (36): already skipped before 2.0 (RLS and real-buy specs need a database; feature-dependent cases).

Fixed during Phase 13: product structured data no longer carries `offers.price` (O-11: prices come from quotations); colour contrast of
small text on light mint (dashboard queues and deltas) and of four small mint pills (home "why us" picture, compare table); outdated
browser specs (cookie notice wording, privacy text, list-price check that read prices inside drawn app previews, plan commission copy).

Not run (BLOCKED): RLS and authorisation against a real database (needs an approved isolated test project), social sign-in S1-S4, S7,
S12-S14 (needs provider test apps, B-6/B-7), GA4 DebugView/Realtime (needs a GA4 test property; the unit tests in ga4.test.ts cover
consent gating and single loading), Search Console comparison (B-14), real payment, scanner, registrar, email and ad providers.

## Dependency security (2026-10-28)

| Package              | Before  | After   | Why                                                                                                                                                                     |
| -------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| next                 | 16.3.8  | 16.4.2  | GHSA-2464-fhr4-w9xw (RCE, image optimisation with SVG), GHSA-673q-mjm6-r5xr (RCE, `use cache` typed arrays), GHSA-p3m5-59mp-jv5r (DoS, Server Actions); fixed in 16.4.1 |
| eslint-config-next   | 16.4.0  | 16.4.2  | kept in step with next                                                                                                                                                  |
| zod                  | 4.6.5   | 4.6.7   | GHSA-mrhx-c7xc-m3w5 (memory exhaustion); fixed in 4.6.6                                                                                                                 |
| puppeteer-core (dev) | 25.12.0 | 25.14.0 | pulled a vulnerable zod 3 through chromium-bidi; test tool only                                                                                                         |

`npm audit`: 0 vulnerabilities after the update. No `--force`, no major upgrades. React 19.3.0, TypeScript 6.0.3 (pinned), supabase-js 2.117.2
unchanged. Build, typecheck, lint, 949 unit tests and migration checks pass. The live site still runs the old versions until a deployment
is approved.

## Social sign-in tests (Addendum 3.4)

Local unit tests (tests/unit/social-login.test.ts): S5/S6 intent rules, S8 admin cannot link, S9 admin session refused (pages, admin APIs,
participant APIs, callback, scheduled check), S10 role never from the provider (profile trigger reads only full_name; default buyer),
S11 last method kept, S15 Apple only for existing accounts, providers locked off. NOT run (need a staging Supabase with the planned Auth
settings, BLOCKED by B-6/B-7): S1-S4 automatic linking at the Auth level, S7 aal1 after social sign-in, S12 provider email change,
S13 redirect allow-list in Supabase, S14 tokens in URLs or logs.

## Known test gaps

- Data export now includes the 2.0 records (Phase 12). Deletion still only covers the older records; 2.0 records are accounting or evidence records whose retention waits for legal approval (O-12, B-12). The export itself needs Supabase, so it is not covered by unit tests.

- Demo mode cannot create a paid order any more (instant checkout is closed since 2715e58), so older browser specs that buy in demo mode fail
  there. Do not reopen instant checkout. The purchase chain is tested in process (`tests/unit/sob2-chain.test.ts`, `tests/unit/release.test.ts`).
- Anything that needs accounts in a browser (conversations, tickets, requests, payments) needs a staging Supabase: BLOCKED.

## Staging (2026-10-28)

Staging project `occketfmjwciilzuddkv` ("SellOnBay New"); production (`knvxtgzrylvkhyrcezlq`) is not used by any test. Every step is in
docs/STAGING_LOG.md.

| Check                                                                                                                                                                                                    | Result                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Migrations 0001-0068 (CLI, reviewed batches, history recorded once)                                                                                                                                      | PASS: 68 versions, 80 tables, RLS on every table, 6 private buckets                                                      |
| Security fixes found on staging: 0067 (default Supabase grants on products_public, ledger_balances, bump_counter, sequences), 0068 (column grants on notifications, seller_profiles DELETE, anon writes) | Applied to staging only, verified by privilege checks and anonymous REST calls (401)                                     |
| Strict RLS suite (tests/e2e/rls.spec.ts, CI_STAGING_STRICT=1)                                                                                                                                            | PASS 14/14                                                                                                               |
| Production read-only catalogue check (5 objects, no rows)                                                                                                                                                | NOT vulnerable; production privileges differ from the migration files (drift): reconcile before applying 0067/0068 there |
| Staging protection on a local staging build (127.0.0.1:3010): password, X-Robots-Tag, meta noindex, robots `Disallow: /`, empty sitemap, no GA4 or Tawk, no production reference in pages or bundle      | PASS                                                                                                                     |
| Synthetic accounts (10, `@example.test`), TOTP enrolled for sellers and admins (secrets outside the repository)                                                                                          | PASS                                                                                                                     |
| Staging journey (tests/e2e/staging-journey.spec.ts, STAGING_JOURNEY=1), custom development path, real sessions through the app's API                                                                     | PASS 8/8                                                                                                                 |

Journey coverage: request, assignment, written requirements confirmed by the buyer, quotation with Super Admin price approval (Support
refused), acceptance creates one order (accepting twice gives the same order), simulated bank transfer reported by the buyer and reconciled
by Finance (Support refused, a reference is used once), new-buyer safety hold cleared by Finance only, work authorised by Delivery only,
buyer/seller/internal message channels kept apart, contact details blocked (422), tickets visible only to the opener and Support, sales PDFs
(Finance all sales, each seller only their own, nobody else downloads), audit log entries for every sensitive admin step.
BLOCKED by design on staging: release approval, entitlement, signed download and revisions (no file can be approved without a scanner, B-3),
and product purchase requests (need an approved product version, same reason). Cloudflare Tunnel with Access: prepared in
deploy/cloudflare-access-staging.md, needs the owner's approval (account-level changes); no public tunnel was opened.

Defects found and fixed during the staging journey (each with a unit test):

- Finance could not reconcile a payment dated today before 12:00 UTC (18:00 in Bangladesh), and a buyer ahead of UTC could not report a
  payment made today: dates without a time are now accepted once any time zone has reached them (`receivedAtOf`, `latestToday`).
- A seller could learn that another seller's order was on a safety hold (409 instead of 404): the hold is checked after the owner check.
- An order on a safety hold could be authorised (delivery timer started, seller told to start) and released: both are refused until
  Finance clears the hold.

Final regression after the fixes (2026-10-28, local, demo servers on 3005 normal and 3002 legacy):

| Check                                           | Result                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| typecheck, lint, format:check, unit tests       | PASS                                                     |
| check:migrations, check:migration-safety        | PASS                                                     |
| Normal build, legacy build                      | PASS                                                     |
| RLS and authorisation on staging (strict suite) | PASS 14/14                                               |
| API integration on staging (staging journey)    | PASS 8/8                                                 |
| Staging noindex, password, robots, sitemap      | PASS                                                     |
| Full Playwright suite                           | 104 PASS, 6 FAIL, 11 BLOCKED, 82 SKIP (retired included) |
| Accessibility (a11y.spec.ts, part of the suite) | PASS                                                     |

Browser FAILs, all older than this work: `seo.spec.ts` 2 and `guest.spec.ts` 1 (as in Phase 13); `maintenance.spec.ts` 3 (closing a
module answers 503 from the API handlers, but pages behind `proxy.ts` still answer 200 in demo mode). The maintenance cases fail the same
way on a fresh build of f03147f, so they are not caused by the staging changes; not fixed yet. `search.spec.ts` passed this time. BLOCKED
11: need the real server on port 3000.

## Log

- 2026-10-28: final regression (table above; browser 104 PASS, 6 FAIL older than this work, 11 BLOCKED). Staging 0067 and 0068 applied and verified; RLS 14/14; production read-only check (not vulnerable, drift noted); local staging server and staging journey 8/8; three defects fixed (dates without a time, hold revealed to other sellers, work authorised while on hold). See the staging section and docs/STAGING_LOG.md.

- 2026-10-28: staging 0001-0066 applied and verified (CLI after history repair). SECURITY: default Supabase grants open products_public (writes), ledger_balances (reads) and bump_counter to anon; fix 0067 written, tested locally, waiting for approval for staging and for a production check. See docs/STAGING_LOG.md.

- 2026-10-28: staging 0001-0014 applied (MCP); 0015 declined twice by the MCP tool, nothing applied; switched to Supabase CLI 2.121.0; history backed up and verified; runner scripts/staging-migrate.mjs; waiting for staging credentials. See docs/STAGING_LOG.md.

- 2026-10-28: staging preparation: lib/stage.ts (password, X-Robots-Tag, robots and sitemap, noindex, fail closed), staging guard pinned to
  occketfmjwciilzuddkv, deploy/staging.env.example, scripts/staging-fixtures.mjs (dry run only), docs/STAGING_PREFLIGHT_2_0.md.

- 2026-10-28: Phase 13 local testing (results above); @axe-core/playwright 4.13.0 (dev) and tests/e2e/a11y.spec.ts; O-11 offer markup removed; contrast fixes; retired-test list.

- 2026-10-28: Phase 12 finished apart from the redesign: Admin > Content (FAQ, How it works, 55 notification emails) with draft, preview, four-eyes publish (emails by Super Admin), history and rollback; built-in FAQ and How it works rewritten for the 2.0 flow (they promised files on payment and one-click domains); data export covers 2.0 records; buyer and seller menus link Sign-in methods and Your data; docs/DESIGN_PROPOSAL_2_0.md.

- 2026-10-28: local environment restored (stopped this project's own obsolete demo server, PIDs 6080 and 17464 on port 3002; `npm ci`). Security updates above.

- 2026-10-27: Phase 12 (part): admin overview work queues with oldest age and past-target counts, scoped per permission; social media links in the CMS (history and rollback); public pages, Terms and Seller agreement now state the plan commission (15/10/5%) instead of the old flat fees, which stay for older orders; listing form preview uses the seller's plan.
- 2026-10-27: Phase 11: seller Promote page and Catalog review queue, budget and text guardrails (lib/config.ts ads), AES-256-GCM sealed tokens, adapter interface with no implementation, P22 table kept as a proposal outside the migration chain (Addendum 2.3). Both ad flags locked; no ad API is called anywhere (tested).
- 2026-10-27: Phase 10: link intents and link log (0066), callback guard (switched-off providers, new Apple accounts, links without intent, unlinked identities), admin sessions with any social identity refused everywhere plus a scheduled check, sign-in buttons need SellOnBay's flag as well as Supabase, Apple only as a secondary link, Account > Sign-in methods. All providers stay off.
- 2026-10-27: Phase 9: sales PDFs (Finance/Super all, seller own, buyer receipt), 1,000 rows per file, private 24-hour files, kept export log, purge in cron; GA4 Data API reader (unverified, flag locked, B-5) and first-party country (flag locked, B-12, trusted proxy header only), shown apart and never added. Privacy page text for both waits for B-12.
- 2026-10-27: Phase 8: revision policies (seller proposes, Catalog approves, default in quotations), revisions (defect / included / paid / feature, own release step, follow-up on "not done"), paid changes as linked custom requests, custom-dev developer assigned before quoting; see docs/DECISIONS.md. Fixed: AdminForm textareas cut long requirement sets and legal texts at 600 characters.
- 2026-10-27: Phase 1 remainder: CMS history with rollback (P04) and versioned legal documents (P05) in 0063; quotations snapshot the published licence version; 2.0 routes already sit in the maintenance module map (tested).
- 2026-10-27: Phase 7 closed: ticket subjects follow the message rules; chain test covering release and messaging boundaries.
