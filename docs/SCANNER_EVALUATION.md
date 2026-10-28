# Malware scanner evaluation (blocker B-3) — SUPERSEDED

> **REMOVED BY OWNER — SECURITY RISK ACCEPTED** (owner, 2026-10-29). No scanner will be connected. This evaluation is kept as a record only; nothing in it is planned. The prepared GuardDuty adapter was deleted.

Quotas rechecked 2026-10-29 against AWS's own pages ("Quotas in Malware Protection for S3", "Monitoring S3 object scans", the GuardDuty pricing page). Object up to 100 GB; 100,000 extracted files; 100 nesting levels; 25 protected buckets per account per region (none adjustable). Skip reasons that must count as `error`: `PASSWORD_PROTECTED`, `OBJECT_SIZE_LIMIT_EXCEEDED`, `EXTRACTED_FILE_LIMIT_EXCEEDED`, `EXTRACTED_LEVEL_LIMIT_EXCEEDED`, `EXTRACTED_BYTE_LIMIT_EXCEEDED`, `EXTRACTION_RATIO_LIMIT_EXCEEDED`, `UNSUPPORTED_STORAGE_CLASS`, plus every `ACCESS_DENIED` reason (`SSE_C_ENCRYPTED_OBJECT`: do not use SSE-C on the scan bucket). Price: $0.09 per GB scanned in us-east-1 (from $0.60 on 2025-02-01); free tier of 1,000 requests and 1 GB a month, with no trial period. The pricing page gives $0.215 per 1,000 objects only in a worked example, with no region named: confirm it for the chosen region. Some password-protected formats cannot be detected and are scanned as encrypted bytes, which does not prove them clean, so our own check that refuses encrypted ZIP entries must stay.

Status 2026-10-28: desk evaluation from the providers' public documentation. No account was opened, nothing was bought or activated,
nothing was uploaded, no adapter was connected. Prices and limits change: confirm both on the provider's own pages and in writing before
choosing. Figures marked "confirm" could not be read from the provider's page (rendered by script) and are older public list prices.

Why it blocks: `lib/files/scanner.ts` (`MalwareScanner`) fails closed, so no file version can be approved, and release, entitlement,
signed download, revisions and product purchase requests cannot run on staging (staging journey: BLOCKED by design). The same chain is
covered in process with the test double only (tests/unit/delivery-chain.test.ts), which proves nothing about a real scanner.

## What we need

- ZIP archives up to 500 MB (`CONFIG.files.maxArchiveMb`), nested archives, up to 50,000 entries (`CONFIG.files.maxEntries`).
- Seller source code is confidential: not shared with a community, not kept after the scan, not used for training.
- A verdict per file (clean, infected, error) with a reference kept as evidence. An error, a timeout or a skipped archive stays fail-closed.
- A data processing agreement and a known region.

## Comparison

| Criterion | AWS GuardDuty Malware Protection for S3 | Microsoft Defender for Storage (on-upload) | OPSWAT MetaDefender Core (self-hosted) |
| --- | --- | --- | --- |
| 500 MB ZIP | Yes: objects up to 100 GB | Yes: blobs up to 50 GB | Yes: set in our own configuration |
| Archive limits | Up to 100,000 extracted files and 100 levels deep, neither adjustable (rechecked 2026-10-29). An extracted-byte limit and a compression-ratio limit also exist, with no published number. Over any limit the archive is skipped (`UNSUPPORTED`), so a skip must count as `error`. Our limits (50,000 entries, 4 GB unpacked, ratio 200) are inside the published ones | Archives scanned. Nesting and file count limits are not published: ask in writing | Set by us (depth, file count, unpacked size); many engines |
| Private source code | Scanned inside our own AWS account. The bytes stay in our bucket | Scanned inside our own Azure account. The bytes stay in our storage account | Nothing leaves our server |
| Data residency | The AWS region we choose (for example eu-west-1 or ap-south-1) | The Azure region we choose | Wherever our server runs |
| Scan status | Object tag `GuardDutyMalwareScanStatus` (NO_THREATS_FOUND, THREATS_FOUND, UNSUPPORTED, ACCESS_DENIED, FAILED) and an EventBridge event | Blob index tag and an Event Grid event (No threats found, Malicious, Error, Not scanned) | REST API: data id, then the result with each engine's verdict |
| Secure transfer | Server-side copy from Supabase quarantine to a private S3 bucket over TLS, IAM role with write-only rights to one prefix; or presigned PUT | Same pattern with a SAS token limited to one container and a short expiry | Over TLS inside our own network |
| Fit with our Supabase quarantine | Add a step: quarantine (Supabase) to S3 scan bucket, read the tag, delete the S3 copy. The approved copy stays in Supabase `product-files` | Same, with Azure Blob | Stream from Supabase quarantine to Core, no extra bucket |
| Cost model | $0.09 per GB scanned plus $0.215 per 1,000 objects (us-east-1, from February 2025), plus S3 storage and requests (small; the copy is deleted after the scan) | About $10 per storage account a month plus about $0.15 per GB scanned (confirm) | Annual licence by quote (public estimates for OPSWAT run about $12k to $84k a year), plus a server |
| Failure handling | A FAILED or UNSUPPORTED tag, a missing event, or a timeout counts as `error`, and an admin retries | Error and not scanned count as `error`. Scanning halts at the monthly cap, which also counts as `error` | Engine or timeout errors count as `error`. We have to keep the engines updated |
| Operational effort | Low. One AWS account, one bucket, one IAM role, an EventBridge rule or polling | Low. One Azure subscription, a storage account and an Event Grid subscription | High. A server to run, patch, license and monitor |

Not suitable as the only scanner: OPSWAT MetaDefender Cloud (500 MB needs Enterprise; Standard is 140 MB and Professional 256 MB),
Cloudmersive (archive limits not published), ClamAV on its own (lower detection), VirusTotal (files are shared: never for seller code).

## Estimated monthly cost (scanning only, confirm before choosing)

Assumptions: every upload is scanned once, with no rescans. Low is 50 ZIPs of 100 MB (5 GB). Medium is 500 ZIPs of 150 MB (75 GB).
High is 3,000 ZIPs of 250 MB (750 GB).

| Usage | GuardDuty for S3 | Defender for Storage (confirm) | MetaDefender Core |
| --- | --- | --- | --- |
| Low (5 GB) | about $0.50 | about $11 | about $1,000 to $7,000 (licence) + server |
| Medium (75 GB) | about $7 | about $21 | same, by quote |
| High (750 GB) | about $68 | about $123 | same, by quote |

Moving the files also costs something. Copying out of Supabase counts as Supabase egress, which is included in the plan quota and charged
per GB above it. Inbound transfer to AWS or Azure is free. A temporary S3 or Blob copy that is deleted within hours costs cents.

## Recommendation

**AWS GuardDuty Malware Protection for S3**: the lowest cost at every volume, well inside the 500 MB need, verdicts we can read and
store, the bytes stay in an account we own, and little to run. Conditions:

1. Count `UNSUPPORTED`, `FAILED`, `ACCESS_DENIED`, a skipped archive, a password-protected archive and a timeout as `error` (fail closed).
2. Keep `CONFIG.files` as it is (rechecked 2026-10-29: 50,000 entries is under the 100,000-file quota, and nesting is limited to 100 levels). The earlier advice to lower `maxEntries` to 10,000 was based on the pre-September-2025 quota and is withdrawn. Ask AWS in writing for the extracted-byte and compression-ratio limits. Until they answer, an `EXTRACTED_BYTE_LIMIT_EXCEEDED` or `EXTRACTION_RATIO_LIMIT_EXCEEDED` skip stays `error`, and the seller is told to split the archive.
3. Pick the region with the owner and the lawyer (data residency). Sign the AWS DPA. Make a dedicated bucket that blocks public access,
   uses SSE-S3 or SSE-KMS and deletes objects after 1 day, plus an IAM role limited to that bucket.
4. Defender for Storage is the equal second choice if the site's hosting moves to Azure. MetaDefender Core is the choice only if the owner
   wants several engines and accepts the licence and the server.

## Adapter plan (after written approval)

- `lib/files/scannerAws.ts` implements `MalwareScanner` with `approved: true`, and is added to `scannerFromEnv()` behind
  `SCAN_PROVIDER=aws-guardduty`. AWS keys live on the server only, preferably as a role, never as a `NEXT_PUBLIC_` variable.
- `runChecks` streams the quarantine object to `s3://<scan-bucket>/<fileId>/<sha256>.zip`, then waits for the tag (EventBridge to a
  signed webhook, or polling with a deadline). It stores the verdict and the scan id, and deletes the S3 copy.
- Unit tests map every status to a verdict, check that a missing tag times out to `error`, that an unsigned webhook is refused, and that
  a scan reference is stored.
- Staging acceptance uses synthetic files only: the EICAR test file, a nested ZIP, a ZIP with more than 10,000 files, a
  password-protected ZIP and a 500 MB synthetic ZIP. Then the delivery chain in docs/DELIVERY_TEST_PLAN.md is run.

Sources: AWS "Quotas in Malware Protection for S3"; AWS What's New (September 2025, limits expanded; February 2025, price reduction);
aws.amazon.com/guardduty/pricing; Microsoft Learn "On-upload malware scanning" and Defender for Cloud pricing page; OPSWAT MetaDefender
Cloud store page and licensing docs; Vendr's OPSWAT page (third-party estimate); Cloudmersive "How to scan large files".
