import 'server-only';
import type { MalwareScanner, ScanResult } from './scanner';

/*
 * AWS GuardDuty Malware Protection for S3 (blocker B-3; docs/SCANNER_EVALUATION.md). PREPARED, NOT CONNECTED: no AWS SDK, no account, no
 * bucket. scannerFromEnv() does not return it, so nothing can reach AWS or cost money until the owner approves the provider, the region
 * and the cost, and the S3 calls (ScanBucket below) are written and tried on staging with synthetic files only.
 *
 * Flow per file: copy the quarantined ZIP to a private scan bucket (GuardDuty scans every new object there), wait for GuardDuty's object
 * tag, map it, and always delete the copy. FAIL CLOSED: only NO_THREATS_FOUND is clean; THREATS_FOUND is infected; UNSUPPORTED,
 * ACCESS_DENIED, FAILED, an unknown value, no tag before the deadline, or any error is "error". Human review and the SHA-256 check
 * still follow in lib/files/service.ts; a clean scan alone never approves a file.
 */
export const SCAN_TAG = 'GuardDutyMalwareScanStatus';

/* The few S3 operations the scanner needs, so the logic is testable without AWS. */
export interface ScanBucket {
  put(key: string, body: ReadableStream<Uint8Array> | Uint8Array, size: number): Promise<{ eTag: string; versionId?: string }>;
  /* The GuardDuty tag's value, or null while the object has not been scanned yet. */
  scanTag(key: string, versionId?: string): Promise<string | null>;
  remove(key: string, versionId?: string): Promise<void>;
}

/* GuardDuty's result (tag value or scanResultStatus) as our verdict. Anything but the two known results is an error. */
export function verdictOf(status: string | null | undefined): ScanResult['verdict'] {
  if (status === 'NO_THREATS_FOUND') return 'clean';
  if (status === 'THREATS_FOUND') return 'infected';
  return 'error';
}

export function guardDutyScanner(o: {
  bucket: ScanBucket;
  approved?: boolean; // true only once the owner has approved the provider; scanAllowsApproval needs it
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): MalwareScanner {
  const timeoutMs = o.timeoutMs ?? 15 * 60_000;
  const pollMs = o.pollMs ?? 10_000;
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  return {
    name: 'aws-guardduty',
    approved: o.approved === true,
    async scan(input) {
      const key = `${input.fileId}/${input.sha256}.zip`;
      let put: { eTag: string; versionId?: string } | null = null;
      try {
        put = await o.bucket.put(key, await input.open(), input.size);
        const deadline = now() + timeoutMs;
        for (;;) {
          const tag = await o.bucket.scanTag(key, put.versionId);
          if (tag !== null) {
            const verdict = verdictOf(tag);
            return { verdict, provider: 'aws-guardduty', reference: `${put.eTag}${put.versionId ? ':' + put.versionId : ''}`, detail: verdict === 'clean' ? undefined : `GuardDuty: ${tag}` };
          }
          if (now() >= deadline) return { verdict: 'error', provider: 'aws-guardduty', detail: 'GuardDuty gave no result in time.' };
          await sleep(pollMs);
        }
      } catch (e) {
        return { verdict: 'error', provider: 'aws-guardduty', detail: `Scan could not run: ${e instanceof Error ? e.message : 'unknown error'}` };
      } finally {
        if (put) await o.bucket.remove(key, put.versionId).catch(() => undefined); // the copy never outlives the scan
      }
    },
  };
}

/*
 * For a later EventBridge path (a rule sending "Object Scan Result" events to us instead of polling): the verdict from one event, or null
 * when the event is not exactly the scan of the object we sent (other source, other bucket, other key, other version or ETag). The
 * delivery itself must also be authenticated (a secret header on the API destination, compared in constant time) before this is called.
 */
export function verdictFromEvent(
  ev: unknown,
  expected: { bucket: string; key: string; eTag: string; versionId?: string },
): { verdict: ScanResult['verdict']; status: string; reasons: string[] } | null {
  const e = ev as { source?: string; 'detail-type'?: string; detail?: Record<string, unknown> };
  if (e?.source !== 'aws.guardduty' || e['detail-type'] !== 'GuardDuty Malware Protection Object Scan Result') return null;
  const d = e.detail as { scanStatus?: string; resourceType?: string; s3ObjectDetails?: Record<string, unknown>; scanResultDetails?: { scanResultStatus?: string; statusReasons?: string[] | null } };
  const obj = d?.s3ObjectDetails ?? {};
  if (d?.resourceType !== 'S3_OBJECT' || obj.bucketName !== expected.bucket || obj.objectKey !== expected.key) return null;
  if (String(obj.eTag ?? '').replace(/"/g, '') !== expected.eTag.replace(/"/g, '')) return null;
  if (expected.versionId && obj.versionId !== expected.versionId) return null;
  const status = d.scanResultDetails?.scanResultStatus ?? '';
  // A completed scan is the only one that can be clean; SKIPPED and FAILED are errors whatever the result field says.
  const verdict = d.scanStatus === 'COMPLETED' ? verdictOf(status) : 'error';
  return { verdict, status, reasons: d.scanResultDetails?.statusReasons ?? [] };
}
