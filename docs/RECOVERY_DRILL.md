# Recovery drills

A backup nobody has restored, or a rollback nobody has tried, is a hope, not a plan. Run each drill below on **staging** (never the live site) before launch, then every three months and after any big change to hosting or the database. Write each run down in the table at the end.

None of these drills has been run yet: there is no staging copy. Until they have, we make no promise about how fast the site comes back or how much data a failure can lose.

## Targets to agree with the owner

| | Meaning | Starting target (owner to confirm) |
| --- | --- | --- |
| RPO | The most data we accept to lose | 24 hours with the daily backup; minutes with point-in-time recovery (PITR) |
| RTO | How long the site may be down while we restore | 4 hours for a full restore, 5 minutes for a code rollback |

PITR is a paid Supabase add-on: check its current price and plan limits on Supabase's own site before relying on it.

## 1. Database and files restore

Follows `docs/RUNBOOK.md` "Backups" and "Restore a backup", timed.

- [ ] `npm run db:backup` and `npm run storage:backup` on a trusted machine. Note the time and both file sizes.
- [ ] Copy both files off that machine (the second place). Open the copy, not the original, for the restore.
- [ ] Make an empty Supabase project, apply every file in `supabase/migrations` in order (`docs/DEPLOYMENT.md`).
- [ ] `npm run db:restore` and `npm run storage:restore` into it. Note how long each took.
- [ ] Compare the counts the restore prints (accounts, listings, orders, ledger entries) with the source.
- [ ] Point a staging copy of the site at it. Sign in as a buyer, a seller and an admin (with the authenticator code). Open one order, one listing with its demo, one payout.
- [ ] The ledger still balances: the admin payouts page shows no errors, and no wallet is below zero.
- [ ] Delete the drill project afterwards (it holds a copy of real accounts).

## 2. Point-in-time recovery (once PITR is on)

- [ ] On staging, note the time, then delete one test listing.
- [ ] Restore to a minute before the note with Supabase's PITR (Database > Backups). Note how long it took.
- [ ] The listing is back, and orders made before the note are there.

## 3. Code rollback

- [ ] Blue-green (VPS): deploy a build, then `deploy/blue-green.sh rollback`. `deploy/blue-green.sh status` shows the old copy serving. Time from command to the old copy answering.
- [ ] Single copy (managed Node hosting): check out the previous commit, build, restart. Time it.
- [ ] During both, a test buyer browsing the site sees no error page for more than a few seconds.

## 4. Database change gone wrong

Migrations are never undone by hand. The rule (`docs/DEPLOYMENT.md`, "Migration safety") is: fix forward with a new migration, or restore.

- [ ] On staging, apply the newest migration, then roll the code back one version. The old code still works on the newer database (every migration after 0049 must only add).
- [ ] Practise restoring the database to the backup taken just before the migration (drill 1).

## 5. One part closed, the rest open

- [ ] Close one module (for example checkout) in Admin > System > Maintenance Manager. Its pages show the maintenance screen and its APIs answer 503; the rest of the site works; scheduled jobs still run.
- [ ] Open it again. History shows both changes.

## 6. Outside services down

- [ ] Redis: set a wrong `UPSTASH_REDIS_REST_URL` on staging. The site keeps working, limits count in memory, and the log says so once a minute.
- [ ] Email: set a wrong `RESEND_API_KEY`. Notifications still appear in the app; after the key is fixed the queued emails go out on the next scheduled run (with migration 0051).
- [ ] Payment webhooks: send one twice. The second is ignored (idempotent), and no order is funded twice.

## Record

| Date | Drill | Who | Result | Time taken | Data lost | What we changed |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
