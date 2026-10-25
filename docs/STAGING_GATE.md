# Staging safety gate — DO NOT run against production

## Current state

- CI on every pull request and push to `main`: lint, TypeScript, Vitest, syntax validation of migrations, Node staging-guard tests, Next.js demo build, client bundle secret leak checker, and actual HTTP smoke tests against a locally started demo server.
- `staging-rls.yml` is **manual only**. It uses the repository's GitHub Actions environment named `staging`. Its tests create/delete users, orders, ledger entries and files. They are not safe against the production Supabase project. The workflow validates two distinct HTTPS app hostnames and two distinct HTTPS Supabase project origins before using any service-role credential.
- The RLS suite now fails instead of silently skipping if the required migration tables are missing under `CI_STAGING_STRICT=1`.

## Before clicking Run workflow

1. Create a **separate Supabase staging project** and a disposable/staging Next.js deployment using Node.js 22 with every migration file in `supabase/migrations`, in order (list: `docs/DEPLOYMENT.md`). Never use the production database or production auth accounts.
2. Create a GitHub repository Environment named `staging`, with required reviewers if supported.
3. Set environment Variables: `STAGING_APP_URL`, `PRODUCTION_APP_URL`, `STAGING_SUPABASE_URL`, `PRODUCTION_SUPABASE_URL` (HTTPS origins, without trailing paths). Staging app hostname and Supabase project must each differ from production.
4. Set protected Environment Secrets: `STAGING_SUPABASE_ANON_KEY` and `STAGING_SUPABASE_SERVICE_ROLE_KEY`. Never put these in repository files, Issue comments, screenshots or logs.
5. Open GitHub Actions → **Verify isolated staging RLS** → Run workflow. Type exactly `I_UNDERSTAND_STAGING_WRITES`.
6. A green run confirms that the existing RLS suite executes on this staging database. Review the staging database afterwards, as append-only history may remain by design. Run browser/order/download smoke tests manually on this same staging deployment.

## Not automated or certified by this workflow

- It does not provision hosting, Supabase, backups, external providers or production traffic.
- It does not apply migrations or restore backups automatically.
- It does not prove a real payment provider is integrated, a real HTTPS seller file downloads work from a live host.
- Never treat the demo CI run as evidence of staging RLS, PSP money custody, production malware service or disaster recovery.

- Apply migration `0042_ai_atomic_quotas.sql` in the isolated staging project and run two simultaneous model quota requests with shared IP and different cookies. Confirm only quota-eligible requests receive a reservation; test budget and idempotent settlement. Do **not** point this test at production or connect a billable model before cost/retry validation.
