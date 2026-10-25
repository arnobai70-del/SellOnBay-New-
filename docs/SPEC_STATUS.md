# Production-Safe Restructuring spec: what is done and what is not (2026-10-23)

Checked against this repository (`emonkhanlamu-hue/sellonbay-v5`, `main`). The spec names another repository (`arnobai70-del/sellonbay`); this work is not in that one.
Legend: DONE, PARTLY, NOT DONE, DIFFERENT (built another way, because of an earlier decision).

| # | Spec item | Status | Where things stand |
|---|---|---|---|
| 1 | UI/UX unchanged, screenshot baseline and comparison | DONE (desktop, phone); tablet NOT DONE | 18 pages compared before and after at 1440 and 390 px: only the category bar differs (one new entry, spacing tightened so Help is not cut off) |
| 2 | Exactly 5 public navigation items | DONE (2026-10-23, see the update below) | The bar has the 5 template categories as one "Templates" entry, plus the other entries (you chose "keep the rest" earlier). Not reduced to 5 items |
| 2 | First item = homepage, other four = category pages | NOT DONE | |
| 3 | 25 URLs: `/`, `/templates/saas`, `/business`, `/portfolio`, `/industry`, products at `/templates/<category>/<slug>` | DIFFERENT | Categories are `/templates/ecommerce`, `saas-startup`, `business-corporate`, `portfolio-agency`, `industry-websites` (address ending editable). Products are `/product/<slug>`. Home is not the e-commerce page |
| 4 | Made-up products out of every public surface, records kept | DONE | Removed everywhere on a live site with a database (lists, search, categories, `/find`, tools, sitemap, checkout); seed data and rows kept |
| 4 | 20 original templates with real source code, ZIP, docs, screenshots, preview | NOT DONE | None written. The database holds 94 digital listings, all `in_review`, none live |
| 5 | Admin: SEO per page, FAQ, product edit (words, price, links, extras, app screenshots), category words and address, product allocation, top bar show/hide/order | DONE | |
| 5 | Admin: global content (site name, hero text, CTA, footer text, contact, social links), menu names and URLs, category image, product source-code reference and version, draft preview of every field | NOT DONE / PARTLY | Page heading and intro are editable on listed pages; menu names, URLs, footer and contact are in code |
| 5 | Max 5 public nav categories enforced | NOT DONE | |
| 6 | Server metadata, canonical, Open Graph, breadcrumbs, Organization and WebSite data, honest Product data | DONE (mostly) | Product page has Product and FAQ data from real facts; category pages have breadcrumb, list and FAQ data |
| 6 | Admin SEO dashboard (URL, type, index, canonical, completeness, sitemap, warnings) | PARTLY | Counts, duplicates, missing fields, link check, per-page status; no single table with all columns |
| 7 | Sitemap of exactly 25 real URLs and a 25-URL publication gate | NOT DONE | Sitemap is dynamic with no ceiling (every published page and live listing), by your earlier instruction. Needs a decision before changing |
| 8 | Retire legacy public routes (410/404), keep code and data | NOT DONE | Shelves, developers, blog, tools and the rest stay public. Admin can archive the listed pages one by one |
| 9 | Hidden content never leaks (API, RSC, JSON-LD, sitemap) | PARTLY | Unpublished listings and examples are filtered from public lists, sitemap, search; not audited for every API and RSC payload |
| 10 | Delivery after real payment | NOT VERIFIED | Existing delivery kept; only the test payment gateway exists, so a real purchase is not possible yet |
| 11 | Database safety, backup, additive only | DONE | Backup taken (2713 rows, 37 accounts, 331 files); all 52 migrations already applied; nothing changed or deleted |
| 12 | Separate working branch, compare GitHub with production | NOT DONE | Work went to `main`; production not compared (no access) |
| 13 | Tests | PARTLY | 741 unit tests, 117 browser tests (demo mode), build, lint pass; real-server tests and checkout with real payment need staging |
| 14 | Controlled release, production verification | NOT DONE | Not deployed |
| 15 | Acceptance checklist | 6 of 18 met | UI unchanged (bar excepted), no made-up products public, history kept, no paid file public, backup and rollback written, build and security checks pass |

## What it would take to finish
1. Decide: reduce the public bar to exactly 5, retire the other public pages (410), and make the sitemap exactly 25 with a gate.
2. Move to the spec's addresses (`/templates/<category>/<product>`) with 301s from the current ones.
3. Write 20 original templates with source, ZIP, docs, screenshots and previews (the largest piece of work), then list and approve them.
4. Global content editor (site name, hero, CTA, footer, contact, social, menu names and URLs).
5. Tablet screenshots, staging checkout test, branch and release.


## Update 2026-10-23 (restructuring done; templates are the owner's to write)

Done now: the bar is exactly the five template categories as plain links (home page = E-commerce Templates, `/templates/saas|business|portfolio|industry`); products live at `/templates/<category>/<product>` (old `/product/<id>` redirects 301, or 404 when the product is in no category); the sitemap is the home page, four category pages and up to four products per category with a publication gate (`publicationGate`: "N of 25 ready", never invents an address); the old public site (shelves, developers, domains, blog, tools, welcome, categories, guest and their public APIs) answers 410 Gone with noindex, code and data kept; legal, FAQ, how-it-works and the seller page stay reachable but noindex; search, related products, the home page, the footer and the header follow the same structure; the E-commerce home page shows its own four products. Tests: 744 unit, 124 browser (the old suite on a build with `NEXT_PUBLIC_LEGACY_PUBLIC=1`, the new `public-structure.spec.ts` on the normal build); page bodies compared before and after are identical, only the bar, header icons and footer columns differ.

Still open: the 20 templates (the owner writes them), the global content editor (site name, hero text, footer, contact, social, menu names and URLs), tablet screenshots, staging checkout, release. With no real products yet the sitemap holds only the home page and the admin SEO hub shows 1 of 25 ready.
