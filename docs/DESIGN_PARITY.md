# Design parity (Glass UI, 2026-11-09)

Each page of `design-reference/` is ported, not redesigned. The page root carries the design file's name (`data-sob="<file>"`), so that file's own CSS and keyframes apply. That CSS is generated from the design's `<style>` blocks into `app/sob.css` by `scripts/design-css.mjs`. Only the sample names and numbers were replaced with real data; where there is no data yet, the block keeps its card and shows an empty state.

These checks were done by reading the design HTML and CSS against the JSX and CSS, as the owner asked: same elements, classes, text and keyframes. No screenshots were taken; the owner does the visual check.

## The 44 design files

| # | Design file | Route | Notes |
|---|---|---|---|
| 1 | index.html | `/` | Hero with floaters, Websites/Domains tabs (`HeroSearch`), the category chips, three pillars, the trust strip, featured, domains band, how it works, top sellers, sell band. Words come from Admin › Content › Pages. Floaters show the first two real listings. |
| 2 | websites.html | `/websites` | `WebsitesBrowser`: filters work as GET forms, with paging. |
| 3 | website.html | `/websites/[slug]` | `ShotGallery`, anchor tabs, licence tiles, buy box, protection, seller. JSON-LD is kept. |
| 4 | domains.html | `/domains` | Results say "Checked on order" (registrar not connected). |
| 5 | sellers.html | `/sellers` | Platform listings appear as the SellOnBay store, so the list is never empty. |
| 6 | seller.html | `/sellers/[username]` | Works for every seller, the store included. |
| 7 | sell.html | `/sell` | Earnings calculator `.calc`; `#how` anchor. |
| 8 | help.html | `/help` | Search, group tiles, questions, contact form. |
| 9 | guides.html | `/guides`, `/guides/[slug]` | Empty states inside the cards when nothing is published. |
| 10 | legal.html | `/legal/*` (7 pages); `/legal` → 301 `/legal/terms` | |
| 11 | buyer-protection.html | `/buyer-protection` | |
| 12 | cart.html | `/cart` | The coupon box is shown but disabled, with a note. |
| 13 | checkout.html | `/checkout` | Free beta request form (`BetaForm`); the live branch is behind `PAYMENTS_MODE`. |
| 14 | order-success.html | `/checkout/success`; `/order-success` → 301 | |
| 15 | signin.html | `/signin` | One card with the seg tabs; OAuth buttons. |
| 16 | account-access.html | `/reset-password`, `/two-factor`, `/verify-email`; `/account-access` → 301 `/signin?mode=forgot` | |
| 17 | 404.html | not-found, `app/error.tsx`, `MaintenanceNotice` | The error card and the maintenance card. |
| 18 | buyer.html | `/dashboard/buyer` | |
| 19 | buyer-orders.html | `/dashboard/buyer/orders` | |
| 20 | buyer-websites.html | `/dashboard/buyer/websites` | Star rating posts to the review route. |
| 21 | buyer-domains.html | `/dashboard/buyer/domains` | Auto-renew and DNS are shown with empty states. |
| 22 | buyer-support.html | `/dashboard/buyer/support` | |
| 23 | buyer-notifications.html | `/dashboard/buyer/notifications` | |
| 24 | buyer-account.html | `/dashboard/buyer/account` | |
| 25 | seller-dashboard.html | `/dashboard/seller` | |
| 26 | seller-websites.html | `/dashboard/seller/websites` (+ `/new`) | `UploadSection` wraps the same `SellForm`. |
| 27 | seller-orders.html | `/dashboard/seller/orders` | |
| 28 | seller-payouts.html | `/dashboard/seller/payouts` | `PayoutMethodForm`. |
| 29 | seller-customization.html | `/dashboard/seller/customization` | Only extra work exists; there are no offers or milestones yet. |
| 30 | seller-store.html | `/dashboard/seller/store` | |
| 31 | seller-notifications.html | `/dashboard/seller/notifications` | |
| 32 | seller-support.html | `/dashboard/seller/support` | |
| 33 | seller-account.html | `/dashboard/seller/account` | |
| 34 | admin.html | `/admin` | Overview with a period switch. |
| 35 | admin-orders.html | `/admin/orders` | |
| 36 | admin-listings.html | `/admin/listings` | |
| 37 | admin-users.html | `/admin/users` | |
| 38 | admin-support.html | `/admin/support` | |
| 39 | admin-domains.html | `/admin/domains` | |
| 40 | admin-finance.html | `/admin/finance` | Payouts at `/admin/finance/payouts`. |
| 41 | admin-reports.html | `/admin/reports` | |
| 42 | admin-marketing.html | `/admin/marketing` | Coupons, POS (cash only). |
| 43 | admin-security.html | `/admin/security` | |
| 44 | admin-settings.html | `/admin/settings` | |

The owner's extra admin pages use the admin design shell and its classes: Visitors (`/admin/visitors/*`), Server health (`/admin/system/details`), site search (`/admin/search`), Maintenance Manager (`/admin/settings/maintenance/modules`), Guides editor (`/admin/seo/post`), Pages (`/admin/content/pages`), Contact & social, and listing prices with launch discounts (`/admin/seo/product`).

Pages the design does not draw have no design file. These are the order page, the pay page, chat, the full-page preview, the CMS preview and the SEO tools. They use the design classes, plus `app/sob-parts.css`, where the old rules were rewritten with the design's tokens.

## Kept visually, not wired yet

- Monthly target ring
- Seller bulletin
- Language select (English only)
- Registrar sync, domain auto-renew, DNS and a domain cart
- Coupons at the cart
- Campaigns
- Session list
- Overview widget toggles
- Run backup
- Seller CSV export
- Customisation offers and milestones
- POS for anything but cash

The design's SMS controls and "auto-connect" claims are left out by the owner's rule. The newsletter box is replaced by the social row.

## Functions

| Feature | Old route | New route | Works |
|---|---|---|---|
| Sign up, sign in, sign out | `/login` | `/signin` (301 from `/login`) | ✅ |
| Password reset | `/login?mode=forgot` | `/signin?mode=forgot`, `/reset-password` | ✅ |
| Two-factor code | `/login/mfa` | `/two-factor` | ✅ |
| Browse and search websites | `/browse`, `/templates/*` | `/websites`, `/websites/category/*` (301s) | ✅ |
| Website detail and live demo | `/product/[id]` | `/websites/[slug]`, `/demo/*`, `/preview/[id]` | ✅ |
| Add to cart | n/a | `/cart?add=` | ✅ |
| Checkout (free beta request) | `/checkout` | `/checkout` → `/checkout/success` | ✅ |
| Order shows for the buyer | `/orders/[id]` | `/orders/[id]`, `/dashboard/buyer/orders` | ✅ |
| Seller upload | `/sell/new` | `/dashboard/seller/websites/new` (same `POST /api/listings`) | ✅ |
| Admin approve listing | `/dashboard/admin/listings` | `/admin/listings`, `/admin/listings/all` | ✅ |
| Admin approve beta request | `/dashboard/admin/beta` | `/admin/orders/beta` | ✅ |
| Emails (ZeptoMail, mocked in tests) | n/a | `lib/email`, `email_outbox` | ✅ |
| Domain search | `/domains` | `/domains` | ✅ |
| Guides editor save | `/dashboard/admin/seo/post` | `/admin/seo/post` | ✅ |
| Pages editor save | `/dashboard/admin/cms` | `/admin/content/pages`, `/admin/content/cms` | ✅ |
| Maintenance on and off | `/dashboard/admin/maintenance` | `/admin/settings/maintenance/modules` | ✅ |
| Payouts screen | `/dashboard/admin/payouts` | `/admin/finance/payouts` | ✅ |
| Visitors (analytics) | `/dashboard/admin/analytics` | `/admin/visitors/details` | ✅ |
| Server health | `/dashboard/admin/system` | `/admin/system/details` | ✅ |
| Every other old admin tool (41) | `/dashboard/admin/*` | `/admin/*` (301, `lib/glass/moved.ts`) | ✅ |

The ✅ entries are backed by:

- the unit tests (1180);
- `tests/e2e/glass-flows.spec.ts` on the demo server (9 checks, all passing on 2026-11-09);
- the existing real-server specs (`admin`, `listing`, `orders`, `maintenance`). These need a running server with the database and were not re-run in this session.
