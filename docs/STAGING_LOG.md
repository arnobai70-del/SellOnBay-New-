# SellOnBay 2.0 staging execution log

Project: `occketfmjwciilzuddkv` only. Production (`knvxtgzrylvkhyrcezlq`) is never a target.

| When (UTC) | Step | Result |
|---|---|---|
| 2026-10-27 21:34-21:38 | 0001-0014 applied with Supabase MCP `apply_migration`, one at a time | OK; history rows hold MCP timestamp versions |
| 2026-10-28 | 0015 with MCP `apply_migration`, twice | `declined` by the tool both times; nothing applied (verified read-only) |
| 2026-10-28 | Owner: switch to Supabase CLI as the only tool | CLI 2.121.0 installed locally (dev dependency) |
| 2026-10-28 | History backup (read-only) | 14 rows saved to `~/.sob-staging/history-backup-2026-10-28.tsv`; every row's statements match its local file byte for byte (MD5) |
| 2026-10-28 | Runner `scripts/staging-migrate.mjs` (repair, plan, apply in reviewed batches) | Written; stops without credentials |
| 2026-10-28 | Credentials present | 4 files in `~/.sob-staging` |
| 2026-10-28 | History repair (CLI): MCP rows reverted, 0001-0014 marked applied | OK; app tables unchanged (23 tables, old enum, cron job still there) |
| 2026-10-28 | Dry run of every batch | OK |
| 2026-10-28 | 0015-0066 applied (CLI, 7 batches) | OK: 66/66 versions, 80 tables, RLS on every table, 6 private buckets, `auto-accept-orders` gone, plan seeds 15/10/5%, 5/25/100, $19/$193.80, $49/$499.80 |
| 2026-10-28 | Security advisor and privilege checks | SECURITY GAP: Supabase default privileges leave `products_public` (updatable security-definer view) writable by anon (UPDATE/DELETE/INSERT live listings), `ledger_balances` readable by anon, `bump_counter()` callable by anon. Likely present on PRODUCTION too (not checked: forbidden) |
| 2026-10-28 | Fix `0067_close_default_grants.sql` (privileges only) | Written and passes the local checker (now emulating Supabase default privileges). NOT applied to staging: outside the 0015-0066 authorisation |

Batches (each starts at a reviewed destructive migration): 0015 | 0016-0018 | 0019-0022 | 0023-0042 | 0043-0052 | 0053-0059 | 0060-0066.
| 2026-10-28 | 0067 (MAINTAIN added before it was applied anywhere): dry run, apply to staging | OK; recorded once (67 versions). anon: SELECT only on products_public; no ledger_balances; no bump_counter; no sequence UPDATE |
| 2026-10-28 | Anonymous REST tests on staging | browse 200; PATCH/DELETE/POST products_public, GET ledger_balances, RPC bump_counter, base tables: 401 permission denied |
| 2026-10-28 | PRODUCTION read-only catalog check (3 objects only, no rows read) | NOT vulnerable: products_public anon=rm (SELECT + MAINTAIN), ledger_balances anon=m, bump_counter postgres+service_role only. Production differs from the migration files (schema drift) |
| 2026-10-28 | 10 synthetic accounts (`@example.test`) via scripts/staging-fixtures.mjs | OK; roles and admin scopes correct |
| 2026-10-28 | RLS suite on staging (CI_STAGING_STRICT=1) | 13/14 PASS; FAIL: a buyer can change every column of their own notification (default table grant beats the read_at column grant) |
| 2026-10-28 | Privilege audit: client-write privileges where a policy allows | notifications (all columns, own rows), seller_profiles DELETE (own row), anon writes on 4 tables (no row matches) |
| 2026-10-28 | Fix 0068_column_grants_hold.sql (privileges only) | Written, passes the local checker; NOT applied: blocked by the permission system, needs owner approval |
| 2026-10-28 | 0068 (owner approved): dry run listed only 0068, applied once | OK; 68 versions. notifications: authenticated may UPDATE read_at only, no other write; seller_profiles: no DELETE for clients; anon: no write on profiles, seller_profiles, notifications, abuse_reports; service_role unchanged |
| 2026-10-28 | RLS suite on staging (CI_STAGING_STRICT=1) after 0068 | 14/14 PASS |
| 2026-10-28 | PRODUCTION read-only catalog check: notifications, seller_profiles (no rows read) | NOT vulnerable: notifications authenticated=SELECT+MAINTAIN, UPDATE on read_at only; seller_profiles authenticated=SELECT+MAINTAIN, anon=MAINTAIN; RLS on. Drift from the migration files again; 0067/0068 must not be applied to production unchanged |
| 2026-10-28 | Note outside 0068 | authenticated still holds INSERT/DELETE on profiles and UPDATE/DELETE on abuse_reports; no policy allows them, so RLS refuses (tested). Candidate for a later privileges-only migration |
| 2026-10-28 | Staging build rebuilt after the browser fixes; local staging server 127.0.0.1:3010 | Password 401/401/200, X-Robots-Tag and meta noindex, robots `Disallow: /`, sitemap 0 URLs, no GA4 or Tawk, no production reference |
| 2026-10-28 | Full browser suite with REAL_URL = staging server (signed-out checks) and the staging journey | 143 PASS, 0 FAIL, 60 SKIP; the 11 formerly BLOCKED tests PASS; journey 8/8 (new synthetic request, quotation and order rows for buyer1) |
| 2026-10-28 | Cloudflare Tunnel and Access (owner authorised, after checking the hostname) | BLOCKED: cloudflared not signed in, no API token; staging.sellonbay.com would be a new record in the production zone. Nothing created |
| 2026-10-28 | Production | Not touched. The REVOKE MAINTAIN cleanup was not run; the privilege drift stays documented for the production plan |
| 2026-10-28 | The 22 authenticated specs through tests/e2e/realEnv.ts (staging keys from outside the repository; production refused) | 14 PASS, 4 retired, 4 BLOCKED (presale Turnstile 3, real provider 1). Synthetic `@launchbay.test` users created and deleted; 3 left over from failed runs deleted by script; 0 left |
| 2026-10-28 | scripts/privilege-snapshot.sql on staging (read-only) | 6 private buckets, RLS on 80 tables, 29 policies; anon may call only trigger functions and `is_admin()`; sequences anon SELECT/USAGE (Supabase default) |
| 2026-10-28 | Full browser suite with staging, then strict RLS | 156 PASS, 1 FAIL (search rate limit; passes alone), 46 SKIP; RLS 14/14 |
