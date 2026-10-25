# Staging check: real database, login, checkout, payment and the 11 real-server tests

Needs a staging Supabase project and a staging copy of the site (never the live database). These cannot run without those keys.

## 1. Set up staging

1. Create a staging Supabase project. Apply the migrations in order (`docs/DEPLOYMENT.md`, `supabase db push` against staging only). Turn on TOTP (authenticator) in Auth.
2. Copy `.env.example` to `.env.local` and fill: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DELIVERY_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET`, `GUARD_SALT`, `NEXT_PUBLIC_SITE_URL` (the staging address).
3. `npm ci`, `npm run build`.

## 2. The 11 real-server tests

They call a real server on port 3000 with the real database, so they were skipped without staging:

```
PAYMENT_WEBHOOK_SECRET=e2e-hook-secret EXAMPLE_ORDERS=1 npx next start -p 3000     # staging keys in .env.local; EXAMPLE_ORDERS only on this test server
npm run test:e2e
```

Expected: the 11 tests in `admin.spec.ts` (who may call what), `guard.spec.ts` (risk, versions, repo access, settings, launch check), `chat.spec.ts` and `privacy.spec.ts` pass, and `rls.spec.ts` (the wrong person is always refused) runs instead of skipping. Also run `node tests/e2e/delivery.e2e.cjs`.

## 3. By hand on staging

Without `EXAMPLE_ORDERS` set (as on the live site), then:

1. Register a buyer and a seller; confirm the email; sign in; reset a password; sign in with the authenticator code as seller and admin.
2. The example listings and example developers are gone everywhere: home, shelves, search, categories, the template categories, `/find`, `/tools/site-ideas`, `/welcome`, `/sitemap.xml`.
3. As a seller, list a website (demo link or zip). As an admin, approve it, then use Edit content, price and pictures on it (name, description, price, delivery, extras, an app's screenshots) and Search, picture and questions.
4. As a buyer: open the listing, check out with a test card (4242 4242 4242 4242), see the order, accept it, download the file (a purchased listing still downloads after an admin archives its page).
5. Admin: Template categories (put the listing in a category, change a category address, check the 301), Top bar, Redirects, robots.txt, Link check (expect 0 broken), Preview sitemap.
6. Payment: only the test gateway exists until decision D1 is made, so a real card payment cannot be checked yet.

## 4. Visual check

Compare desktop (1440 px) and phone (390 px) screenshots of the live site with staging for home, a category page, a product page, cart and checkout, account pages, header and footer. The only intended difference is the new Templates entry in the category bar.
