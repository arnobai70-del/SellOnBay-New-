# SellOnBay redesign: handoff for Claude Code

Put this file in the repo root, next to a folder `design-reference/` that holds the unzipped
`SellOnBay-Glass-UI-netlify.zip` (44 static HTML pages). Those pages are the visual source of truth.

## Goal

Replace the current SellOnBay UI with the new glass UI in `design-reference/`, page by page,
and make every screen work with real data (Supabase), keeping what already works.

## Hard rules

1. Keep Google Analytics working on every page. Do not remove or rename the GA script or its ID.
2. Keep SEO: every route keeps or gets `metadata` (title, description, canonical, Open Graph).
   Public pages stay server-rendered. Do not change existing public URLs without a 301 redirect.
3. Never use the word "template" in visible text. Use "website" or "full-stack website".
4. Reuse existing Supabase auth, tables and server logic. Change logic only when the new UI needs it,
   and say why. Never drop a table or column without asking.
5. Work in phases (below). One phase per session, on its own git branch. Before writing code,
   show a plan: files to add / change / delete and any database migration. Wait for "ok".
6. After each phase: `npm run build` and `npm run lint` must pass. List what was tested by hand.
7. Respect `prefers-reduced-motion`. Animations are CSS only and must not hurt load speed.
8. Money rules: seller 78%, platform 22%, minimum website price $20, 48-hour buyer review,
   payouts every Thursday, domains registered in the buyer's name.

## Design system (copy from design-reference)

- Font: Inter (300 / 400 / 500 / 600), via `next/font`.
- Colors: ground `#EDF3F6`, text `#2B4250`, muted `#566C78`, mint button `#CDEBDF` with text `#1A5444`,
  accent line `#5FA88F`, statuses ok `#E2F3EC/#1A5444`, wait `#FBEFD9/#6E4B12`, bad `#F6E3E0/#7A2E24`,
  info `#DDEAF6/#24476B`.
- Glass card: `background: rgba(255,255,255,.6); backdrop-filter: blur(18px);
  border: 1px solid rgba(255,255,255,.95); border-radius: 20–22px; soft shadow`.
- Motion: rise-in with blur on cards (stagger), navbar drop, drifting background blobs,
  line-mask headline reveal, scroll reveal with `animation-timeline: view()` (no blur on scroll
  reveal), card hover lift + sheen. All in `design-reference/*.html` `<style>` blocks.
- Build these as shared components first: `GlassCard`, `Button`, `StatusPill`, `Kpi`, `Seg` (tabs),
  `Switch`, `DataTable`, `PublicNav`, `PublicFooter`, `DashboardShell` (sidebar + topbar, one per role).

## Route map

| Reference file | Route | Who |
|---|---|---|
| index.html | `/` | Public |
| websites.html | `/websites` | Public |
| website.html | `/websites/[slug]` | Public |
| cart.html | `/cart` | Buyer |
| checkout.html | `/checkout` | Buyer |
| order-success.html | `/checkout/success` | Buyer |
| domains.html | `/domains` | Public |
| sellers.html | `/sellers` | Public |
| seller.html | `/sellers/[username]` | Public |
| sell.html | `/sell` | Public / seller |
| buyer-protection.html | `/buyer-protection` | Public |
| help.html | `/help` (+ `#contact`) | Public |
| guides.html | `/guides` | Public |
| signin.html | `/signin` | Public |
| account-access.html | `/forgot-password`, `/reset-password`, `/verify-email`, `/two-factor` | Public |
| legal.html | `/legal/terms`, `/legal/privacy`, `/legal/refunds`, `/legal/licenses`, `/legal/seller-agreement` | Public |
| 404.html | `app/not-found.tsx` + maintenance page | Public |
| buyer*.html (7) | `/dashboard/buyer/...` overview, orders, websites, support, domains, notifications, account | Buyer |
| seller-*.html (9) | `/dashboard/seller/...` overview, websites (+ upload), orders, payouts, support, customization, store, notifications, account | Seller |
| admin*.html (11) | `/admin/...` overview, orders, listings, support, domains, finance, reports, users, security, marketing, settings | Admin roles |

## Data the new UI needs (check what already exists first)

profiles (role, NID status, payout method) · websites / listings (status, review notes, featured,
stack, rating) · orders + order_items (website or domain) · payments (method, TrxID, verified_by) ·
escrow (held_at, review_ends_at, released_at, paused) · payouts · disputes / tickets + messages
(+ internal notes) · domains (owner, expires, auto_renew, DNS) · coupons · reviews ·
customization_offers + milestones · notifications · bulletins · audit_log · staff roles + permissions.
Use Row Level Security so buyers, sellers and each admin role only see their own rows.

## Phases

0. Audit: read the current repo and `design-reference/`. Report what exists (routes, components,
   tables, logic), what maps to which new page, and what is missing. No code changes.
1. Design system + layouts: tokens, font, shared components, `PublicNav`, `PublicFooter`,
   `DashboardShell`. Keep GA.
2. Public pages: home, websites list + details, sellers, seller store, domains, sell, buyer protection,
   help, guides, legal, 404. Real data from Supabase.
3. Buying flow: cart, coupons, checkout (card + bKash/bank TrxID), order success, escrow timer,
   48-hour review, auto-release job.
4. Buyer dashboard (7 pages).
5. Seller dashboard (9 pages): upload wizard with the 6-point checklist, earnings, NID + payouts.
6. Admin (11 pages): payment verification, listing review, disputes, finance + reconciliation,
   roles/permissions, security log, marketing, settings, POS manual order.
7. Polish: accessibility, mobile, performance (Lighthouse), SEO check, remove old unused UI.
