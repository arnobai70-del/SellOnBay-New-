# Production migration-history and permission-drift reconciliation

Report date 2026-10-29. Production project `knvxtgzrylvkhyrcezlq`. Nothing in this report wrote to production, and no SQL ran there in
this round; read-only SQL needs the owner's separate yes. The production facts below are the read-only catalogue checks of 2026-10-28
(docs/STAGING_LOG.md, no rows read). Everything else comes from the repository and from the staging project `occketfmjwciilzuddkv`.

## 1. Where things stand

| Item | Repository | Staging | Production |
| --- | --- | --- | --- |
| Migration files | 0001 to 0068 | all 68 applied, each recorded once | history NOT read yet |
| Last recorded push | – | – | CLAUDE.md: 0001 to 0040 to "the dev Supabase project" on 2026-10-09 (that it is this project is likely, not proven) |
| Objects seen | – | 80 tables, 2 views, 29 policies, 6 buckets | `products_public`, `ledger_balances` (0016), `notifications` (0020), `seller_profiles`, `bump_counter` (0032) exist: consistent with 0001 to 0040 |
| Privileges | migration files | baseline snapshot (docs/LAUNCH_READINESS.md section 2) | 5 objects checked: none exploitable, all differ from the files (MAINTAIN everywhere, see section 4) |

Working hypothesis, to be confirmed by the probe: 0001 to 0040 applied and recorded; 0041 to 0068 (28 migrations, including the whole
2.0 schema 0055 to 0066) missing.

## 2. The probe (built and tested locally, not run on production)

`node scripts/migration-probe.mjs > probe.sql` writes one SELECT-only statement (468 checks; no INSERT, UPDATE, DELETE, DDL, GRANT or
REVOKE, enforced by tests/unit/migration-probe.test.ts). For each migration it checks:

- objects it is the first to create: tables and views, types, columns added later, functions, indexes, triggers, policies, buckets
  (objects a later migration drops for good are left out);
- fingerprints: the md5 of each function body and check constraint as the last migration to define it leaves it. The expected hashes come
  from applying all 68 migrations to an in-process Postgres;
- policies a migration drops for good: that they are gone.

61 of 68 migrations can be proved this way. Seven have nothing of their own left to probe: 0003, 0004, 0007, 0044, 0047, 0067 and 0068.
They are grants or revokes, or changes a later migration redefines, so `scripts/privilege-snapshot.sql` covers them (section 4).

Tested in the in-process Postgres: all 68 applied gives every provable migration `complete`. Only 0001 to 0040 applied gives 0001 to
0040 `complete` and every later provable migration `absent` (the verdict is "missing: apply in order"). A function body changed by hand
shows as `RECORDED BUT PARTIAL`.

Verdicts (`node scripts/migration-probe.mjs --classify history.json probe.json`):

| Recorded in history | Objects | Verdict | Next step |
| --- | --- | --- | --- |
| yes | all present | applied | none |
| no | all present | applied, not recorded | `supabase migration repair --status applied <v>` after review (history only, no SQL) |
| no | none present | missing | apply in order with the CLI |
| yes | none or some | recorded but absent or partial | stop: investigate before anything else |
| no | some | partly applied (by hand) | investigate; write a fix-forward migration |
| either | only check-constraint text differs | check text | compare `pg_get_constraintdef` with the file (a different Postgres version can format it differently) |
| either | nothing to probe | grants only | the privilege snapshot decides |

Limits: fingerprints prove the final text of functions and check constraints, not column types, defaults, or non-check constraints. A
column whose type was changed by hand on production is not caught. The snapshot and the strict RLS suite on a restored copy cover the rest.

## 3. Steps (each needs the owner's written yes)

1. Read only, about a minute. In the production SQL editor as postgres, run
   `select version, name from supabase_migrations.schema_migrations order by version;` and the generated `probe.sql`, then
   `scripts/privilege-snapshot.sql`. Export each result as JSON and keep the files outside the repository.
2. Local. Run `node scripts/migration-probe.mjs --classify history.json probe.json` and diff the snapshot against the staging baseline.
   Write the three lists (applied, applied but not recorded, missing) and the privilege diff into this file.
3. Backup and restore check (docs/LAUNCH_READINESS.md section 3), within 24 hours before step 5.
4. Restore the backup into a scratch project. Apply the plan there first: history repairs, then the missing migrations in order, then
   the drift file (section 4). Run the strict RLS suite and the privilege snapshot against it.
5. Production, in a maintenance window, with the owner present: the same plan, batch by batch with the CLI, stopping at the first error,
   BEFORE the 2.0 code is deployed (every file only adds, `check:migration-safety` is green).
6. After: probe and snapshot again (read only); every migration `applied`, and the snapshot equals staging's except documented
   platform differences.

## 4. Permission drift

Production facts (2026-10-28, read only) and what the migrations would do:

| Object | Production now | After 0067 or 0068 as written | Old code (live) needs it? |
| --- | --- | --- | --- |
| `products_public` | anon SELECT and MAINTAIN | anon SELECT only | anon SELECT only |
| `ledger_balances` | anon MAINTAIN | nothing for anon or authenticated; service_role SELECT | no: the live code reads it with the service-role client (13b98ae `lib/ledgerStore.ts`) |
| `bump_counter` | postgres and service_role | the same (the revoke has no effect, the grant is already there) | service-role client only |
| `notifications` | authenticated SELECT, MAINTAIN, UPDATE (read_at) | MAINTAIN removed, the rest unchanged | SELECT and UPDATE (read_at) kept |
| `seller_profiles` | authenticated SELECT and MAINTAIN, anon MAINTAIN | MAINTAIN removed | SELECT kept |

Finding (changes the 2026-10-28 advice): every statement in 0067 and 0068 is a REVOKE, or a GRANT that production already has or that
goes only to service_role (plus `authenticated` UPDATE on `notifications.read_at`, which production already has). Run in order they
only take privileges away, and nothing the live code uses is taken. So they can be applied to production as written, inside step 5. The
production-specific "drift file" is still needed, but only for the drift 0067 and 0068 do not touch. Candidates, to be confirmed by the
snapshot diff:

- `revoke maintain on all tables in schema public from anon, authenticated;` (MAINTAIN only exists from Postgres 17, so production runs 17 or later; staging got the same grants from the platform's default privileges)
- `revoke insert, delete on profiles from authenticated;` and `revoke update, delete on abuse_reports from authenticated;` (RLS already refuses them)
- anything else the diff shows that staging does not have

Each line goes in a normal migration file after 0068 (never as ad hoc SQL), so production and the repository stay in step.

## 5. Approvals needed

| Step | Kind | Approval |
| --- | --- | --- |
| 1 | read-only SQL on production | owner, in writing |
| 3, 4 | backup, scratch restore | owner (scratch project costs while it runs) |
| 5 | production writes (history repair, migrations, drift file) | owner, with the reviewed file list and the window |

## 6. Read-only inspection results (2026-10-29, owner-authorised)

Done through the Supabase connector with SELECT statements only. Nothing was written, no backup was taken, and no migration ran.

| Check | Result |
| --- | --- |
| Identity | `knvxtgzrylvkhyrcezlq` "MARKETPLACE PROJECT", ap-northeast-1, Postgres 17.11, healthy |
| Recorded history | 0001 to 0053 (not 0001 to 0040 as assumed in section 1) |
| Missing | 0054 to 0068, plus 0069 (written 2026-10-29 after this inspection: removes the clean-scan approval rule) |
| Objects of 0001 to 0053 | all present. Four function bodies differ only by Windows line endings (`certificates_immutable`, `record_dispute_outcome`, `ledger_post`, `is_admin`): after removing `\r` and outer whitespace the hashes equal the repository's. No logical drift |
| Objects of 0054 to 0066 | none present (consistent with the history) |
| Not in the repository | `public.rls_auto_enable()` (event trigger function, security definer, owner postgres) and event trigger `ensure_rls` on `ddl_command_end`: enables RLS on new tables (most likely the dashboard setting). Cannot be called through the API; harmless for our migrations, which enable RLS themselves. Record it, do not remove it |
| Security | RLS on all 53 tables; 27 policies; 2 buckets, both private; no table-level INSERT, UPDATE, DELETE or TRUNCATE for anon or authenticated; 70 MAINTAIN grants to anon or authenticated (known drift, section 4) |
| Orders | 4, all `awaiting_payment` (0060's new status rule validates) |
| Ledger | 241 entries, 580 lines, debits = credits = 740,900 cents, 0 unbalanced entries; but ALL lines belong to orders that no longer exist, all written on 2026-10-08 (test data). Balances left: 15 `seller_pending` accounts, 306,299 cents in total; 45 non-zero `order_escrow` accounts, 4,500 cents in total; `platform_cash` -372,700 cents; `platform_revenue` 61,901 cents |
| Other rows | 47 profiles, 23 products, 0 payouts, 0 disputes |
| Storage | `certificates` 98 objects (0.2 MB, all 2026-10-08), `demos` 551 objects (62 MB) |

Stopped before step 2 (backup): the Supabase CLI has no access token here, there is no database password or connection string, and
`pg_dump`, `pg_restore`, `psql` and Docker are not installed. A SELECT-based copy would not be a consistent backup, so none was made.
Steps 3 and 4 depend on step 2 and were not started.
