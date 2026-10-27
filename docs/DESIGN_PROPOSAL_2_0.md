# SellOnBay 2.0 visual design proposal (for owner approval)

Status: PROPOSAL. Nothing in this file has been built. CLAUDE.md fixes the brand and the home page look ("Do not change these visuals without
being asked"), so every item below waits for the owner's written choice.

## What stays exactly as it is

- Logo, the crystal L, colours (cobalt #2B3DFF, ink #0F1330, gold #FFB52E, mint #0E9F76, rose #E23C61, fog #F3F5FA), Poppins headings and
  Plus Jakarta Sans body text.
- The marketplace shell (`SiteNav` / `mk-hdr`, `Footer` / `mk-foot`), the five template categories and their addresses.
- Every indexed address, page title, description, heading, canonical, redirect and structured data (SEO baseline, Blueprint 11.1).
- GA4 `G-FEK9C0CM04` loaded once after consent; no GTM; no ad pixel.

## Proposed changes, smallest first

| # | Change | Pages | SEO risk | Needs |
|---|---|---|---|---|
| 1 | Product page: one clear "Request to buy" panel with the 2.0 steps (request, quotation, payment checked, release) and the price shown as "from" | `/templates/<category>/<product>` | Low (same content, same h1) | Approval of wording; O-11 decision on `offers.price` |
| 2 | Request and quotation screens in the dashboard style: a step bar, the quotation as one card, the 7-day validity as a countdown | `/checkout`, `/dashboard/buyer/requests/*` | None (not indexed) | Approval |
| 3 | Dashboards: one layout for buyer, seller and admin (left menu grouped, work queues as cards, tables that turn into lists on phones) | `/dashboard/*`, `/messages`, `/account/*` | None (not indexed) | Approval |
| 4 | Category pages: filter chips and sort without changing the address of the page itself (filters in the query string, canonical unchanged) | `/`, `/templates/*` | Medium (watch duplicate URLs; canonical stays the page) | Approval and a crawl comparison |
| 5 | Home page: tighten the first screen; keep `HeroDomain`, the "Popular right now" row and the section order | `/` | Medium (the most linked page) | Approval and a crawl comparison |

## How each step would ship

1. Built behind the existing layout, one page group at a time, in its own commit.
2. Phone widths 360 and 390 checked against `document.documentElement.scrollWidth` (CLAUDE.md phone lessons), keyboard and contrast checked.
3. The SEO crawl compared with the baseline before and after (titles, descriptions, canonicals, status codes, sitemap).
4. Screenshots before and after for the owner.

## Questions for the owner

1. Which of items 1 to 5 to do, and in what order?
2. Any reference sites or screenshots for the "premium" feel you want?
3. O-11: may product pages keep a "from" price in structured data, or should `offers.price` be removed while prices come from quotations?
