# Malware scanner evaluation (blocker B-3)

Status 2026-10-28: desk evaluation only, from the providers' public documentation. No account was opened, nothing was uploaded, no
adapter was connected. Prices and limits change: confirm them on the provider's own pages and in writing before choosing.

Why it blocks: `lib/files/scanner.ts` (`MalwareScanner`) fails closed, so no file version can be approved, and release, entitlement,
signed download, revisions and product purchase requests cannot run end to end (staging journey: BLOCKED by design).

## What we need

- ZIP archives up to 500 MB, with nested archives and thousands of files (source code, `node_modules`, assets).
- Seller source code is confidential: it must not be shared with a community, kept by the provider, or used for training.
- A verdict per file version (clean, infected, error) and a reference we can keep as evidence; an error or timeout stays fail-closed.
- A data processing agreement and a known region for the files.

## Options

| Option | 500 MB ZIP | Where the files go | Notes |
| --- | --- | --- | --- |
| AWS GuardDuty Malware Protection for S3 | Yes: objects up to 100 GB, archives up to 10,000 files and 5 levels deep (raised September 2025) | Our own AWS account; the bucket is scanned in place | Needs an S3 bucket we control (Supabase Storage is not that bucket): copy the upload to a private quarantine bucket, read the result tag, delete. Pay per GB scanned. |
| Microsoft Defender for Storage (on-upload scanning) | Yes: blobs up to 50 GB, archives included | Our own Azure storage account | Same pattern with an Azure Blob quarantine container; result as blob index tag or Event Grid event. Monthly cap configurable. |
| OPSWAT MetaDefender Core (self-hosted) | Yes, set by our own configuration | Our own server; nothing leaves it | Many engines and archive handling; licensed per engine and server; needs a machine we run and update. Strong fit for confidential code, highest cost and effort. |
| OPSWAT MetaDefender Cloud | Only on Enterprise (Standard 140 MB, Professional 256 MB) | OPSWAT cloud; private processing deletes the file after the scan | Check that private processing is in the contract, and the archive file count per tier (500 / 10,000 / 50,000). |
| Cloudmersive Virus Scan API | Up to 2 GB over plain upload (larger with chunked upload), paid plan over 10 MB | Cloudmersive cloud | Archive limits not published: ask in writing. |
| ClamAV (open source, self-hosted) | Yes, with raised `MaxFileSize`, `MaxScanSize`, `MaxFiles` | Our own server | No cost and nothing leaves us, but lower detection than commercial engines. Good as an extra first layer, not as the only scanner. |
| VirusTotal | Not suitable | Files are shared with the security community | Never for seller code. |

## Recommendation

1. First choice: a scanner that runs in an account we control, so the code never goes to a separate scanning company. AWS GuardDuty for
   S3 or Microsoft Defender for Storage both cover 500 MB ZIPs well inside their limits. Pick the cloud that also suits hosting.
2. If the owner wants the strongest detection and can run a server: OPSWAT MetaDefender Core.
3. Keep fail-closed. Any error, timeout, a skipped archive (over the file count or depth limit), or a password-protected archive counts as
   `error`, never `clean`.
4. Before any real file is sent: written approval, DPA signed, region chosen, and a test with synthetic archives only (EICAR test file,
   nested ZIP, a ZIP over the file count limit, a password-protected ZIP, a 500 MB synthetic ZIP).

## Adapter plan (after approval)

- `lib/files/scanner.ts`: a new `MalwareScanner` for the chosen provider. Keys stay on the server only.
- Upload goes to the quarantine bucket, the scan result comes back by webhook or by polling, and the verdict is written to the file version
  with the provider reference. Then the quarantine copy is deleted.
- Unit tests: verdict mapping, skipped archive becomes `error`, timeout becomes `error`, and the webhook signature is checked.

Sources: AWS "Quotas in Malware Protection for S3"; AWS What's New, September 2025 (limits expanded); Microsoft Learn "Malware scanning
in Defender for Storage"; OPSWAT MetaDefender Cloud store page and licensing docs; Cloudmersive "How to scan large files for viruses
and malware".
