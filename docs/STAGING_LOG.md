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
