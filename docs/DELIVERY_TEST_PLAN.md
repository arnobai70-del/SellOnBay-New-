# Delivery test: verified payment, approved file, release, entitlement, download

The chain that must work before any ready-made product is sold, and how it is tested. The scanner stays fail-closed everywhere.

## 1. In process (done, 2026-10-28)

`tests/unit/delivery-chain.test.ts` runs the whole chain with synthetic data and the scanner TEST DOUBLE (`testScanner`), allowed only
through the explicit `allowTestScanner` flag, which production ignores:

1. The seller uploads a ZIP, the automatic checks pass, and the scan says `clean` (test double).
2. Approval is refused without the explicit test flag (409), then approved with it: version 1.0 is stored in `product-files` and checked
   by SHA-256.
3. The buyer requests, gets a quotation with Super Admin approval and accepts. The bank transfer is reported and reconciled by Finance.
   The order is `release_pending` and pinned to that exact version.
4. Before release: the gate is refused and there is no file.
5. Delivery approves the release. One active entitlement for that buyer and version; the file served is the approved copy, byte for
   byte; the action is in the audit log.
6. Revoking the entitlement stops the file.
7. The test double can never approve in production (`scannerFromEnv`, `scanAllowsApproval`).

**This is not evidence that a real scanner accepts a file.**

## 2. On staging (BLOCKED until a scanner is approved, B-3)

Run once the approved scanner adapter exists (docs/SCANNER_EVALUATION.md). There is no bypass: the staging server keeps
`scannerFromEnv()`, and `SCAN_PROVIDER=test` is refused by a production build.

Preconditions: the staging server behind its password (and Cloudflare Access, once approved), the synthetic accounts and TOTP from the
staging journey, and the approved scanner's staging credentials on the server only.

| Step | Who | Check |
| --- | --- | --- |
| 1 | Seller (synthetic, aal2) | Upload a synthetic ZIP to a live synthetic listing; the upload goes to quarantine |
| 2 | Scanner | The verdict is stored with the provider reference; EICAR and an over-limit ZIP give `infected` and `error` |
| 3 | Files admin | Approves the clean file with the checklist; version 1.0 is in `product-files`, SHA-256 equal |
| 4 | Buyer | Request, quotation (Super approval), accept, report the transfer |
| 5 | Finance | Reconcile; a new buyer's safety hold is cleared by Finance only |
| 6 | Delivery | Release approval; one entitlement; audit entries |
| 7 | Buyer | Signed link works for the buyer only (another buyer: 404, signed out: 403), the bytes hash to the approved SHA-256, `download_events` has the row |
| 8 | Delivery | Suspend, then the link fails; resume; revoke for good |

The staging journey (`tests/e2e/staging-journey.spec.ts`) gets these steps as a new test once B-3 is closed. It now asserts the
opposite: without an approved file nothing reaches the buyer.
