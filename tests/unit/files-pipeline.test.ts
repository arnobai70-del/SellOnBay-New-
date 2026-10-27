import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { DAY_MS } from '@/lib/config';
import { APPROVED, QUARANTINE, memPut, memTamper, memoryObjectStore as store } from '@/lib/files/objectStore';
import { notConfiguredScanner, scannerFromEnv, testScanner } from '@/lib/files/scanner';
import { REVIEW_CHECKLIST, completeUpload, memProduct, purgeExpired, reviewFile, runChecks, startUpload } from '@/lib/files/service';
import { fileEvents, getFile, updateFile, versionsOf } from '@/lib/files/store';

const ALL = Object.fromEntries(Object.keys(REVIEW_CHECKLIST).map((k) => [k, true]));
const good = () => zipSync({ 'package.json': strToU8('{"name":"shop"}'), 'src/index.ts': strToU8(`export const n = ${Math.random()};`) });

async function uploaded(bytes: Uint8Array, seller = `s-${Math.random().toString(36).slice(2, 8)}`) {
  const productId = crypto.randomUUID();
  memProduct({ id: productId, sellerId: seller, name: 'Shop', ownerType: 'seller' });
  const s = await startUpload(seller, { productId, purpose: 'listing', name: 'shop.zip', size: bytes.length }, store);
  if (!s.ok) throw new Error(s.error);
  memPut(s.value.file.quarantinePath, bytes);
  const c = await completeUpload(seller, s.value.file.id, store);
  if (!c.ok) throw new Error(c.error);
  return { seller, productId, file: c.value };
}

describe('upload slot and completion', () => {
  it('only the seller who owns the product, only a .zip within 500 MB', async () => {
    const productId = crypto.randomUUID();
    memProduct({ id: productId, sellerId: 'owner', name: 'Shop', ownerType: 'seller' });
    expect(await startUpload('someone-else', { productId, purpose: 'listing', name: 'a.zip', size: 10 }, store)).toMatchObject({ ok: false, status: 404 });
    expect(await startUpload('owner', { productId, purpose: 'listing', name: 'a.exe', size: 10 }, store)).toMatchObject({ ok: false, status: 400 });
    expect(await startUpload('owner', { productId, purpose: 'listing', name: 'a.zip', size: 500 * 1024 * 1024 + 1 }, store)).toMatchObject({ ok: false, status: 413 });
    const ok = await startUpload('owner', { productId, purpose: 'listing', name: 'my shop.zip', size: 10 }, store);
    expect(ok.ok && ok.value.file).toMatchObject({ state: 'awaiting_upload', quarantinePath: expect.stringMatching(/^[0-9a-f-]{36}\/my-shop\.zip$/) });
    if (ok.ok) expect(await completeUpload('owner', ok.value.file.id, store)).toMatchObject({ ok: false, status: 409 }); // nothing arrived yet
  });
});

describe('automatic checks (fail closed)', () => {
  it('a clean archive passes the archive checks and the scan, and waits for human review', async () => {
    const { file } = await uploaded(good());
    const r = await runChecks(file.id, { store, scanner: testScanner });
    expect(r.ok && r.value).toMatchObject({ state: 'awaiting_review', scanVerdict: 'clean', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });
  it('with no approved scanner the file stays in checking, never approvable, and the upload is kept', async () => {
    const { file } = await uploaded(good());
    const r = await runChecks(file.id, { store, scanner: notConfiguredScanner });
    expect(r.ok && r.value).toMatchObject({ state: 'checking', scanVerdict: 'error' });
    expect(r.ok && r.value.scanDetail).toMatch(/B-3/);
    expect(scannerFromEnv({ NODE_ENV: 'production', SCAN_PROVIDER: 'test' }).name).toBe('none');
    expect(scannerFromEnv({}).name).toBe('none');
  });
  it('malware, secrets or a bad archive fail the file and schedule it for deletion after 7 days', async () => {
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const infected = await uploaded(zipSync({ 'readme.txt': strToU8(eicar) }, { level: 0 })); // stored, so the test double can see it
    const now = Date.UTC(2026, 10, 1);
    const r1 = await runChecks(infected.file.id, { store, scanner: testScanner, now });
    expect(r1.ok && r1.value).toMatchObject({ state: 'failed_checks', scanVerdict: 'infected', purgeAfter: now + 7 * DAY_MS });
    const secret = await uploaded(zipSync({ '.env': strToU8('STRIPE=sk_live_' + 'a'.repeat(24)) }));
    const r2 = await runChecks(secret.file.id, { store, scanner: testScanner });
    expect(r2.ok && r2.value.state).toBe('failed_checks');
    expect(JSON.stringify(r2.ok && r2.value.checks)).not.toContain('sk_live_');
    const bad = await uploaded(strToU8('not a zip at all, sorry'));
    const r3 = await runChecks(bad.file.id, { store, scanner: testScanner });
    expect(r3.ok && r3.value.state).toBe('failed_checks');
  });
});

describe('human review and immutable storage', () => {
  it('approval needs a clean result from an approved scanner: the test double is refused unless a test allows it', async () => {
    const { file } = await uploaded(good());
    await runChecks(file.id, { store, scanner: testScanner });
    expect(await reviewFile('admin-1', file.id, 'approve', { note: '', checklist: ALL, label: '1.0' }, { store })).toMatchObject({ ok: false, status: 409 });
  });
  it('approval needs every checklist item and a version label', async () => {
    const { file } = await uploaded(good());
    await runChecks(file.id, { store, scanner: testScanner });
    expect(await reviewFile('admin-1', file.id, 'approve', { note: '', checklist: { opened_in_sandbox: true }, label: '1.0' }, { store, allowTestScanner: true })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await reviewFile('admin-1', file.id, 'approve', { note: '', checklist: ALL, label: '' }, { store, allowTestScanner: true })).toMatchObject({ ok: false, status: 400 });
  });
  it('approving copies the checked bytes once into private storage, re-hashed, pinned as a version, audited', async () => {
    const { file, productId } = await uploaded(good());
    await runChecks(file.id, { store, scanner: testScanner });
    const checked = (await getFile(file.id))!;
    const r = await reviewFile('admin-1', file.id, 'approve', { note: 'Looks good.', checklist: ALL, label: '1.0', changelog: 'First release.' }, { store, allowTestScanner: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.file).toMatchObject({ state: 'approved', approvedPath: `${productId}/${file.id}/${checked.sha256}.zip` });
    expect(await store.sha256(APPROVED, r.value.file.approvedPath!)).toBe(checked.sha256);
    expect((await versionsOf(productId)).map((v) => v.label)).toEqual(['1.0']);
    expect((await auditList(200)).some((e) => e.action === 'file_approved' && e.targetRef === file.id)).toBe(true);
    expect((await fileEvents(file.id)).map((e) => e.event)).toEqual(['upload_started', 'upload_completed', 'checks_passed', 'approved']);
    // immutable: no further change, and the approved copy is never overwritten or deleted
    await expect(updateFile(r.value.file, { state: 'rejected' }, { actorId: 'x', event: 'x', detail: {} })).rejects.toThrow(/immutable/);
    await expect(store.promote(file.quarantinePath, r.value.file.approvedPath!)).rejects.toThrow(/never overwritten/);
    await expect(store.remove(APPROVED, r.value.file.approvedPath!)).rejects.toThrow(/never deleted/);
  });
  it('a file swapped in quarantine after the checks is caught at review and rejected', async () => {
    const { file } = await uploaded(good());
    await runChecks(file.id, { store, scanner: testScanner });
    memTamper(QUARANTINE, file.quarantinePath, good()); // different bytes after checking
    expect(await reviewFile('admin-1', file.id, 'approve', { note: '', checklist: ALL, label: '1.0' }, { store, allowTestScanner: true })).toMatchObject({ ok: false, status: 409 });
    expect((await getFile(file.id))!.state).toBe('rejected');
  });
  it('a version label is used once per product', async () => {
    const seller = 'label-seller';
    const productId = crypto.randomUUID();
    memProduct({ id: productId, sellerId: seller, name: 'Shop', ownerType: 'seller' });
    for (const [i, expectOk] of [
      [0, true],
      [1, false],
    ] as const) {
      const bytes = good();
      const s = await startUpload(seller, { productId, purpose: 'version', name: `v${i}.zip`, size: bytes.length }, store);
      if (!s.ok) throw new Error(s.error);
      memPut(s.value.file.quarantinePath, bytes);
      await completeUpload(seller, s.value.file.id, store);
      await runChecks(s.value.file.id, { store, scanner: testScanner });
      const r = await reviewFile('admin-1', s.value.file.id, 'approve', { note: '', checklist: ALL, label: '2.0' }, { store, allowTestScanner: true }).catch((e: Error) => ({
        ok: false as const,
        status: 409,
        error: e.message,
      }));
      expect(r.ok).toBe(expectOk);
    }
  });
});

describe('rejected files are deleted from quarantine after 7 days, records kept', () => {
  it('purges after the period, not before, and never a file under legal hold', async () => {
    const { file } = await uploaded(good());
    const t0 = Date.UTC(2026, 10, 1);
    await reviewFile('admin-1', file.id, 'reject', { note: 'Wrong product files.' }, { store, now: t0 });
    await purgeExpired(t0 + 6 * DAY_MS, store);
    expect(await store.size(QUARANTINE, file.quarantinePath)).not.toBeNull();
    const held = await uploaded(good());
    await reviewFile('admin-1', held.file.id, 'reject', { note: 'Kept for a legal hold.' }, { store, now: t0 });
    const h = (await getFile(held.file.id))!;
    // a legal hold is set only by the database (by an authorised person); simulate it in memory
    (h as { legalHold: boolean }).legalHold = true;
    expect(await purgeExpired(t0 + 7 * DAY_MS + 1, store)).toBeGreaterThanOrEqual(1);
    expect(await store.size(QUARANTINE, file.quarantinePath)).toBeNull();
    expect((await getFile(file.id))!.state).toBe('purged'); // the record stays
    expect(await store.size(QUARANTINE, held.file.quarantinePath)).not.toBeNull(); // held: not deleted
  });
});
