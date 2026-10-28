import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guardDutyScanner, verdictFromEvent, verdictOf, type ScanBucket } from '@/lib/files/scannerGuardDuty';
import { scanAllowsApproval, scannerFromEnv } from '@/lib/files/scanner';

/* A stand-in S3 bucket: GuardDuty's tag appears after `after` polls. Nothing reaches AWS. */
function bucket(tag: string | null, after = 1, failPut = false) {
  let polls = 0;
  const removed: string[] = [];
  const b: ScanBucket = {
    put: async () => {
      if (failPut) throw new Error('AccessDenied');
      return { eTag: '"abc"', versionId: 'v1' };
    },
    scanTag: async () => (++polls >= after ? tag : null),
    remove: async (key) => void removed.push(key),
  };
  return { b, removed, polls: () => polls };
}
const input = { fileId: 'f1', sha256: 'a'.repeat(64), size: 3, open: async () => new Uint8Array([1, 2, 3]) };
const fast = { pollMs: 1, sleep: async () => undefined };

describe('GuardDuty for S3 scanner (prepared, not connected)', () => {
  it('only NO_THREATS_FOUND is clean; every other result is an error or infected', () => {
    expect(verdictOf('NO_THREATS_FOUND')).toBe('clean');
    expect(verdictOf('THREATS_FOUND')).toBe('infected');
    for (const s of ['UNSUPPORTED', 'ACCESS_DENIED', 'FAILED', '', 'no_threats_found', null, undefined]) expect(verdictOf(s)).toBe('error');
  });

  it('clean, infected and skipped files, and the copy is always deleted', async () => {
    for (const [tag, verdict] of [
      ['NO_THREATS_FOUND', 'clean'],
      ['THREATS_FOUND', 'infected'],
      ['UNSUPPORTED', 'error'],
      ['ACCESS_DENIED', 'error'],
      ['FAILED', 'error'],
    ] as const) {
      const s = bucket(tag, 3);
      const r = await guardDutyScanner({ bucket: s.b, ...fast }).scan(input);
      expect(r.verdict, tag).toBe(verdict);
      expect(s.removed, tag).toEqual([`f1/${'a'.repeat(64)}.zip`]);
    }
  });

  it('no result before the deadline is an error, never clean', async () => {
    let t = 0;
    const s = bucket(null);
    const r = await guardDutyScanner({ bucket: s.b, timeoutMs: 100, pollMs: 10, now: () => t, sleep: async (ms) => void (t += ms) }).scan(input);
    expect(r).toMatchObject({ verdict: 'error', detail: 'GuardDuty gave no result in time.' });
    expect(s.removed).toHaveLength(1);
  });

  it('an upload or AWS error is an error', async () => {
    const r = await guardDutyScanner({ bucket: bucket('NO_THREATS_FOUND', 1, true).b, ...fast }).scan(input);
    expect(r.verdict).toBe('error');
  });

  it('cannot approve a file until the owner marks the provider approved, and is not reachable from the environment', async () => {
    const r = await guardDutyScanner({ bucket: bucket('NO_THREATS_FOUND').b, ...fast }).scan(input);
    expect(scanAllowsApproval({ verdict: r.verdict, approvedScanner: guardDutyScanner({ bucket: bucket(null).b }).approved })).toBe(false);
    expect(scannerFromEnv({ SCAN_PROVIDER: 'aws-guardduty', NODE_ENV: 'production' }).name).toBe('none');
    expect(readFileSync('lib/files/scanner.ts', 'utf8')).not.toMatch(/scannerGuardDuty/);
  });

  it('an EventBridge result counts only for exactly our object and only when the scan completed', () => {
    const exp = { bucket: 'sob-scan', key: 'f1/x.zip', eTag: 'abc', versionId: 'v1' };
    const ev = (scanStatus: string, scanResultStatus: string, over: Record<string, unknown> = {}) => ({
      source: 'aws.guardduty',
      'detail-type': 'GuardDuty Malware Protection Object Scan Result',
      detail: {
        scanStatus,
        resourceType: 'S3_OBJECT',
        s3ObjectDetails: { bucketName: 'sob-scan', objectKey: 'f1/x.zip', eTag: 'abc', versionId: 'v1', ...over },
        scanResultDetails: { scanResultStatus, statusReasons: scanStatus === 'SKIPPED' ? ['PASSWORD_PROTECTED'] : null },
      },
    });
    expect(verdictFromEvent(ev('COMPLETED', 'NO_THREATS_FOUND'), exp)?.verdict).toBe('clean');
    expect(verdictFromEvent(ev('COMPLETED', 'THREATS_FOUND'), exp)?.verdict).toBe('infected');
    expect(verdictFromEvent(ev('SKIPPED', 'UNSUPPORTED'), exp)).toMatchObject({ verdict: 'error', reasons: ['PASSWORD_PROTECTED'] });
    expect(verdictFromEvent(ev('FAILED', 'NO_THREATS_FOUND'), exp)?.verdict).toBe('error');
    expect(verdictFromEvent(ev('COMPLETED', 'NO_THREATS_FOUND', { objectKey: 'other.zip' }), exp)).toBeNull();
    expect(verdictFromEvent(ev('COMPLETED', 'NO_THREATS_FOUND', { eTag: 'zzz' }), exp)).toBeNull();
    expect(verdictFromEvent(ev('COMPLETED', 'NO_THREATS_FOUND', { versionId: 'v0' }), exp)).toBeNull();
    expect(verdictFromEvent({ ...ev('COMPLETED', 'NO_THREATS_FOUND'), source: 'evil' }, exp)).toBeNull();
    expect(verdictFromEvent(null, exp)).toBeNull();
  });
});
