# SEO and CMS: deploy, check and roll back

What this covers: the page controls, the five template categories, the sitemap, robots.txt, redirects, the top-bar settings and the link check
(`CLAUDE.md`, section "SEO and CMS controls"). No migration is needed: every setting lives in the existing `app_settings` table
(keys `seo:ctl:<path>`, `seo:alloc`, `seo:nav`, `seo:redirects`, `seo:robots`, `seo:linkcheck`). Nothing was deleted from any table.

## Before you deploy

1. Work on a staging copy first (a Supabase staging project and a staging site), never the live database.
2. Back up: `npm run db:backup` and `npm run storage:backup` (see `docs/RECOVERY_DRILL.md`), and keep the files somewhere safe.
   Check one backup restores (`npm run db:restore` on staging).
3. Take screenshots of the live site: home, a category page, a product page, the header and footer, cart, checkout and the account pages, on a
   desktop and a phone. You compare them again after the deploy.
4. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.

## Deploy

1. Deploy the build to staging, then follow `docs/DEPLOYMENT.md` (migration order is unchanged by this work).
2. On staging, check by hand:
   - Sign in, register, reset a password, add to cart, check out with a test card, open the order, download a purchased file.
   - Admin: SEO and blog, Edit pages (save a meta title), Template categories, Top bar, Redirects, robots.txt, Link check.
   - `/sitemap.xml` lists only published pages; `/robots.txt` keeps the private parts out and names the sitemap.
   - Archive a test page: it answers 404 for a visitor and 200 (noindex) for a signed-in admin; restore it.
3. Run the browser tests against staging: `npm run test:e2e` (with `REAL_URL` and `DEMO_URL` set, see `README.md`).
4. Compare the screenshots. Fix any difference you did not ask for before going on.
5. Deploy to production the way `docs/DEPLOYMENT.md` says, then repeat the checks above on production and run the Link check once.
6. Add the sitemap to Google Search Console and Bing Webmaster Tools (SEO and blog has the box for the verification codes).

## Roll back

Settings first (no deploy needed):

- A page that should be open again: Edit page, set Publication to Published, save.
- A wrong address change: Redirects, remove the rule. A wrong listing address: Edit page, change it back (the old address redirects to the new one, so
  set it back to the original and remove any leftover rule).
- A wrong category address: Template categories, Change the address, empty box.
- A wrong top bar: Top bar, show the entries and save.
- A wrong robots.txt line: robots.txt, delete the line and save.
- Every change is in the audit log with the value before and after, so an earlier value can always be copied back.

Code: `git revert` the SEO commits (newest first), build and deploy again. The saved settings stay in `app_settings` and are ignored by older code.
To switch the whole feature off at once, delete the rows whose key starts with `seo:ctl:`, `seo:alloc`, `seo:nav`, `seo:redirects`, `seo:robots`
in `app_settings` (the pages then behave exactly as before this work); take a backup first.

## Adding a product or a page later (no code change)

1. A seller lists a product; an admin approves it (it becomes live).
2. Template categories: it joins a category by the seller's own category, or put it where you want (Live listings).
3. Edit page on the listing: meta title and description, share picture and alt text, questions, extra text. Save.
4. When its category shows 3 or more real listings the category enters the sitemap on its own; the listing itself is in the sitemap as soon as it is live.
5. To hide a listing from the public without deleting it: Edit page, Publication = Archived. Its orders, downloads and licences keep working.
