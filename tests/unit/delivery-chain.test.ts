import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { APPROVED, memoryObjectStore as store } from '@/lib/files/objectStore';
import { scanAllowsApproval, scannerFromEnv, testScanner } from '@/lib/files/scanner';
import { REVIEW_CHECKLIST, completeUpload, memProduct, reviewFile, runChecks, startUpload } from '@/lib/files/service';
import { memPut } from '@/lib/files/objectStore';
import { versionsOf } from '@/lib/files/store';
import { getOrder } from '@/lib/orders/service';
import { approvedFileFor, gateFor } from '@/lib/release/gate';
import { approveRelease, entitlementAction } from '@/lib/release/service';
import { paidOrder } from './fixtures/paidOrder';

/*
 * Verified payment -> approved source file -> admin release -> entitlement -> authorised download, in process (Priority 4, 2026-10-28).
 * The scanner here is the TEST DOUBLE (lib/files/scanner.ts testScanner), allowed only through the explicit `allowTestScanner` flag that
 * production ignores. A pass here is NOT evidence that any real scanner accepts a file: on staging and production the scanner stays fail
 * closed (B-3) until an approved provider is connected, and this chain is then rerun on staging with it (docs/DELIVERY_TEST_PLAN.md).
 */
const ALL = Object.fromEntries(Object.keys(REVIEW_CHECKLIST).map((k) => [k, true]));

async function approvedVersion() {
  const productId = crypto.randomUUID();
  const sellerId = `seller-${productId.slice(0, 6)}`;
  memProduct({ id: productId, sellerId, name: 'Script pack', ownerType: 'seller' });
  const bytes = zipSync({ 'package.json': strToU8('{"name":"pack"}'), 'src/index.ts': strToU8(`export const n = ${Math.random()};`) });
  const s = await startUpload(sellerId, { productId, purpose: 'listing', name: 'pack.zip', size: bytes.length }, store);
  if (!s.ok) throw new Error(s.error);
  memPut(s.value.file.quarantinePath, bytes);
  const c = await completeUpload(sellerId, s.value.file.id, store);
  if (!c.ok) throw new Error(c.error);
  const checked = await runChecks(c.value.id, { store, scanner: testScanner });
  expect(checked.ok && checked.value).toMatchObject({ state: 'awaiting_review', scanVerdict: 'clean' });
  // without the explicit test flag even a clean test-double result cannot be approved
  expect(await reviewFile('files-1', c.value.id, 'approve', { note: 'Opened in the sandbox.', checklist: ALL, label: '1.0' }, { store })).toMatchObject({ ok: false, status: 409 });
  const r = await reviewFile('files-1', c.value.id, 'approve', { note: 'Opened in the sandbox.', checklist: ALL, label: '1.0' }, { store, allowTestScanner: true });
  if (!r.ok || !r.value.version) throw new Error(r.ok ? 'no version' : r.error);
  return { productId, sellerId, versionId: r.value.version.id, fileId: c.value.id, sha256: r.value.file.sha256! };
}

describe('delivery chain with an approved file (scanner test double, synthetic data)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('nothing before release; after release one active entitlement and exactly the approved bytes; revoked means no file', async () => {
    const v = await approvedVersion();
    expect((await versionsOf(v.productId))[0]).toMatchObject({ id: v.versionId, fileId: v.fileId, label: '1.0' });

    const { buyer, orderId } = await paidOrder(true, { version: v });
    const o = (await getOrder(orderId))!;
    expect(o).toMatchObject({ state: 'release_pending', buyerId: buyer, fileVersionId: v.versionId }); // paid, reconciled, pinned to the version
    expect((await gateFor({ id: o.id, status: o.state, quotationId: o.quotationId, releaseApprovedAt: o.releaseApprovedAt })).allowed).toBe(false);
    expect(await approvedFileFor(orderId)).toBeNull();

    const rel = await approveRelease('delivery-1', orderId, 'Checked the pinned version 1.0.');
    expect(rel.ok).toBe(true);
    if (!rel.ok) return;
    expect(rel.value.entitlement).toMatchObject({ buyerId: buyer, fileVersionId: v.versionId, status: 'active' });
    const after = (await getOrder(orderId))!;
    expect(await gateFor({ id: after.id, status: after.state, quotationId: after.quotationId, releaseApprovedAt: after.releaseApprovedAt })).toEqual({ allowed: true });

    const f = await approvedFileFor(orderId);
    expect(f).toMatchObject({ sha256: v.sha256, name: `v1.0-${v.sha256.slice(0, 8)}.zip` });
    const path = f!.url.replace(`memory://${APPROVED}/`, '');
    expect(await store.sha256(APPROVED, path)).toBe(v.sha256); // the download serves the approved copy, byte for byte
    expect((await auditList(500)).some((e) => e.action === 'release_approved' && e.targetRef === orderId)).toBe(true);

    expect((await entitlementAction('delivery-1', orderId, 'revoke', 'Licence breach confirmed.')).ok).toBe(true);
    expect(await approvedFileFor(orderId)).toBeNull();
  });

  it('the test double can never approve anything in production', () => {
    expect(scannerFromEnv({ NODE_ENV: 'production', SCAN_PROVIDER: 'test' }).name).toBe('none');
    vi.stubEnv('NODE_ENV', 'production');
    expect(scanAllowsApproval({ verdict: 'clean', approvedScanner: false }, { allowTestScanner: true })).toBe(false);
    expect(scanAllowsApproval({ verdict: 'clean', approvedScanner: true })).toBe(true);
    expect(scanAllowsApproval({ verdict: 'error', approvedScanner: true })).toBe(false);
  });
});
