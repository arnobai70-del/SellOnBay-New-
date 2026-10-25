# SellOnBay

A marketplace for ready-made, AI-built websites, apps and digital products. Buyers pick a product, give a domain (or buy one) and it goes live in 1 to 7 days. Next.js (App Router) + TypeScript + Tailwind v4, Supabase for accounts, listings and orders. Payments, the registrar and deployment run on **fake providers** until the owner decides on real ones (see `docs/DECISIONS.md`).

Read `CLAUDE.md` for the rules of the project and `docs/DECISIONS.md` for every rule chosen while building (the original `docs/BUILD_SPEC.pdf` product spec is not in this repository; where the two differ, `docs/DECISIONS.md` wins).

## Setup

```
npm install
cp .env.example .env.local     # fill in the Supabase keys (optional: without them the site runs as a demo, orders live in memory)
npm run dev                    # http://localhost:3000
```

With Supabase: run the files in `supabase/migrations/` in order (0001 to the newest) in the SQL editor, enable TOTP under Authentication > Multi-factor, and make yourself admin with `update profiles set role = 'admin' where id = '<your user id>';`.

## Environment variables (`.env.example` lists them all)

| Variable                                                                                  | What it does                                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`                               | Supabase project. Without both the site runs in demo mode.                                         |
| `SUPABASE_SERVICE_ROLE_KEY`                                                               | Server only. Never put it in the browser or in git.                                                |
| `LAUNCHBAY_DEMO=1`                                                                        | Forces demo mode (no database) even when keys exist.                                               |
| `DELIVERY_SECRET`                                                                         | Signs download links. Set a long random value in production.                                       |
| `PAYMENT_WEBHOOK_SECRET`                                                                  | Signs payment webhooks. Required in production, there is no default there.                         |
| `CRON_SECRET`                                                                             | Lets the scheduler call `POST /api/cron/orders`.                                                   |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                                  | Bot check on the pre-sale question form. Test keys are used when unset (they check nothing).       |
| `FEATURE_TRIAL_COPY`, `FEATURE_FREE_SAMPLE`, `NEXT_PUBLIC_FEATURE_DEMO_RANKING`           | Switches for features that need an owner decision. See `.env.example`.                             |
| `RELEASE_DELAY_MINUTES`, `RELEASE_DELAY_NEW_BUYER_DAYS`, `RELEASE_DELAY_HIGH_PRICE_CENTS` | Optional short delay before files are released to new or high-risk buyers. All 0 (off) by default. |

## Commands

| Command                                       | What it does                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run lint` / `typecheck` / `format:check` | Code checks. `npm run format` fixes style.                             |
| `npm test`                                    | Unit tests (`tests/unit`, Vitest). Money, orders, ledger, filters.     |
| `npm run test:e2e`                            | Browser and API tests (`tests/e2e`, Playwright). Needs the app running |
| `node tests/e2e/delivery.e2e.cjs`             | File-release checks against the real database.                         |

End-to-end tests run against a built app: `npm run build`, then in two terminals

```
PAYMENT_WEBHOOK_SECRET=e2e-hook-secret LAUNCHBAY_DEMO=1 npx next start -p 3002   # demo mode, orders in memory
PAYMENT_WEBHOOK_SECRET=e2e-hook-secret EXAMPLE_ORDERS=1 npx next start -p 3000   # real Supabase from .env.local; EXAMPLE_ORDERS only on a test server
npm run test:e2e
```

Tests that need the real database skip themselves when `.env.local` is missing or a migration is not applied. In CI (`.github/workflows/ci.yml`) lint, types, unit tests, the migration check, the production build, the no-secret bundle check and a demo-mode smoke test run on every push and pull request. The Playwright browser tests are run by hand (see above).

## Layout

```
app/                  routes (see CLAUDE.md for the list); app/api/ holds the API routes
components/           shared UI
lib/config.ts         every money, time and permission rule (one place, tested)
lib/brand.ts          the product name (one place)
lib/orders/           order state machine, stores, services, payment events, extra work, certificate
lib/ledger.ts         double-entry ledger (pure); lib/ledgerStore.ts keeps it
lib/providers/        the only doors to outside companies: payment, domain, deploy, ai, email (each: interface + fake)
lib/delivery/         signed download links, licence keys, download log
supabase/migrations/  SQL, in order
tests/unit, tests/e2e Vitest and Playwright
prototype/            the old static prototype, kept as a visual reference
docs/                 DECISIONS.md, RUNBOOK.md, DEPLOYMENT.md, LOAD_TESTING.md (k6 scripts in load/, staging only), launch gates (FINANCIAL_LAUNCH_GATES.md, STAGING_GATE.md, AI_USAGE_GATES.md)
emails/               email templates (not built yet)
```

## Deploying

1. Create the Supabase project, apply every migration, enable TOTP, set the keys in the host's environment (never in git).
2. Set `NEXT_PUBLIC_SITE_URL`, `DELIVERY_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET` and the Turnstile keys.
3. Schedule `POST /api/cron/orders` every few minutes with the header `Authorization: Bearer <CRON_SECRET>` (Vercel cron or Supabase cron). It auto-accepts orders after the review window, marks late orders, and ends payout holds.
4. Put Cloudflare in front (see `docs/RUNBOOK.md`).

On a Node host such as Hostinger: Node 22 (20.9 at least), install with `npm ci`, build with `npm run build` (it uses webpack, which builds on hosts where Turbopack does not), start with `npm start` (Next reads the port from `PORT`). Pull the new code, run the build again, then restart the app.

Before launch: a lawyer must review every page tagged `[LAWYER REVIEW]`, the payment provider decision (D1) must be made, and the security checklist in `docs/RUNBOOK.md` must be ticked.
