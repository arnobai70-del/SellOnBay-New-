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

| #   | Phase                            | State                                                                                                | Commits                              | Migrations                            | Remaining                                                                                         | Blockers              |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------- |
| 0   | Baseline                         | PARTIAL                                                                                              | 9825ae2 (lock file)                  | –                                     | Production inspection (Appendix A), backup and restore, SEO crawl, Search Console export, staging | B-13, B-14            |
| 1   | Foundation                       | DONE, GA4 check BLOCKED                                                                              | a093148, dd0d2cf + Phase 1 remainder | 0055, 0063                            | GA4 DebugView/Realtime check                                                                      | GA4 test property     |
| 2   | Seller plans                     | DONE                                                                                                 | fa3a183                              | 0056, 0057                            | Check featured placement on the storefront (Phase 12)                                             | B-1 for paid plans    |
| 3   | Secure files                     | DONE, scanner BLOCKED                                                                                | 1e1c4ac                              | 0058                                  | Real scanner adapter                                                                              | B-3                   |
| 4   | Requests and quotations          | DONE                                                                                                 | 2715e58                              | 0059                                  | –                                                                                                 | –                     |
| 5   | Payments                         | DONE, real methods BLOCKED                                                                           | 5d2d6a4                              | 0060                                  | –                                                                                                 | B-1                   |
| 6   | Release                          | DONE                                                                                                 | 920d08d                              | 0061                                  | –                                                                                                 | –                     |
| 7   | Messaging and support            | DONE                                                                                                 | a5d1682 + Phase 7 closure            | 0062                                  | –                                                                                                 | –                     |
| 8   | Revisions and custom development | DONE                                                                                                 | Phase 8 commit                       | 0064                                  | Browser checks on staging                                                                         | –                     |
| 9   | Reports and country analytics    | DONE (sales PDF, receipts); GA4 and first-party country BLOCKED                                      | Phase 9 commit                       | 0065                                  | GA4 reader never run against Google; first-party switch-on and privacy text                       | B-5, B-12             |
| 10  | Social login                     | Extra layers DONE; every provider BLOCKED (off)                                                      | Phase 10 commit                      | 0066                                  | S1-S4, S7, S12-S14 on staging; Supabase automatic-linking setting confirmed per provider          | B-6, B-7              |
| 11  | Advertising                      | Review flow, guardrails, sealed-token helper DONE (memory only); platform adapters and table BLOCKED | Phase 11 commit                      | P22 proposed only (supabase/proposed) | Adapters after written access; the P22 migration after B-9                                        | B-9, B-10             |
| 12  | Storefront, dashboards, CMS      | DONE except the visual redesign (proposal only, waits for owner approval)                            | 0f149d8 + Phase 12 CMS commit        | –                                     | Redesign items in docs/DESIGN_PROPOSAL_2_0.md                                                     | Owner design sign-off |
| 13  | Hardening                        | NOT STARTED                                                                                          | –                                    | –                                     | Full regression, security, RLS on staging, reconciliation, rollback drill                         | B-11, B-12, staging   |

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

## Log

- 2026-10-28: Phase 12 finished apart from the redesign: Admin > Content (FAQ, How it works, 55 notification emails) with draft, preview, four-eyes publish (emails by Super Admin), history and rollback; built-in FAQ and How it works rewritten for the 2.0 flow (they promised files on payment and one-click domains); data export covers 2.0 records; buyer and seller menus link Sign-in methods and Your data; docs/DESIGN_PROPOSAL_2_0.md.

- 2026-10-28: local environment restored (stopped this project's own obsolete demo server, PIDs 6080 and 17464 on port 3002; `npm ci`). Security updates above.

- 2026-10-27: Phase 12 (part): admin overview work queues with oldest age and past-target counts, scoped per permission; social media links in the CMS (history and rollback); public pages, Terms and Seller agreement now state the plan commission (15/10/5%) instead of the old flat fees, which stay for older orders; listing form preview uses the seller's plan.
- 2026-10-27: Phase 11: seller Promote page and Catalog review queue, budget and text guardrails (lib/config.ts ads), AES-256-GCM sealed tokens, adapter interface with no implementation, P22 table kept as a proposal outside the migration chain (Addendum 2.3). Both ad flags locked; no ad API is called anywhere (tested).
- 2026-10-27: Phase 10: link intents and link log (0066), callback guard (switched-off providers, new Apple accounts, links without intent, unlinked identities), admin sessions with any social identity refused everywhere plus a scheduled check, sign-in buttons need SellOnBay's flag as well as Supabase, Apple only as a secondary link, Account > Sign-in methods. All providers stay off.
- 2026-10-27: Phase 9: sales PDFs (Finance/Super all, seller own, buyer receipt), 1,000 rows per file, private 24-hour files, kept export log, purge in cron; GA4 Data API reader (unverified, flag locked, B-5) and first-party country (flag locked, B-12, trusted proxy header only), shown apart and never added. Privacy page text for both waits for B-12.
- 2026-10-27: Phase 8: revision policies (seller proposes, Catalog approves, default in quotations), revisions (defect / included / paid / feature, own release step, follow-up on "not done"), paid changes as linked custom requests, custom-dev developer assigned before quoting; see docs/DECISIONS.md. Fixed: AdminForm textareas cut long requirement sets and legal texts at 600 characters.
- 2026-10-27: Phase 1 remainder: CMS history with rollback (P04) and versioned legal documents (P05) in 0063; quotations snapshot the published licence version; 2.0 routes already sit in the maintenance module map (tested).
- 2026-10-27: Phase 7 closed: ticket subjects follow the message rules; chain test covering release and messaging boundaries.
