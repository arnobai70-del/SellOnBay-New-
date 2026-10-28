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

| #   | Phase                            | State                                                                                                       | Commits                              | Migrations                            | Remaining                                                                                                                                             | Blockers                        |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 0   | Baseline                         | PARTIAL                                                                                                     | 9825ae2 (lock file)                  | –                                     | Production inspection (Appendix A; probe and report ready: docs/PRODUCTION_RECONCILIATION.md), backup and restore, SEO crawl, Search Console export   | B-13, B-14                      |
| 1   | Foundation                       | DONE, GA4 check BLOCKED                                                                                     | a093148, dd0d2cf + Phase 1 remainder | 0055, 0063                            | GA4 DebugView/Realtime check                                                                                                                          | GA4 test property               |
| 2   | Seller plans                     | DONE                                                                                                        | fa3a183                              | 0056, 0057                            | Check featured placement on the storefront (Phase 12)                                                                                                 | B-1 for paid plans              |
| 3   | Secure files                     | DONE; malware scanning REMOVED BY OWNER — SECURITY RISK ACCEPTED                                            | 1e1c4ac                              | 0058                                  | Admin sandbox review is the only check of what the code does (risks below)                                                                            | –                               |
| 4   | Requests and quotations          | DONE                                                                                                        | 2715e58                              | 0059                                  | –                                                                                                                                                     | –                               |
| 5   | Payments                         | DONE, real methods BLOCKED                                                                                  | 5d2d6a4                              | 0060                                  | –                                                                                                                                                     | B-1                             |
| 6   | Release                          | DONE                                                                                                        | 920d08d                              | 0061                                  | –                                                                                                                                                     | –                               |
| 7   | Messaging and support            | DONE                                                                                                        | a5d1682 + Phase 7 closure            | 0062                                  | –                                                                                                                                                     | –                               |
| 8   | Revisions and custom development | DONE                                                                                                        | Phase 8 commit                       | 0064                                  | Browser checks on staging                                                                                                                             | –                               |
| 9   | Reports and country analytics    | DONE (sales PDF, receipts); GA4 and first-party country BLOCKED                                             | Phase 9 commit                       | 0065                                  | GA4 reader never run against Google; first-party switch-on and privacy text                                                                           | B-5, B-12                       |
| 10  | Social login                     | Extra layers DONE; every provider BLOCKED (off)                                                             | Phase 10 commit                      | 0066                                  | S1-S4, S7, S12-S14 on staging; Supabase automatic-linking setting confirmed per provider                                                              | B-6, B-7                        |
| 11  | Advertising                      | Review flow, guardrails, sealed-token helper DONE (memory only); platform adapters and table BLOCKED        | Phase 11 commit                      | P22 proposed only (supabase/proposed) | Adapters after written access; the P22 migration after B-9                                                                                            | B-9, B-10                       |
| 12  | Storefront, dashboards, CMS      | DONE except the visual redesign (proposal only, waits for owner approval)                                   | 0f149d8 + Phase 12 CMS commit        | –                                     | Redesign items in docs/DESIGN_PROPOSAL_2_0.md                                                                                                         | Owner design sign-off           |
| 13  | Hardening                        | LOCAL testing DONE (results below); staging, RLS on a real database, rollback drill, real providers BLOCKED | Phase 13 commit                      | –                                     | Read-only production probe and snapshot, scratch-restore rehearsal, Search Console comparison, lawyer-reviewed texts, staging acceptance (list below) | B-11, B-12, B-13, B-14, staging |

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

Final regression after the browser fixes (2026-10-28, local; demo servers 3005 normal and 3002 legacy; `REAL_URL` = the local staging
server on 3010, password-protected, staging Supabase, signed-out checks only):

| Check                                           | Result                                                       |
| ----------------------------------------------- | ------------------------------------------------------------ |
| typecheck, lint (0 errors), format:check        | PASS                                                         |
| Unit tests                                      | PASS 973/973                                                 |
| check:migrations, check:migration-safety        | PASS                                                         |
| Normal, legacy and staging builds               | PASS                                                         |
| RLS and authorisation on staging (strict suite) | PASS 14/14 (run earlier the same day, nothing in it changed) |
| API integration on staging (staging journey)    | PASS 8/8 (in the full run)                                   |
| Staging noindex, password, robots, sitemap      | PASS (rechecked on the rebuilt staging server)               |
| Full Playwright suite                           | 143 PASS, 0 FAIL, 60 SKIP (38 retired, 22 need `.env.local`) |
| Accessibility (a11y.spec.ts, part of the suite) | PASS                                                         |

The six browser failures, fixed (each with a regression test):

- Maintenance (3): a closed module's pages answered 200. proxy.ts rewrote to `/maintenance/<module>` with `status: 503`, but Next 16
  renders a rewritten page with 200. The proxy now answers the notice itself (`maintenancePageResponse`, lib/maintenance/guard.ts): a
  real 503 with Retry-After and noindex, every text escaped. The APIs already answered 503. Test: tests/unit/maintenance-guard.test.ts.
- SEO (2): an unknown address on an admin editor showed the 404 page with status 200, because `dashboard/loading.tsx` starts the
  response before `notFound()`. The eight dashboard pages that can be a 404 moved to `app/(dash)/(exact)/dashboard` (same addresses,
  same error screen, outside the loading screen). Test: tests/unit/notfound-boundary.test.ts (fails if a notFound page is under a
  loading screen).
- Guest (1): the visitor panel showed an empty Saved list. `lib/saved.ts` kept the first list it read for the life of the page, so a
  save written by anything other than its own `toggleSaved` (another script, a sign-in copy, client navigation after a direct write)
  never showed. Every read now compares the stored text. Junk in storage reads as empty, and private mode keeps the list in memory.
  Test: tests/unit/saved-store.test.ts.

The 11 tests BLOCKED before (admin 3, chat 1, guard 6, privacy 1) need a server with accounts. They now run against the staging server
(Playwright sends the staging password to that origin only) and PASS. Still SKIPPED, not counted as passed: 38 retired tests (35 instant
checkout, closed on purpose and not reopened; 3 digital-product listings), and 22 specs (buy-real, extras, listing, orders, presale) that
read Supabase keys from a `.env.local`, which is not used, because the staging keys stay outside the repository.

## Launch blocker resolution (2026-10-28)

Authenticated staging tests: the five specs that read Supabase keys from `.env.local` now use `tests/e2e/realEnv.ts`, which takes the
isolated staging keys from the process environment (kept outside the repository), refuses the production project outright, and sends
the staging password only to a server that asks for it. Of the 22:

| Spec         | Result                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| listing (8)  | 8 PASS                                                                                                                                                                                                          |
| orders (2)   | 2 PASS (rewritten: synthetic order rows; tests `order_apply` and `ledger_post` directly, because instant checkout stays closed)                                                                                 |
| extras (5)   | 3 PASS; 2 retired (the public digital shelf is retired on the live structure; new listings are websites only)                                                                                                   |
| buy-real (4) | 1 PASS (rewritten for 2.0: the old checkout answers 410 for everyone; a visitor gets 401 and a seller 403 on `/api/requests`); 2 retired (card payment through instant checkout); 1 BLOCKED (real provider, D1) |
| presale (3)  | BLOCKED: a production build refuses the Turnstile test keys on purpose, so staging needs its own Turnstile keys                                                                                                 |

Total: 14 PASS, 4 newly retired (each listed in tests/e2e/retired.ts with its reason), 4 BLOCKED. The 38 earlier retired tests stay
retired; instant checkout was not reopened. Fixed in the tests: the login helper clicked the header search button (two submit buttons
on the page), the MFA step clicked the wrong form, and a listing written straight to the database shows after the 60-second catalogue
cache (`CONFIG.catalogCacheSeconds`); admin approval clears that cache at once, so this is not a product defect.

Final regression (this round; no app code changed since b3ffaa4, only tests, the test fixture and docs):

| Check                                                                  | Result                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| typecheck, lint (0 errors), format:check                               | PASS                                                                                                                        |
| Unit tests                                                             | PASS 975/975 (new: tests/unit/delivery-chain.test.ts)                                                                       |
| check:migrations, check:migration-safety                               | PASS                                                                                                                        |
| Strict RLS on staging                                                  | PASS 14/14                                                                                                                  |
| Full browser suite (demo 3005 and 3002, staging 3010, staging journey) | 156 PASS, 1 FAIL, 46 SKIP (42 retired, 4 BLOCKED)                                                                           |
| search.spec.ts (the 1 FAIL)                                            | PASS 2/2 when run alone, twice; in the full run it hits the 90-a-minute search limit for one address (known since Phase 13) |
| Synthetic users left on staging                                        | 0                                                                                                                           |

Prepared, not run against production: docs/SCANNER_EVALUATION.md (comparison and monthly costs; recommendation AWS GuardDuty for S3),
docs/DELIVERY_TEST_PLAN.md (in-process chain done with the scanner test double; staging run waits for B-3), docs/LAUNCH_READINESS.md
(migration-history reconciliation, privilege drift with `scripts/privilege-snapshot.sql` and the staging baseline, backup and restore,
SEO and GA4 baseline, payment eligibility, legal and retention, blocker register, deployment and rollback package), and the exact
Cloudflare Access proposal in deploy/cloudflare-access-staging.md. Cloudflare: done later the same day with the staging gate instead of Access (see the log).

## Session cookie and staging gate audit (2026-10-28)

Local source only. Production was not opened, nothing was pushed or deployed, and the staging tunnel, URL and gate configuration are as
they were (no staging process was running; the changes reach staging at its next restart).

Session cookie. Cause of the missing Secure flag in production: `@supabase/ssr` 0.12.7 writes its cookies with its own defaults (path `/`,
SameSite Lax, not HttpOnly, 400 days, no Secure), and none of our three clients (proxy.ts, lib/supabase/server.ts, lib/supabase/client.ts)
passed `cookieOptions`. Staging only looked right because `deploy/staging-gate.mjs` adds Secure to every cookie on its way out.

| Flag     | Before (production)                               | After                                                                        | Why                                                                                                                                                             |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secure   | missing                                           | on for a production build whose site address is https; development unchanged | `lib/supabase/cookieOptions.ts`, passed by all three clients; a production build was checked: the browser bundle has the value inlined                          |
| SameSite | Lax (library default)                             | Lax, now set by us                                                           | Strict would drop the cookie on the way back from Google sign-in and email links; Lax plus `lib/sameOrigin.ts` covers cross-site writes                         |
| HttpOnly | off                                               | off (unchanged, on purpose)                                                  | the browser client reads the session (chat, authenticator code, uploads, reset); the CSP carries that risk, and its `'unsafe-inline'` scripts weaken it (known) |
| HTTPS    | HSTS 2 years with preload                         | unchanged                                                                    | next.config.ts; the launch check now marks an `http://` NEXT_PUBLIC_SITE_URL as to-do (before, it passed any value in production)                               |
| Session  | access token about 1 hour, refreshed by the proxy | unchanged                                                                    | cookies set before the release keep their old flags until the next refresh or sign-in                                                                           |

Staging gate review (deploy/staging-gate.mjs, lib/stage.ts):

| Finding                                                                                                                                                                                                                                                                                                                                                        | Severity | State                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| The gate passed the visitor's own `X-Forwarded-For`, `X-Forwarded-Host` and `Host` to the app. Staging does not set `CLIENT_IP_HEADER`, so the app's rate limits read the first X-Forwarded-For value, which anyone with the password could write                                                                                                              | Medium   | FIXED: the gate overwrites them with the address Cloudflare saw and the fixed staging host (`forwardHeaders`) |
| Lock-out per single address: an IPv6 visitor can rotate through their /64                                                                                                                                                                                                                                                                                      | Low      | FIXED: IPv6 addresses are locked per /64 (`addressKey`)                                                       |
| The lock-out table only dropped expired entries, so many addresses at once could grow it without limit                                                                                                                                                                                                                                                         | Low      | FIXED: it never passes 10,000 entries and keeps the ones that are locked out                                  |
| The app read the Basic password as Latin-1, the gate as UTF-8: a non-ASCII password passed the gate and failed in the app                                                                                                                                                                                                                                      | Low      | FIXED in lib/stage.ts                                                                                         |
| `STAGING_BASIC_AUTH`, `PAYPAL_CLIENT_SECRET` and `ANALYTICS_SALT` were not in the client-bundle leak check                                                                                                                                                                                                                                                     | Low      | FIXED in scripts/check-bundle.mjs; checked on a production build: none of the names is in the client bundle   |
| Reviewed, no change: SHA-256 then constant-time comparison; 20+ characters of three kinds; 10 wrong in 15 minutes locks for 15 minutes; http sent to the fixed https origin before any password; loopback-only ports; no websockets; no password in logs or error texts; CF-Connecting-IP trusted only because the gate listens on 127.0.0.1 behind the tunnel | –        | –                                                                                                             |
| HTTP Basic is one shared password, with no per-person sign-in or revocation                                                                                                                                                                                                                                                                                    | Accepted | Cloudflare Access was skipped by the owner; change the password when a tester leaves                          |

Production follow-up (needs the owner's approval, not done): set `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS` on the live server (same
X-Forwarded-For problem as staging, already flagged by the launch check), deploy this commit, then check the cookie flags
(docs/LAUNCH_READINESS.md section 8).

Tests: tests/unit/session-cookie.test.ts (real `@supabase/ssr` server and browser clients: without our options no Secure; with them every
cookie is Secure, SameSite Lax, path `/`; all three clients pass them; the site-address rule) and new cases in tests/unit/staging-gate.test.ts
(forged headers never reach the app, IPv6 /64, bounded table, UTF-8 password in gate and app). typecheck, lint (0 errors) and format:check
PASS. Unit tests PASS 995/995 (an earlier full run had one timing test time out under load; it passes alone, as before).

## Audit round 2 and blocker actions (2026-10-29)

Local only. Production was not opened, no SQL ran there, nothing was pushed or deployed. Phase structure unchanged; this round belongs to
Phase 13 (hardening) and prepares Phase 0 (baseline).

Focused security audit:

| Area                                  | Finding                                                                                                                                                                                                                                                                                         | State                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session cookies                       | Secure, SameSite Lax and path / on every Supabase cookie since e67c49c                                                                                                                                                                                                                          | Verified: tests/unit/session-flows.test.ts runs the real @supabase/ssr and supabase-js code against a stand-in Supabase Auth. Google sign-in (PKCE: the verifier cookie returns to /auth/callback), refresh of an expired token, the authenticator code (aal2 written to document.cookie) and sign-out (removed with the same path and flags) all keep Secure. All four tests fail when Secure is switched off |
| Session tokens readable by JavaScript | The sb-* cookie is not HttpOnly (the browser client needs it); no token in localStorage or sessionStorage (only the cookie choice `lb-cookies`, which also gates GA4, the saved and recently viewed lists, and the background setting `lb-bg`; @supabase/ssr keeps the session in cookies only) | Accepted by design; the protection is having no injection points (next row)                                                                                                                                                                                                                                                                                                                                    |
| XSS                                   | No HTML injection points: one raw `<script>` (JsonLd, `<` escaped, fenced by tests/unit/secrets.test.ts). Every user-supplied link is https or our own path: Markdown (`safeHref`), site builder, listings (`isHttps` on the server), footer social links (host allow-list)                     | No change                                                                                                                                                                                                                                                                                                                                                                                                      |
| CSP                                   | `'unsafe-inline'` scripts, and the whole `cdn.jsdelivr.net` host is allowed (it serves any npm package, so the list is easy to get round). Nothing in our code loads from it; it dates from the first Hostinger import (probably Tawk's emoji)                                                  | Recorded, not changed (with inline scripts allowed, removing it gains little and could break chat). The fix is per-request nonces, then drop `'unsafe-inline'` and jsdelivr together                                                                                                                                                                                                                           |
| Trusted proxy                         | `publicOrigin` built redirect addresses (sign-in, OAuth callback, moved pages) from `Host` / `X-Forwarded-Host` whenever the name looked public, so a forged header could point a redirect at another site where the host's proxy passes it on                                                  | FIXED: on a production build only the site's own name, its www twin or localhost is used, and public names are always https. Development (quick tunnels) is unchanged. tests/unit/public-origin.test.ts                                                                                                                                                                                                        |
| Client address                        | Rate limits read the first X-Forwarded-For value unless `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS` is set (the launch check flags it)                                                                                                                                                           | Production setting, owner action (see below); staging fixed in the gate (e67c49c)                                                                                                                                                                                                                                                                                                                              |

GuardDuty for S3, rechecked against AWS's own pages (docs/SCANNER_EVALUATION.md): objects up to 100 GB, 100,000 extracted files and 100
nesting levels (none adjustable), 25 protected buckets per region, and an extracted-byte limit and a compression-ratio limit with no
published number. Our limits (500 MB, 50,000 entries, 4 GB unpacked, ratio 200) are inside the published ones, so there are no new
upload limits; the earlier advice to drop to 10,000 entries is withdrawn. Every UNSUPPORTED or ACCESS_DENIED reason stays `error`. Price
$0.09 per GB in us-east-1, with a free tier of 1 GB and 1,000 requests a month.

Production reconciliation: docs/PRODUCTION_RECONCILIATION.md, plus `scripts/migration-probe.mjs` (468 SELECT-only checks; 61 of 68
migrations provable by objects and md5 fingerprints of function bodies and check constraints; the other 7 by the privilege snapshot).
Tested in the in-process Postgres: complete when all 68 are applied, exact split when 0001 to 0040 are applied, partial when a function is
changed by hand. Finding: 0067 and 0068 only take privileges away and nothing the live code uses, so they can be applied as written; the
production drift file is narrowed to what they do not touch.

Exact remaining actions:

| Blocker                          | Who                  | Action                                                                                                                                                                                                                                                                        |
| -------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment eligibility (B-1/D1)     | Owner                | Send the docs/LAUNCH_READINESS.md section 5 questions to Stripe (Connect), PayPal (marketplace and payouts), Paddle, Lemon Squeezy and Dodo; save each written answer with its date. Decide the legal entity (Stripe Connect needs a supported country). Choose one provider. |
| Payment eligibility              | Lawyer               | Opinion on holding buyer money until acceptance plus 7 days without an e-money licence, and on the escrow wording                                                                                                                                                             |
| Payment eligibility              | Us, after the choice | PayPal: sandbox run of checkout, webhook, refund and payout (adapter built, never run against PayPal). Any other provider: a `PaymentProvider` adapter. Then remove the test cards, `/api/demo/orders/[id]/skip` and the demo controls                                        |
| Malware scanner (B-3)            | –                    | REMOVED BY OWNER — SECURITY RISK ACCEPTED (2026-10-29). No action; the lawyer reviews the disclaimer                                                                                                                                                                          |
| Legal                            | Lawyer               | Review every [LAWYER REVIEW] text (terms, privacy including Tawk.to, GA4 and first-party country, seller agreement, escrow and refund wording, EU/UK digital-content withdrawal); write the AUP and the DMCA flow; set retention periods                                      |
| Legal                            | Owner                | Name the Super Admin reviewers (B-11); approve the published legal versions in Admin > Content                                                                                                                                                                                |
| Production reconciliation (B-13) | Owner                | Written yes for the read-only run (history, probe.sql, privilege snapshot), then for backup, scratch restore and the production window                                                                                                                                        |
| Proxy (launch check)             | Owner                | On the live host: `CLIENT_IP_HEADER=cf-connecting-ip` if everything comes through Cloudflare, otherwise `TRUSTED_PROXY_HOPS`                                                                                                                                                  |

Mandatory staging acceptance before go-live (docs/LAUNCH_READINESS.md section 8):

| Check                                                                                                                                      | State                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Strict RLS suite                                                                                                                           | PASS 14/14 (2026-10-28)                                                                                              |
| Staging journey (custom development path)                                                                                                  | PASS 8/8                                                                                                             |
| Browser suite against staging                                                                                                              | PASS apart from the known search rate-limit flake; 4 BLOCKED (presale 3: staging Turnstile keys; real payment 1: D1) |
| Restart staging on e67c49c and later, then sign in with password and TOTP, sign out, wait for a refresh: cookie flags Secure, SameSite Lax | TO DO (local action; no approval needed beyond running staging)                                                      |
| Delivery chain on staging (upload, admin approval, release, entitlement, download)                                                         | Needs migration 0069 on staging (owner approval)                                                                     |
| A real payment in the provider's sandbox: pay, webhook, refund, payout                                                                     | BLOCKED by D1                                                                                                        |
| Turnstile keys for staging, then the 3 presale specs                                                                                       | Owner: create the Turnstile site                                                                                     |
| Production rehearsal on a scratch restore: migrations, drift file, strict RLS, snapshot                                                    | BLOCKED by the B-13 approvals                                                                                        |
| Social sign-in S1 to S4, S7, S12 to S14                                                                                                    | Only if a provider is switched on at launch (all off today)                                                          |

## Final local round (2026-10-29)

Local only: no production access, no push, no deployment, no paid service, no charge. Staging credentials were not in this shell, so
nothing ran on staging this round; staging evidence stays as of 2026-10-28 (RLS 14/14, journey 8/8), and no migration changed since.

Fixed (each with a regression test):

| Fix                                                                                                                                                                                                                                                                     | Severity                                 | Test                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| `LAUNCHBAY_DEMO=1` on the live server would have switched sign-in, the database, the bot check and the admin guard off. It is now ignored on any production configuration (production Supabase project or sellonbay.com address), through one helper, `lib/demoMode.ts` | High (one stray variable)                | tests/unit/demo-mode.test.ts (also fails if any code reads the variable directly) |
| Launch check lists `LAUNCHBAY_DEMO`, `ENABLE_TEST_CHECKOUT` and `SCAN_PROVIDER=test` as to-dos                                                                                                                                                                          | Low                                      | launch check browser spec                                                         |
| Turnstile: Cloudflare's test keys are accepted only on a correctly configured staging server (Cloudflare's advice for automated tests); production still refuses them and asks Cloudflare nothing                                                                       | – (unblocks the 3 presale staging specs) | tests/unit/turnstile.test.ts                                                      |
| Search browser test hit the shared 90-a-minute limit in full runs: the spec now searches from its own test address (limit unchanged)                                                                                                                                    | Test isolation                           | passed in the full run                                                            |
| Launch check browser test matched two rows after the new rows: selector anchored                                                                                                                                                                                        | Test (regression from this round)        | passed on rerun                                                                   |

Prepared, not connected: `lib/files/scannerGuardDuty.ts` (copy to a scan bucket, poll the GuardDuty tag with a deadline, always delete the
copy; only `NO_THREATS_FOUND` is clean; strict EventBridge event check for later). No AWS SDK, not reachable from `scannerFromEnv`, and
`approved` is false until the owner approves. tests/unit/scanner-guardduty.test.ts.

Reviewed, no change needed: every API route has an access check or is public on purpose (health, search, visit tracking, retired domain
search; demo order creation answers 410); no log line prints a secret, token, header or cookie; `npm audit` 0 vulnerabilities; GA4
`G-FEK9C0CM04` is the default and staging is forced to `off` by the gate and by `lib/stage.ts`.

Legal: docs/legal/REVIEW_PACK.md maps the 13 required topics to the existing texts and drafts the missing ones (manual-first payment,
plans, custom work and revisions, file scanning, retention schedule, country statistics, advertising), all DRAFT for counsel, nothing
published. The acceptable use and DMCA pages already existed.

Results this round:

| Check                                                                                                            | Result                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit tests                                                                                                       | PASS 1015/1015 (123 files). Manual payments 14, ledger 21, money edge cases 3, 2.0 chain 2, release 11, delivery chain 2: all PASS                                                                                                         |
| typecheck, lint (0 errors, 34 older warnings), format:check, check:migrations, check:migration-safety, npm audit | PASS                                                                                                                                                                                                                                       |
| Production builds (normal and legacy-public)                                                                     | PASS                                                                                                                                                                                                                                       |
| Browser suite (demo 3005 and 3002; no staging)                                                                   | 110 PASS (109 + the fixed launch-check test on rerun), 11 BLOCKED (need a server with accounts: admin 3, chat 1, guard 6, privacy 1; they passed on staging 2026-10-28), 82 SKIP (database or staging specs, and the retired list), 0 FAIL |
| RLS on staging                                                                                                   | not rerun (no credentials here); 14/14 on 2026-10-28, migrations unchanged since                                                                                                                                                           |

Paid services: nothing is activated. The owner decides each one; prices change, so confirm them on the provider's page.

| Service                                                  | Purpose                                      | Estimated monthly cost                                                | Free alternative                                                  | Needed for launch                                     |
| -------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| AWS GuardDuty Malware Protection for S3                  | –                                            | –                                                                     | –                                                                 | REMOVED BY OWNER — SECURITY RISK ACCEPTED: not needed |
| Payment provider (PayPal, Stripe Connect, ...)           | Card and wallet payments, payouts            | No monthly fee expected; per-transaction fees (confirm)               | Manual bank transfer and local wallet, built and tested           | NO for a manual-first launch                          |
| Email provider (Resend, SES, Zoho)                       | Notifications, password reset                | Resend has a free tier (confirm the limit); SES about $0.10 per 1,000 | Supabase's built-in mail (testing only, very low limits)          | YES (password reset and notices)                      |
| Cloudflare Turnstile                                     | Bot check                                    | Free                                                                  | –                                                                 | YES (the presale form refuses everyone without keys)  |
| Second hosted Supabase project for the restore rehearsal | Rehearse the production migrations           | Only if the free project quota is used up (confirm)                   | Local Postgres with the Supabase CLI (free)                       | Rehearsal yes; paid project no                        |
| Supabase point-in-time recovery                          | Finer backups                                | Paid add-on (confirm)                                                 | Daily dump and restore check (docs/LAUNCH_READINESS.md section 3) | NO                                                    |
| Upstash Redis                                            | Rate limits shared between two server copies | Free tier (confirm)                                                   | In-memory limits (single server)                                  | NO                                                    |
| KYC provider                                             | Seller identity checks                       | Per check                                                             | Manual review                                                     | NO at launch (D4)                                     |
| Legal counsel                                            | Approve texts, escrow wording, retention     | Professional fee                                                      | none                                                              | YES                                                   |

## Malware scanning removed (2026-10-29, owner decision)

Malware scanning is **REMOVED BY OWNER — SECURITY RISK ACCEPTED**. It is not completed and not security-verified. Nothing in SellOnBay says or implies that a file is
scanned or free of malware.

What changed: `lib/files/scanner.ts` and the prepared GuardDuty adapter are deleted (there was no ClamAV code or scanner package left to
remove). `runChecks` now does SHA-256, the archive rules and secret detection, then sends the file to review with `malwareScan: 'not performed'`
in its record. `reviewFile` no longer asks for a scan result (a file an earlier scanner marked infected is still refused). Migration 0069
(local only, not applied anywhere) replaces the database rule `file_objects_check` with `file_objects_approved_complete`: SHA-256, size,
the private approved copy and the reviewer are still required. The `scan_*` columns and every recorded scan result are kept. The admin
files page shows "Not scanned for malware" on every file waiting for review. The launch check shows the decision as a permanent warning.

Kept unchanged: ZIP integrity and structure rules (500 MB, entries, nesting, unpacked size, ratio, path tricks, no encrypted entries),
secret detection, SHA-256 at check and re-hash at approval, private quarantine and private approved storage, sign-in and authorisation,
the four-item sandbox review checklist, explicit admin release before any entitlement, signed and logged downloads.

Residual risks accepted by the owner:

1. Buyers can receive malicious code. The admin sandbox review is the only check, and it misses obfuscated, delayed or targeted payloads.
2. Reviewers handle unscanned archives: a sandbox lapse can compromise an admin machine, and admins hold Finance and release powers.
3. Legal: no "reasonable care" evidence for files in disputes or with consumer authorities; the disclaimer needs the lawyer (REVIEW_PACK 2.4).
4. One point of failure: review quality depends on one person's skill and workload; there is no independent second signal.
5. Hidden content: encrypted ZIP entries are refused, but encrypted documents or installers inside an archive are not opened.
6. Reputation: a malware incident can lead a payment provider or the host to suspend the account.
7. Repeat sellers: a trusted seller can slip a harmful change into a new version; every version is reviewed, but by a person only.

Optional free mitigations (not done, owner's choice): a dedicated sandbox virtual machine for reviewers; a written note required for the
sandbox checklist item; a second reviewer for scripts, plugins and installers.

## Log

- 2026-10-29: malware scanning REMOVED BY OWNER — SECURITY RISK ACCEPTED: scanner code deleted, checks and review without a scan, migration 0069 (local only), admin page and launch check say so, guard tests (tests/unit/no-malware-scan.test.ts). Docs updated.

- 2026-10-29: production read-only inspection (owner-authorised): history 0001-0053, 0054-0068 missing, no logical drift (4 bodies differ by line endings only), extra event trigger `ensure_rls`, test ledger data with 306,299 cents on 15 seller_pending accounts. Backup NOT taken (no access token, no Postgres tools): migration stopped before any write. docs/PRODUCTION_RECONCILIATION.md section 6.

- 2026-10-29: final local round: demo mode can no longer switch the live site off, launch check covers test switches, Turnstile test keys on staging only, GuardDuty adapter prepared (not connected), search test isolated, legal review pack, paid-services table; unit 1015/1015, browser 110 PASS / 11 BLOCKED / 82 SKIP / 0 FAIL. Local only, no charges.

- 2026-10-29: audit round 2: sign-in flows verified with the Secure cookie (session-flows tests), redirect host locked to the site on production builds (publicOrigin), CSP and XSS reviewed, GuardDuty quotas rechecked (no new upload limits), production reconciliation report and SELECT-only migration probe (docs/PRODUCTION_RECONCILIATION.md, scripts/migration-probe.mjs), exact blocker actions. Local only.

- 2026-10-28: session cookie Secure fix (lib/supabase/cookieOptions.ts; cause: @supabase/ssr has no Secure default), staging gate hardening (forwarded headers, IPv6 /64 lock-out, bounded table, UTF-8 password), launch check refuses an http site address, three more secret names in the bundle check. Local only.

- 2026-10-28: staging on https://staging.sellonbay.com: Cloudflare Tunnel plus `deploy/staging-gate.mjs` (password on every path including static files and demos, lockout after 10 wrong passwords, http to https, noindex, Secure cookies); one authorised CNAME; public checks and the staging journey (8/8) passed; Access skipped by the owner. Unit 983/983. See deploy/cloudflare-access-staging.md.

- 2026-10-28: authenticated staging tests (22: 14 PASS, 4 retired, 4 BLOCKED) through tests/e2e/realEnv.ts; delivery chain test with the scanner test double; launch readiness, scanner, delivery and Cloudflare documents; privilege snapshot script with staging baseline; full browser suite 156 PASS, 1 FAIL (search rate limit, passes alone), 46 SKIP; RLS 14/14; unit 975/975.

- 2026-10-28: six browser failures fixed (maintenance pages now a real 503 from proxy.ts, 404 pages moved outside the dashboard loading screen, saved list always read fresh), each with a unit test; the 11 BLOCKED browser tests run against the local staging server and pass; full suite 143 PASS, 0 FAIL, 60 SKIP; Cloudflare Access BLOCKED (no sign-in, and a staging hostname is a production-zone DNS change); docs/SCANNER_EVALUATION.md.

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
