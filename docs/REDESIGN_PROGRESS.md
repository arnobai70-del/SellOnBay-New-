# Glass UI redesign progress

Rules and decisions: `docs/DECISIONS.md`, sections "Glass UI redesign" and "Global market, free beta and email". Handoff: `SELLONBAY_REDESIGN.md`.

| Phase | Branch | State |
| --- | --- | --- |
| 0 Audit | none | Done |
| 1 Design system and layouts | `redesign/phase-1-design-system` | Done, approved by the owner on 2026-11-07 |
| 2 Public pages | `redesign/phase-2-public-pages` | Done, waiting for the owner's click-through |
| 3 Buying flow | `redesign/phase-3-buying-flow` | Done |
| 4 Buyer dashboard | `redesign/phase-4-buyer-dashboard` | Done |
| 5 Seller dashboard | `redesign/phase-5-seller-dashboard` | Done |
| 6 Admin | `redesign/phase-6-admin` | Done |
| 7 Polish | `redesign/phase-7-polish`, then `redesign/phase-6c-search-cms-prices` | Done (cleanup group A and C deleted; group B, test data and `design-reference/` wait for "prepare launch") |

## Database

Working database: the project in `.env.local` (owner, 2026-11-07).

- Backup taken before the first migration: `backups/2026-11-07-before-redesign.sql` (2.1 MB, all schemas, dump complete) and `backups/storage/` (689 of 689 files, 65 MB). `backups/` is ignored by git.
- Applied, one at a time, with the tests after each: `0074_flat_plan`, `0075_public_store_and_contact`, `0076_free_beta`, `0077_service_role_grants`, `0078_profile_details`. The history already had 0001 to 0073, so nothing older was pending. A dump was taken before 0076 (`backups/2026-11-08-before-0076.sql`) and before the owner's data changes (`backups/2026-11-08-before-owner-data.sql`).

### Data changes made on the owner's written instruction (2026-11-08)

One transaction, each change in `audit_log`:

- All 43 live listings: `owner_type` set to `platform` and `beta_free_ok` to true (`listings_marked_platform_beta`). They now show SellOnBay as the seller and can be requested free.
- `fashion-store-j9nr`: price $10 to $20 (`listing_price_changed`).
- The owner's Business subscription `a0a8dbd1-17d7-4166-b05a-22501b3bab1f` ended, with a `subscription_events` row, so the account is on the flat 78/22 plan (`subscription_ended`).
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
- Phase 5: a buyer who switches to selling becomes a `seller` account with `can_sell` (the role field keeps its meaning for every older check), and seller accounts may buy. Admin accounts never buy or sell.
- Phase 5: `/sell/new` keeps working with the same form, so older links and the demo build do not break; the dashboard links go to `/dashboard/seller/websites/new`.
- Phase 5: a bKash account is a Bangladesh mobile number (01 then 9 digits, with or without +880).
- Phase 5: identity verification is asked for before the first payout but does not block listing; Finance approves it in Phase 6.

## Questions for the owner (not blocking)

1. The database password appeared in the chat. Change it once the work is done, and update `.env.local`.

## Test rows to remove before launch

All marked: emails end with `@test.sellonbay.dev`, titles start with `[TEST]`.

- Accounts: `buyer1@`, `buyer2@`, `buyer3@` (country, phone and company set by the account test), `buyer4@`, `buyer5@` (switched to selling), `buyer6@` (beta flow after the cleanup, order `0db69944-7c24-414d-b259-499617e1fc1a`), `admin2@` (Content scope, banned after each run, an authenticator factor), `seller1@` (an authenticator factor "[TEST] e2e", store name `test-seller-qa`, PayPal payout, country US, ID verifications `e00e774f-d1f6-407b-b13d-97483d7132d8` and `2d3a8f2c-50af-4bd7-956f-9e9f92662f18` with their files in `seller-ids`; one rejected and one approved by the Phase 6 check, so seller1 is ID-verified). `admin1@` also has an authenticator factor. One `page_counts` row for `/legal/privacy` came from the check, `admin1@test.sellonbay.dev` (the test admin is banned after each run; passwords are random and never stored).
- Listing: `test-beta-website-qa` ("[TEST] Beta website"), paused.
- Cash sale (Phase 6 check): order `57a4408b-1ce5-4853-b47f-58c139beca00` for `buyer4@`, receipt `TEST-R-MW76MTO1`, funded, with its four ledger lines (`cash-in:TEST-R-MW76MTO1`, `pay:57a4408b-…`) and the audit row. Settings rows left empty by the checks: `site:contact` `{}`, `marketing:coupons` `[]`, `site:blocks:/guides` `[]`.
- Orders: `2c57de3e-0fe5-429a-8ec0-eb011e19f977` (left waiting by the grant bug, before the fix), `c714c781-59ac-4908-8aeb-614f59dc1dc1`, `7395a0d0-0b8f-4b86-9892-2e984c9349b1`, `859a921d-ac4f-40e1-a595-e50e0c84b1a5`, `bf3b2ce6-5c47-4821-93b0-f0b894e4943f`, with their `beta_requests`, `beta_feedback`, `order_events`, notifications and audit rows.

## Placeholders still to fill

None. Filled on 2026-11-09 with the owner's words (see `docs/DECISIONS.md`, "Payout fee, domain refunds and licences").

## Phase 3: done

Cart in the browser priced by the server, free beta checkout (honest notice, no card or bank form), success page, `$0` order with no ledger row (an `order_events` row instead), sales and buyer emails, admin approve or decline at `/admin/orders/beta`, files after approval, feedback after 7 days, a review from the order page, and the sign-in screens at `/signin`, `/two-factor`, `/reset-password`, `/verify-email` with 301s keeping the query. Checked on the real database: the whole flow end to end, ledger unchanged (580 lines before and after), no files before approval, a decline needs a reason, one `main` per page.

Fixed on the way: tables of 0075 and 0076 had no server grants (contact form and beta both failed on the real database; 0077 and a test), a wrong condition hid the cart button, two `main` landmarks on the beta order page, the redirect to `/signin?mode=forgot` lost its query.

Not done: verify-email is the link Supabase sends, not a typed code; the test-card form and demo controls are retired in Phase 7; the admin tab moves into Orders & payments in Phase 6.

What to click: sign in at `/signin` as a buyer, open a website, Add to cart, Go to checkout, send the form; then as admin open `/admin/orders/beta` and Approve; back as the buyer open the order from the dashboard and Download files.

## Phase 3 plan (as written before the phase)

1. `/signin`, `/forgot-password`, `/reset-password`, `/verify-email`, `/two-factor` on the glass UI, with 301s from `/login` and `/login/mfa`, keeping every sign-in safety check.
2. `/cart`, kept in the browser and priced by the server, with the cart link in the top bar.
3. Migration: `beta_requested`, `beta_approved` and `beta_declined` order states, beta request and feedback tables. The beta order has no ledger row: the record is an `order_events` row.
4. `/checkout` and `/checkout/success`: in `beta_free` the honest notice and the request form; in `live` the existing paths stay behind the setting.
5. Emails through the queue: to sales@, and to the buyer from support@.
6. Approve or decline on the admin order page, file access after approval, and the feedback email 7 days later from the scheduled job. The full admin tab comes with Phase 6.
7. Retire the test-card form and the demo controls (moved to Phase 7, with the old order pages they sit on).

## Phase 4 plan

The seven buyer pages on the glass shell with live menu counts: overview, orders and payments (tabs, receipts), my websites (downloads through the order link), domains (what we hold and what is being registered by hand), support (the existing tickets), notifications, account (name, country, international phone and company for invoices, sign-in methods, your data). Migration 0078 adds the three profile fields.

## Phase 4: done

Overview, orders and payments, my websites, domains, support and disputes, notifications and account on the glass shell, with live menu counts. Account adds country, international phone and company (0078, written by the server for the own row only). Checked on the real database: every page at 390 and 1280 for a test buyer, signed out goes to `/signin?next=`, only the own orders are listed, another buyer's files and order page are refused, a phone without its country code is refused.

Fixed on the way: the country names were built at run time and differ between Node and the browser, which broke hydration on the account page; the list is now fixed.

Not done: sign-in methods and your data still open the older `/account/*` pages (Phase 7); domain renewal, DNS and transfer need a registrar; the design's login alerts, device list and coupon box are not built (no data behind them yet).

What to click: sign in as a buyer, open each item of the menu; on Account & security save a phone like +44 20 7946 0958.

## Phase 5 plan

The ten seller pages on the glass shell: overview, my websites (beta offer per listing, edits, versions, source files), upload (the one listing form with the reviewer's checklist), orders and escrow (every delivery action of the old page), earnings and payouts (bKash only for Bangladesh), identity verification, customization (extra work), disputes and messages, notifications, store and analytics, account. One account buys and sells (`can_sell`); the authenticator code is always required. Migration 0079.

## Phase 5: done

- Seller pages at `/dashboard/seller` and under it: overview, websites, websites/new, orders, payouts, customization, support, notifications, store, account. The old seller page's actions all moved over (deliver, GitHub invite, delivery files, record PDF, repository revocations, drafts, buyer questions, versions, source files).
- One account buys and sells: a buyer clicks "Switch to selling" on Account & security (`/api/account/sell`, audited, never for admins). The account becomes a seller with `can_sell`, can still open the buyer pages and buy (`mayBuy` allows buyer and seller, never from itself), and the seller pages ask for the authenticator code.
- `AUTHENTICATOR_OFF` is retired: the code ignores it. `.env.local` still has the line; it does nothing now and can be deleted.
- Payouts: PayPal, Payoneer, Wise or bank anywhere; bKash only when the profile country is BD (checked by the server). Identity: passport, national ID or driver licence plus country, checked by its bytes, stored in the private `seller-ids` bucket under server-chosen names; there is no route that returns the files.
- Store: store name (address), headline, about, skills, reply time, available for customization, pause; the chat filter keeps contact details out. Stats: views, people and Buy clicks per listing over 30 days from visitor analytics.
- Migration 0079 applied after a dump (`backups/2026-11-08-before-0079.sql`).

Checked: 1,098 unit tests (one timeout under load, passed alone), typecheck, lint, build. On the real database: a test buyer switches to selling and is then asked for the code; seller APIs without the code are refused; every seller page at 390 and 1280 for the test seller with a real authenticator code (status, width, one h1 and one main); beta offer on the own listing saves and on someone else's is refused; contact details and reserved store names refused; bKash refused for a US seller; a fake ID file refused, a real picture stored, not readable with the public key.

Fixed on the way: the upload page had two h1 (the form's own); the form now leaves it out inside the dashboard.

Not done: Finance's review of ID documents and approval (Phase 6 admin); old `/dashboard/seller/promote`, `reports` and `revisions` pages keep the old look (Phase 7); the listing form itself keeps its older look inside the glass page (Phase 7); the old seller plan panel is gone from the dashboard because there is one flat plan.

What to click: sign in as a buyer, Account & security, Switch to selling, set up the authenticator; then each seller menu item; on My websites turn "Free during beta" off and on; on Earnings & payouts add a PayPal email.

## Phase 6 plan

The admin on the glass shell at `/admin/*` (the route map), each page reading the real stores and linking to the older full tool for actions not moved yet: overview, orders and payments (beta requests with approve and decline, payments to check, all orders, the manual order desk), listing review, disputes and support, domains (recorded by hand in the buyer's name), finance and reconciliation, reports, users and roles (with Finance's identity checks), marketing (coupons, the platform pays the discount), security and logs (hashed addresses, audit log), settings (payments mode, allowed countries, server keys set or missing, GA id, a development-only test email). Added by the owner on 2026-11-08: Visitors (GA4 Data API, cookieless first-party count), Server health, and Contact & social. Migration 0080.

## Phase 6: done

- Thirteen admin pages at `/admin/*` on the glass shell, each with the permission it needs and links to the older full tools: overview, orders and payments (beta requests approve or decline, payments to check, all orders), listing review, disputes and support, domains (record a domain registered by hand in the buyer's name), finance and reconciliation, reports, users and roles with Finance's identity checks (document through a 5-minute link, every opening audited), marketing with coupons, security and logs, settings (payments mode, allowed countries, server keys set or missing, GA id, development-only test email), Visitors, Server health, Contact & social.
- Visitors: GA4 Data API (15-minute cache; "Connect GA4" until `GA4_PROPERTY_ID` and `GA4_SERVICE_ACCOUNT_JSON` are set), `data-track` clicks after consent, and the cookieless daily count (`page_counts`: page and country only).
- Server health: levels 80% and 90%, dev@ alert once an hour per critical metric (page and scheduled job), result kept one minute, machine figures only with `HOST_KIND=server`. Plan limits from `DB_PLAN_MB` (500) and `STORAGE_PLAN_MB` (1024). The last backup needs `SUPABASE_ACCESS_TOKEN`.
- Contact & social: addresses on @sellonbay.com read by email routing and the public pages; 14 networks with simple-icons 16.35.0 marks, order, on and off, preview; footer, Help, Sell and `sameAs`.
- New Dev admin scope; marketing is the existing Content scope. Migration 0080 applied after a dump (`backups/2026-11-08-before-0080.sql`).

Checked: 1,122 unit tests, typecheck, lint, build. On the real database: a buyer and a signed-out visitor are kept out of `/admin`; a Content admin opens Visitors and Marketing and is refused Server health, Settings, Users, ID documents and contact changes; every page at 390 and 1280 for a Super Admin (status, width, one h1 and one main); contact and social input refused off our domain or off the network; a contact change saved, put back and audited; coupons added, duplicate refused, removed; an ID document opens through a signed link; a rejection needs a reason; allowed countries saved and put back; the test email is a 404 outside development; a page open is counted.

Fixed on the way: resetting a setting tried to delete its row, which the server may not do (0040), and left a test address and the `TEST-QA` coupon behind; resets now save an empty value, and both were cleared.

Not done:
- API p95 is shown as "Not measured": the app does not time its requests. Timing them needs a small change to every API route; say if you want it.
- Manual cash order (POS): waits for a money rule. How should a cash payment enter the ledger (who holds the cash, when the seller's share becomes available)?
- Coupons are managed and their split is tested, but checkout uses them only once live payments start.
- From this machine the database answers in about 4.7 seconds right now, so Server health showed several figures as "Not known" in the check. On the server it should answer quickly.
- Found, not fixed: the site builder's "reset" (menu, footer, page blocks) also tries to delete a row and fails the same way. It is older than this phase.

What to click: `/admin` and each menu item; Settings › Contact & social: add a social link and watch the preview; Users & roles: open and decide an identity check; Server health.

## Phase 6, second part: done

- Cash at a point of sale (owner, 2026-11-08), Finance or Super Admin, hidden and refused while the free beta runs: the order is created for the buyer's own account at the listing price, the cash goes into `platform_cash_on_hand` and funds the order like a reconciled transfer, the admin who took it is in the audit log, and one receipt number counts once. Then the normal 48-hour review, 7-day hold and Thursday payout.
- Request timing: one hook in `instrumentation.ts` times every second API request (route shape, method, status class, milliseconds; no body, query, header, address or user), kept an hour in memory per server copy. Server health shows the real p95 against a 1-second target.
- The site builder reset now saves an empty value instead of deleting the row (the server may not delete settings rows).
- Fixed on the way, older than this work: the ledger read used the column names from before migration 0018 (`entry_key`, `side`) and failed on the real database. It is used for the payout amounts and debt settlement, so those would have failed for the first accepted order.

Checked: 1,130 unit tests and the build. On the real database, with the payments mode switched to live for the check and put back, and the test listing made live for the check and paused again: cash desk hidden and refused in the beta; wrong amount, unknown buyer and a repeated receipt refused; a cash sale funded the order with a 22% fee, cash on hand, held and escrow lines, and the admin in the audit log; the API p95 measured; a page's blocks saved and reset to an empty value.

## Added before the Phase 7 cleanup: done (owner, 2026-11-08)

- **Smart search** (`redesign/phase-6c-search-cms-prices`, migration 0081): Postgres full-text plus `pg_trgm`, weighted title > category and stack > seller > description > tags, across websites, sellers, a domain check, guides and help; live dropdown in the top bar, hero and `/websites` (2 characters, 200 ms, highlight, keyboard, recent searches, suggestions, popular categories); `/search` works without JavaScript; `/websites` ranks the same way.
- **Maintenance** (migration 0082): Admin › Settings › Maintenance closes the whole site (sign-in and admin stay open), an area (the eight new ones: cart, payouts, domains, guides, help, sign-up, search, whole site, plus the older modules) or one page by its address, now or on a schedule, with a notice some minutes before. Super Admins and allow-listed tester addresses still get in (addresses only when the host's address header is trusted). Glass 503 page with `Retry-After`; APIs 503; audited; status on Server health.
- **Guides editor** (Tiptap 3.32, sanitize-html 2.18, sharp listed directly; migration 0083): Admin › Content › Guides with every block asked for; slash menu; Alt+Up and Alt+Down or the arrows move a block (the drag-handle package needs the collaboration packages, so dragging is ProseMirror's own drag of a selected block); autosave every 15 seconds; revisions with restore; preview; schedule, publish, unpublish; pictures resized to WebP at most 1,600 pixels with alt text required; HTML cleaned on save and again on render through one component; Article JSON-LD.
- **Page editing** (no migration: CMS documents in `app_settings`): Admin › Content › Pages for home (every section, show, hide, reorder), websites, the words around each listing, domains, sellers, sell, buyer protection, help, guides, the 404 page, the top bar and the footer; numbers come from the rules through `{keep}`, `{reviewHours}` and the like; drafts with a live preview, publish by a second admin or a Super Admin, history and restore; SEO saved through the one SEO store. Legal pages open the versioned legal documents (the accept box records their versions).
- **Prices** (migration 0084): a price history kept by a database trigger, launch prices and sales with the 30-day rules, the EU lowest-price rule for the struck-through price, automatic start and end by the scheduled job, a price lock while a sale is planned or running; shown on cards, the website page, cart, checkout (for information in the beta), the seller's websites (Sale column) and the admin review (with the history).

Fixed on the way: CMS drafts and resets tried to delete settings rows (refused by 0040), now an empty marker; the guide page's raw HTML now goes through one cleaning component.

Checked: 1,177 unit tests, typecheck, lint, build, the migration check with `pg_trgm` in PGlite. On the real database: a typo and a partial word found websites, the results page worked without JavaScript; search closed for visitors with 503 and Retry-After while the Super Admin could still test it, a page closed with the glass 503 page, `/admin` refused as a page rule, everything reopened and audited; a guide draft with a script stored cleaned, a draft not public, published with Article data, unpublished gone; a home draft only in the preview, published live with a section hidden, then put back to the built-in words; a sale under $20 refused, a sale started at once (price $25), a second sale refused, stopping it put $49 back with the history 4900, 2500, 4900.

Not done: drafts of the top bar and footer show in the preview only after publishing (the layout cannot see the preview flag); the 404 page has no draft preview. `/admin/listings` was slow from this machine (many round trips to a slow database link); its ids are now read in parallel and the final check rebuilds it.

Test rows added: guide `0caf8f3d-7e4e-4d6d-b6b1-158e9161f27c` ("[TEST] Guide check", unpublished) with its revision; sale `e93cba1f-1a41-4d27-a837-070f7a451f43` on `test-beta-website-qa` (stopped) and its price history rows; the home page's CMS document (version 2 is the built-in words); `module_maintenance` row for search (open).

## Phase 7: done, deletions waiting for the owner

- The pages still in the older group (account, orders, payment, notifications, search, report abuse, maintenance, the listing form) wear the glass frame: the same top bar, beta banner and footer; their inner panels read as glass. The cookie notice is glass. Search shows names without the removed word.
- The test-card form is retired for real orders: `ENABLE_TEST_CHECKOUT` no longer lets test cards fund a real order, and the demo controls never show on an order not made in demo mode (before, an order for one of SellOnBay's own listings would have shown them; the server already refused the action).
- `glass.css` is loaded from the root layout (every class starts with `g-`), because the root 404 page did not get it through the deep import and showed unstyled and 597 pixels wide on phones.
- Cleanup: `docs/CLEANUP.md` lists 41 unused files (3.0 MB, mostly the old heroes, the cinematic home and its two videos), the retired old public site as a choice, `/design-preview`, what is kept on purpose, and the test data. Nothing is deleted until the owner says ok.

The one full check: every public page (16), every buyer page (7), every seller page (10) and every admin page (19) at 360, 390, 768 and 1280 pixels, and again at 390 with reduced motion, on a production build against the real database: status, no sideways scroll, one h1, one main, no removed word on public pages, nothing left invisible with reduced motion. 916 passed. Failed and fixed: the 404 page at 360 and 390 (the stylesheet above), rerun alone and passing. Not a defect: two invisible file pickers laid over the picture and zip drop areas of the upload form.
