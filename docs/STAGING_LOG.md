# SellOnBay 2.0 staging execution log

Project: `occketfmjwciilzuddkv` only. Production (`knvxtgzrylvkhyrcezlq`) is never a target.

| When (UTC) | Step | Result |
|---|---|---|
| 2026-10-27 21:34-21:38 | 0001-0014 applied with Supabase MCP `apply_migration`, one at a time | OK; history rows hold MCP timestamp versions |
| 2026-10-28 | 0015 with MCP `apply_migration`, twice | `declined` by the tool both times; nothing applied (verified read-only) |
| 2026-10-28 | Owner: switch to Supabase CLI as the only tool | CLI 2.121.0 installed locally (dev dependency) |
| 2026-10-28 | History backup (read-only) | 14 rows saved to `~/.sob-staging/history-backup-2026-10-28.tsv`; every row's statements match its local file byte for byte (MD5) |
| 2026-10-28 | Runner `scripts/staging-migrate.mjs` (repair, plan, apply in reviewed batches) | Written; stops without credentials |
| 2026-10-28 | Repair and migrations 0015-0066 | WAITING: `~/.sob-staging/token` and `~/.sob-staging/db-password` do not exist |

Batches (each starts at a reviewed destructive migration): 0015 | 0016-0018 | 0019-0022 | 0023-0042 | 0043-0052 | 0053-0059 | 0060-0066.
