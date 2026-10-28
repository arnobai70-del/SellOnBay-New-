# Legal review pack (SellOnBay 2.0) — DRAFT, NOT APPROVED

Prepared 2026-10-29 for qualified legal counsel. Nothing here is legal advice and nothing here is published. The live texts are the pages
listed below (an admin can publish new versions in Admin > Content, with four-eyes approval; migration 0063). Every number below comes from
`lib/config.ts` as of this date. If the code changes, the numbers change with it.

Owner inputs (to fill in):

- Lawyer or firm: `[NAME_OR_FIRM]`
- Applicable jurisdictions (seller and buyer countries, the company's country): `[COUNTRIES]`
- Approved legal texts: `[FILES_OR_PENDING]`
- Data retention approval, category by category: `[CATEGORY_BY_CATEGORY]`
- "Escrow" wording approved: `[YES/NO]`
- Privacy notice approved: `[YES/NO]`

## 1. What exists and what is missing

| Topic | Where it lives today | State |
| --- | --- | --- |
| Terms of Service | `/terms` (app/(site)/terms), docs/legal/terms-of-service.md | Draft, [LAWYER REVIEW] |
| Privacy Policy | `/privacy`, docs/legal/privacy-policy.md | Draft. Missing: country analytics (section 2.6), file scanning by a processor (2.4), a retention schedule (2.5) |
| Seller Agreement | `/seller-agreement` | Draft, [LAWYER REVIEW]. Thin on plans (2.2) and advertising (2.7) |
| Buyer licensing | `lib/licences.ts`, `lib/licenceTiers.ts`; summary in the Terms and on the handover certificate | Draft. Licence text is versioned and snapshot on each quotation |
| Refund rules | `/refunds`, `lib/refundText.ts` | Draft. Matches the business rules: refunds after acceptance only in dispute cases, plus the 7-day bug-fix guarantee; never "no refunds ever" |
| Manual-first payment terms | nowhere | MISSING: draft 2.1 |
| Subscription (seller plan) terms | a few lines in the Terms and Seller Agreement | THIN: draft 2.2 |
| Custom development terms | Terms (quotations) | THIN: draft 2.3 |
| Revision policies | per product, shown on each quotation | THIN in the Terms: draft 2.3 |
| File handling and malware scanning | Terms (2 mentions) | THIN: draft 2.4 (the scanner provider is not chosen yet, B-3) |
| Data retention | docs/LAUNCH_READINESS.md section 6 (internal) | MISSING from the public texts: draft 2.5 |
| Country analytics privacy | nowhere public (both features are off: B-5, B-12) | MISSING: draft 2.6. Publish only when a feature is switched on |
| Advertising responsibilities | nowhere | MISSING: draft 2.7 (both ad features are off: B-9, B-10) |
| Acceptable use | `/acceptable-use` | Draft exists (docs/LAUNCH_READINESS.md wrongly said it was not written) |
| Copyright notice and takedown | `/dmca` | Draft exists. Confirm the designated agent and the counter-notice process |

## 2. Draft clauses for counsel

Plain language, in the site's style. Each is a starting point for counsel, not a text to publish.

### 2.1 Paying for an order (manual-first)

1. Every purchase starts with a request. SellOnBay sends a written quotation with the price, what is included, the delivery time, the
   revision policy and the licence. A quotation can be accepted for 7 days.
2. You pay by bank transfer or by a local wallet, to the account shown on your order, and enter the reference from your bank or wallet.
   No card details reach SellOnBay.
3. SellOnBay checks the money has arrived (reconciliation) before the seller starts. Until then the order is not paid, whatever a screenshot shows.
4. A new account's order of $50 or more may wait for a short safety check before the seller starts.
5. The money is held until you accept the delivery (48 hours to check, then it counts as accepted). The seller is paid in the weekly payout,
   at least 7 days after acceptance.
6. [LAWYER REVIEW] Whether "held" or "escrow" may be used without a licence in the company's country; who bears bank fees and currency
   conversion; what happens to a payment that cannot be matched.

### 2.2 Seller plans

1. Plans: Free ($0, 15% commission, up to 5 listings), Pro ($19 a month or $193.80 a year, 10%, up to 25 listings, featured placement)
   and Business ($49 a month or $499.80 a year, 5%, up to 100 listings, featured placement). Yearly is 15% less than 12 months.
2. The commission is taken from the seller's side, on products, custom work, extra work and paid revisions. It is fixed on each quotation:
   a later plan change does not change an accepted order.
3. [LAWYER REVIEW] Billing, renewal, cancellation, downgrade when listings exceed the new limit, refunds of plan fees, consumer
   cancellation rights for subscriptions, tax on plan fees.

### 2.3 Custom development and revisions

1. Custom work is quoted in writing after the requirements are confirmed by the buyer. It is paid before work starts.
2. Each product has a revision policy (how many changes are included, for how long, what scope, the price of more). The policy on the
   accepted quotation is the one that applies.
3. A defect (it does not work as described) is fixed at no cost. An included change counts against the policy. Anything beyond the policy is
   a paid revision or a new feature, quoted separately.
4. [LAWYER REVIEW] Ownership and licence of custom code; acceptance of custom work; liability caps; what happens when requirements change
   mid-job.

### 2.4 Files, checks and malware scanning

1. Sellers upload their files to a private quarantine. Before a file can be approved: the archive is checked (size up to 500 MB, number
   of files, nesting, no encrypted entries), it is checked for leaked secrets, it is scanned for malware by a security provider, a person
   reviews it, and its SHA-256 fingerprint is recorded.
2. A file that cannot be scanned (for example password-protected, too large to unpack, or the scan fails) is not approved.
3. Buyers receive files only after payment is verified and an admin releases them, through a signed link that expires.
4. A rejected file is deleted after 7 days, unless a legal hold applies.
5. [LAWYER REVIEW] Naming the scanning provider as a processor in the Privacy Policy once chosen (B-3). The scan copy is held for at most
   1 day in the provider's cloud, in the region chosen (`[REGION]`). Sellers' confidentiality of source code.

### 2.5 How long we keep data (for the Privacy Policy)

| Data | Kept |
| --- | --- |
| Hashed connection and device records (fraud and abuse prevention) | 90 days |
| Visitor statistics (hashed, no cookie) | 90 days |
| Rejected or failed seller files | 7 days |
| Sales PDF exports | 24 hours |
| Orders, payments, ledger, audit log, downloads, consents, certificates | `[PERIOD]`: accounting and evidence records, not deleted by the app today |
| Messages and support tickets | `[PERIOD]`: not deleted by the app today |
| Account deletion | on request; financial and evidence records kept for `[PERIOD]`, other data deleted or anonymised |

[LAWYER REVIEW] The `[PERIOD]` values: tax and accounting rules in the company's country, limitation periods for disputes. No purge of
these records is switched on until approved.

### 2.6 Country statistics (publish only when switched on)

1. Google Analytics 4 (`G-FEK9C0CM04`) runs only after you accept analytics cookies, and reports your approximate country to Google.
2. Optional first-party country statistics: the country comes from a header set by our hosting provider. Each visit day stores the
   two-letter country code with the same keyed visitor hash as the visitor statistics (no address, no account, no cookie), kept 90 days.
3. [LAWYER REVIEW] Legal basis (consent for GA4), transfers to Google, the cookie notice wording.

### 2.7 Advertising (sellers' own accounts; switched off today)

1. A seller may promote their own listing on their own Meta or Google Ads account. The seller is the advertiser and pays the platform
   directly. SellOnBay never pays for, owns or runs these ads.
2. SellOnBay reviews the ad text before submission and limits budgets (from $5 to $500 a day, up to 30 days, $5,000 in total).
3. The seller is responsible for the ad, its claims and the platform's policies.
4. [LAWYER REVIEW] Liability for ad content, platform terms, consumer protection rules on advertising, data shared with the platforms.

## 3. Other questions for counsel

- EU and UK buyers: digital content, withdrawal right waiver at release (the accept box records consent: `lib/consentText.ts`).
- App store risk for template apps: who bears a rejection by Apple or Google.
- Licences, model and property releases for stock media (Seller Agreement section, [LAWYER REVIEW]).
- Chargebacks and the seller reserve (off today: `CONFIG.reserve`).
