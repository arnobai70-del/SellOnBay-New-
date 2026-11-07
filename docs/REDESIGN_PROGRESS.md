# Glass UI redesign progress

Rules and decisions: `docs/DECISIONS.md`, sections "Glass UI redesign" and "Global market, free beta and email". Handoff: `SELLONBAY_REDESIGN.md`.

| Phase | Branch | State |
| --- | --- | --- |
| 0 Audit | none | Done |
| 1 Design system and layouts | `redesign/phase-1-design-system` | Done, approved by the owner on 2026-11-07 |
| 2 Public pages | `redesign/phase-2-public-pages` | Blocked: `.env.local` still has production keys |
| 3 Buying flow | none yet | Not started |
| 4 Buyer dashboard | none yet | Not started |
| 5 Seller dashboard | none yet | Not started |
| 6 Admin | none yet | Not started |
| 7 Polish | none yet | Not started |

## Phase 2 plan

1. Money rules first, so no page promises what the code does not do: the flat 78/22 plan version, Pro and Business hidden for new sellers, Thursday UTC payouts with the 7-day hold, the $20 minimum (migration on the dev project only).
2. Settings and email the public pages depend on: `PAYMENTS_MODE`, the beta banner, the email routing config, the ZeptoMail provider, and console logging in development.
3. `(glass)` layout with `PublicNav` and `PublicFooter`, GA unchanged, the visitor tracker and live chat kept.
4. Pages with real data: home, `/websites`, `/websites/[slug]`, `/websites/category/[category]`, `/sellers`, `/sellers/[username]`, `/domains` ("Check availability"), `/sell`, `/buyer-protection`, `/help` with contact form, `/guides`, `/legal/*`, 404 and maintenance.
5. 301s from every old address (`/templates/*`, `/product/*`, `/blog*`, `/faq`, `/how-it-works`, `/terms`, `/privacy`, `/refunds`, `/seller-agreement`). `/websites`, `/domains` and `/guides` leave the retired list. Metadata, sitemap and robots follow.
6. Retire home three.js and JS motion and the dark and light switch. Remove "template" from visible text and titles.

## Blockers

- `.env.local` points at production (`knvxtgzrylvkhyrcezlq`, URL and both keys) and also sets `AUTHENTICATOR_OFF`. Nothing has been run against it.

## Open questions for the owner

1. The ledger cannot hold a $0 entry: the code, the database function and the table check all refuse it. Proposed: no ledger row for a beta order, an `order_events` row instead.
2. Who pays for a coupon discount: platform, seller or split.
3. During beta, what happens to the Extended licence and custom work, which cannot be paid for yet. Proposed: show "Available after beta".
