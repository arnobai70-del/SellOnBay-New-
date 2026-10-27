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

| #   | Phase                            | State                                                           | Commits                              | Migrations          | Remaining                                                                                         | Blockers                     |
| --- | -------------------------------- | --------------------------------------------------------------- | ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- |
| 0   | Baseline                         | PARTIAL                                                         | 9825ae2 (lock file)                  | –                   | Production inspection (Appendix A), backup and restore, SEO crawl, Search Console export, staging | B-13, B-14                   |
| 1   | Foundation                       | DONE, GA4 check BLOCKED                                         | a093148, dd0d2cf + Phase 1 remainder | 0055, 0063          | GA4 DebugView/Realtime check                                                                      | GA4 test property            |
| 2   | Seller plans                     | DONE                                                            | fa3a183                              | 0056, 0057          | Check featured placement on the storefront (Phase 12)                                             | B-1 for paid plans           |
| 3   | Secure files                     | DONE, scanner BLOCKED                                           | 1e1c4ac                              | 0058                | Real scanner adapter                                                                              | B-3                          |
| 4   | Requests and quotations          | DONE                                                            | 2715e58                              | 0059                | –                                                                                                 | –                            |
| 5   | Payments                         | DONE, real methods BLOCKED                                      | 5d2d6a4                              | 0060                | –                                                                                                 | B-1                          |
| 6   | Release                          | DONE                                                            | 920d08d                              | 0061                | –                                                                                                 | –                            |
| 7   | Messaging and support            | DONE                                                            | a5d1682 + Phase 7 closure            | 0062                | –                                                                                                 | –                            |
| 8   | Revisions and custom development | DONE                                                            | Phase 8 commit                       | 0064                | Browser checks on staging                                                                         | –                            |
| 9   | Reports and country analytics    | DONE (sales PDF, receipts); GA4 and first-party country BLOCKED | Phase 9 commit                       | 0065                | GA4 reader never run against Google; first-party switch-on and privacy text                       | B-5, B-12                    |
| 10  | Social login                     | MISSING (flags only)                                            | –                                    | P19                 | Link intents, callback guard, admin refusal, Apple path; providers stay off                       | B-6, B-7                     |
| 11  | Advertising                      | MISSING (flags only)                                            | –                                    | P22 (proposed only) | Screens, review queue, token interface; no ad API calls                                           | B-9, B-10                    |
| 12  | Storefront, dashboards, CMS      | MISSING                                                         | –                                    | –                   | CMS draft/preview/publish/rollback page by page, dashboard maps (Blueprint 10.1)                  | Brand changes need the owner |
| 13  | Hardening                        | NOT STARTED                                                     | –                                    | –                   | Full regression, security, RLS on staging, reconciliation, rollback drill                         | B-11, B-12, staging          |

## Known test gaps

- Data export and deletion (lib/privacy.ts) does not yet include the new 2.0 records (conversations, tickets, revisions, payment proofs): Phase 13.

- Demo mode cannot create a paid order any more (instant checkout is closed since 2715e58), so older browser specs that buy in demo mode fail
  there. Do not reopen instant checkout. The purchase chain is tested in process (`tests/unit/sob2-chain.test.ts`, `tests/unit/release.test.ts`).
- Anything that needs accounts in a browser (conversations, tickets, requests, payments) needs a staging Supabase: BLOCKED.

## Log

- 2026-10-27: Phase 9: sales PDFs (Finance/Super all, seller own, buyer receipt), 1,000 rows per file, private 24-hour files, kept export log, purge in cron; GA4 Data API reader (unverified, flag locked, B-5) and first-party country (flag locked, B-12, trusted proxy header only), shown apart and never added. Privacy page text for both waits for B-12.
- 2026-10-27: Phase 8: revision policies (seller proposes, Catalog approves, default in quotations), revisions (defect / included / paid / feature, own release step, follow-up on "not done"), paid changes as linked custom requests, custom-dev developer assigned before quoting; see docs/DECISIONS.md. Fixed: AdminForm textareas cut long requirement sets and legal texts at 600 characters.
- 2026-10-27: Phase 1 remainder: CMS history with rollback (P04) and versioned legal documents (P05) in 0063; quotations snapshot the published licence version; 2.0 routes already sit in the maintenance module map (tested).
- 2026-10-27: Phase 7 closed: ticket subjects follow the message rules; chain test covering release and messaging boundaries.
