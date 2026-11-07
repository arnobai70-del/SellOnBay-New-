# Glass UI redesign progress

Rules and decisions: `docs/DECISIONS.md`, sections "Glass UI redesign" and "Global market, free beta and email". Handoff: `SELLONBAY_REDESIGN.md`.

| Phase | Branch | State |
| --- | --- | --- |
| 0 Audit | none | Done |
| 1 Design system and layouts | `redesign/phase-1-design-system` | Done, approved by the owner on 2026-11-07 |
| 2 Public pages | `redesign/phase-2-public-pages` | Done, waiting for the owner's click-through |
| 3 Buying flow | `redesign/phase-3-buying-flow` | In progress |
| 4 Buyer dashboard | none yet | Not started |
| 5 Seller dashboard | none yet | Not started |
| 6 Admin | none yet | Not started |
| 7 Polish | none yet | Not started |

## Database

Working database: the project in `.env.local` (owner, 2026-11-07).

- Backup taken before the first migration: `backups/2026-11-07-before-redesign.sql` (2.1 MB, all schemas, dump complete) and `backups/storage/` (689 of 689 files, 65 MB). `backups/` is ignored by git.
- Applied, one at a time, with the tests after each: `0074_flat_plan`, `0075_public_store_and_contact`. The history already had 0001 to 0073, so nothing older was pending.
- 43 live listings and 47 accounts were the same before and after.

## Phase 2: done

Done:

- Money rules: flat 78/22 plan version, Pro and Business no longer offered, Thursday UTC payouts with the 7-day hold, $20 minimum for new and edited listings.
- `PAYMENTS_MODE` setting (default `beta_free`), email routing, ZeptoMail provider, emails to the console in development, and real email held back from anyone but our own and test addresses until launch.
- Glass pages on real data: home, `/websites`, `/websites/[slug]`, `/websites/category/[category]`, `/sellers`, `/sellers/[username]`, `/domains`, `/sell`, `/buyer-protection`, `/help` with a contact form, `/guides`, `/guides/[slug]`, `/legal/*`, the 404 page and the beta banner.
- 301s from every old address, sitemap and robots follow. Home three.js and JS motion and the theme switch are retired from the public site.

Checked on a production build against the real database: 1,067 unit tests, typecheck, lint with 0 errors, format, migration checks, bundle secrets, and a browser check of 16 pages plus one real listing at 360, 390, 768 and 1280 px with reduced motion on and off (page width, one h1, canonical, description, status, no banned word, no offer data), the 301s, and all 72 internal links.

Not done yet:

- The cookie notice and `/report-abuse`, `/search`, `/maintenance` still have the old look. They move in Phase 7, when the old styles go.
- The guides newsletter form is not built, though its table exists. Technology and backend filters on `/websites` wait for sellers to fill those fields (Phase 5).
- Help articles are the existing questions and answers, not the design's article list.
- Search still shows listing names as stored, including the removed word (Phase 7).

What to click (`npm run dev`, then `http://localhost:3000`):

1. `/`, then a category chip, then a website. Your real listings should show, with no "template" anywhere.
2. `/websites`: search, category, price filter, sort and the page numbers.
3. `/templates/saas`, `/product/<any listing id>`, `/faq`, `/terms`: each should move to its new address.
4. `/sell`: change the price in the calculator. $49 should earn $38.22.
5. `/help`: send the contact form. The email appears in the terminal, not in anyone's inbox.
6. Resize to phone width on each.

## Decisions taken during build

- Backup waited for `SUPABASE_DB_URL` (owner chose a fresh `pg_dump`). A copy through the Supabase connector was not used, because it is not a consistent dump and would pull password hashes into the session.
- Public categories are the five the real listings are in, without the removed word: E-commerce, SaaS & Startup, Business & Corporate, Portfolio & Agency, Industry. The reference's Restaurant and Blog were sample data, and stored values are not rewritten.
- Stored listing names and descriptions containing the removed word are not edited. Public pages show them through `plainWords` in `lib/glass/words.ts`; sellers and admins still see what they wrote.
- The flat plan's listing limit is 100, the largest the older plans had, so no seller loses room.
- Live listings under $20 stay live at their price (one, at $10). The minimum applies to new listings and edits.
- The active Business subscription stays as it is: the decision hides Pro and Business for new sellers and does not move an existing one. New quotations for that seller use its plan until the owner says otherwise.
- Legal pages stay reachable and out of search, as the owner set on 2026-10-23.
- `/login` stays the sign-in address until the sign-in pages move in Phase 3.
- Saved settings for a category stay under the old `/templates/<slug>` key, so nothing an admin saved is lost.

## Questions for the owner (not blocking)

1. Which listings may be requested free during beta? None is marked `beta_free_ok` and none is SellOnBay-owned, so nothing can be requested until some are.
2. Should the active Business seller (23 listings, 5% fee) move to the flat 22%?
3. The database password appeared in the chat. Change it once the work is done, and update `.env.local`.

## Test rows to remove before launch

None yet.

## Placeholders still to fill

`[PAYOUT FEE]`, `[DOMAIN REFUND POLICY]`, `[CONFIRM]` and `[N]` (licences page).

## Phase 3 plan

1. `/signin`, `/forgot-password`, `/reset-password`, `/verify-email`, `/two-factor` on the glass UI, with 301s from `/login` and `/login/mfa`, keeping every sign-in safety check.
2. `/cart`, kept in the browser and priced by the server, with the cart link in the top bar.
3. Migration: `beta_requested`, `beta_approved` and `beta_declined` order states, beta request and feedback tables. The beta order has no ledger row: the record is an `order_events` row.
4. `/checkout` and `/checkout/success`: in `beta_free` the honest notice and the request form; in `live` the existing paths stay behind the setting.
5. Emails through the queue: to sales@, and to the buyer from support@.
6. Approve or decline on the admin order page, file access after approval, and the feedback email 7 days later from the scheduled job. The full admin tab comes with Phase 6.
7. Retire the test-card form and the demo controls (moved to Phase 7, with the old order pages they sit on).
