import 'server-only';
import { auditStrict } from '../admin/audit';
import { CONFIG, DAY_MS } from '../config';
import { notify, notifyAdmins } from '../notify';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import { inspectArchive } from './archive';
import { APPROVED, QUARANTINE, ObjectStoreError, objectStore, type ObjectStore } from './objectStore';
import { getFile, insertFile, insertVersion, listFiles, updateFile, type FileObject, type FilePurpose, type FileVersion } from './store';

/*
 * The secure source-file pipeline (owner decisions D-C, D-D, F-8, F-9; rule 8 of the implementation brief):
 *   1. an authenticated seller asks for an upload slot for their own product        startUpload
 *   2. the file goes straight into the private quarantine bucket                    (signed upload link)
 *   3. the seller says it is uploaded; size is checked                              completeUpload
 *   4. SHA-256 recorded, archive validated, secrets looked for (NO malware scan)   runChecks
 *   5. a Catalog admin reviews it in a sandbox with a checklist                     reviewFile
 *   6. approved bytes are copied once to private product-files, re-hashed, pinned   reviewFile -> file_versions
 *   7. rejected or failed files are deleted from quarantine after 7 days            purgeExpired (unless held)
 * Nothing here releases anything to a buyer: that is the release rule (Phase 6).
 */
export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const MB = 1024 * 1024;

/* ---------- product ownership (who may upload for which product) ---------- */
type ProductInfo = { id: string; sellerId: string; name: string; ownerType: 'seller' | 'platform' };
const memProducts: Map<string, ProductInfo> = ((globalThis as { __filesProducts?: Map<string, ProductInfo> }).__filesProducts ??= new Map());
/* Tests only: register a product in memory mode. */
export const memProduct = (p: ProductInfo) => memProducts.set(p.id, p);
export async function productInfo(productId: string): Promise<ProductInfo | null> {
  if ((await orderStore()).kind !== 'postgres') return memProducts.get(productId) ?? null;
  const { data } = await createAdminClient().from('products').select('id, seller_id, name, owner_type').eq('id', productId).maybeSingle();
  return data ? { id: data.id, sellerId: data.seller_id, name: data.name, ownerType: data.owner_type === 'platform' ? 'platform' : 'seller' } : null;
}

const safeName = (n: string) =>
  n
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'upload.zip';

/* 1. An upload slot for one archive, for the seller's own product. Returns a one-time link into quarantine. */
export async function startUpload(
  sellerId: string,
  input: { productId: string | null; purpose: Extract<FilePurpose, 'listing' | 'version' | 'delivery' | 'revision'>; name: string; size: number; orderId?: string },
  store: ObjectStore = objectStore(),
): Promise<Result<{ file: FileObject; uploadUrl: string; token: string }>> {
  // A listing file or version belongs to the seller's own product; a delivery or revision belongs to an order the seller works on (custom
  // development has no product). The caller (lib/release or the API route) has already checked that the order is the seller's and open.
  const orderFile = input.purpose === 'delivery' || input.purpose === 'revision';
  if (orderFile && !input.orderId) return fail(400, 'A delivery belongs to an order.');
  const p = input.productId ? await productInfo(input.productId) : null;
  if (!orderFile && (!p || p.sellerId !== sellerId)) return fail(404, 'Product not found.');
  if (!/\.zip$/i.test(input.name)) return fail(400, 'Upload one .zip archive.');
  if (!Number.isInteger(input.size) || input.size < 1) return fail(400, 'The file is empty.');
  if (input.size > CONFIG.files.maxArchiveMb * MB) return fail(413, `The archive is larger than ${CONFIG.files.maxArchiveMb} MB.`);
  const open = (await listFiles({ uploadedBy: sellerId, states: ['awaiting_upload', 'checking'] })).length;
  if (open >= 5) return fail(429, 'You have 5 uploads waiting. Finish or wait for them first.');
  const id = crypto.randomUUID();
  const path = `${id}/${safeName(input.name)}`;
  const file = await insertFile(
    {
      id,
      purpose: input.purpose,
      productId: p?.id ?? null,
      orderId: input.orderId ?? null,
      uploadedBy: sellerId,
      originalName: input.name.slice(0, 200),
      declaredSize: input.size,
      sizeBytes: null,
      sha256: null,
      quarantinePath: path,
      approvedPath: null,
      state: 'awaiting_upload',
      checks: {},
      scanProvider: null,
      scanVerdict: null,
      scanReference: null,
      scanDetail: null,
      reviewedBy: null,
      reviewNote: null,
      purgeAfter: null,
      legalHold: false,
    },
    { actorId: sellerId, event: 'upload_started', from: null, to: 'awaiting_upload', detail: { name: input.name.slice(0, 200), size: input.size } },
  );
  const up = await store.uploadUrl(path);
  return { ok: true, value: { file, uploadUrl: up.url, token: up.token } };
}

/* 3. The seller says the upload finished. The real size must be there and within the limit. The checks run next (runChecks). */
export async function completeUpload(sellerId: string, fileId: string, store: ObjectStore = objectStore()): Promise<Result<FileObject>> {
  const f = await getFile(fileId);
  if (!f || f.uploadedBy !== sellerId) return fail(404, 'Upload not found.');
  if (f.state !== 'awaiting_upload') return fail(409, 'This upload was already sent.');
  const size = await store.size(QUARANTINE, f.quarantinePath);
  if (size === null) return fail(409, 'The file has not arrived yet. Upload it, then try again.');
  if (size > CONFIG.files.maxArchiveMb * MB) {
    const next = await updateFile(
      f,
      {
        state: 'failed_checks',
        sizeBytes: size,
        checks: { problems: [`The archive is larger than ${CONFIG.files.maxArchiveMb} MB.`] },
        purgeAfter: Date.now() + CONFIG.files.rejectedKeepDays * DAY_MS,
      },
      { actorId: sellerId, event: 'too_large', detail: { size } },
    );
    return { ok: true, value: next };
  }
  const next = await updateFile(f, { state: 'checking', sizeBytes: size }, { actorId: sellerId, event: 'upload_completed', detail: { size } });
  return { ok: true, value: next };
}

/*
 * 4. The automatic checks: SHA-256, the archive rules and secret detection. Problems fail the file; the seller is told what to fix, without
 * any secret value. There is NO malware scan (owner decision 2026-10-29, security risk accepted): a file that passes waits for the human
 * review, which is the only look at what the code does. Its record says so (`malwareScan: 'not performed'`).
 */
export async function runChecks(fileId: string, opts: { store?: ObjectStore; now?: number } = {}): Promise<Result<FileObject>> {
  const store = opts.store ?? objectStore();
  const now = opts.now ?? Date.now();
  const f = await getFile(fileId);
  if (!f) return fail(404, 'File not found.');
  if (f.state !== 'checking') return fail(409, `This file is ${f.state.replace('_', ' ')}, not waiting for checks.`);
  let sha: string, report;
  try {
    sha = await store.sha256(QUARANTINE, f.quarantinePath);
    report = await inspectArchive(await store.reader(QUARANTINE, f.quarantinePath));
  } catch (e) {
    if (e instanceof ObjectStoreError) return fail(503, 'The file could not be read for checking. It will be tried again.');
    throw e;
  }
  const checks = {
    ...f.checks,
    problems: report.problems,
    secrets: report.secrets,
    files: report.files,
    entries: report.entries,
    unpackedBytes: report.unpackedBytes,
    scannedTextFiles: report.scannedTextFiles,
  };
  // A file whose bytes match one already approved for another product is flagged for the reviewer (a possible copied product).
  const twins = sha ? (await listFiles({ states: ['approved'] })).filter((x) => x.sha256 === sha && x.productId !== f.productId).map((x) => x.productId) : [];
  if (!report.ok) {
    const next = await updateFile(
      f,
      { state: 'failed_checks', sha256: sha, checks: { ...checks, twins }, purgeAfter: now + CONFIG.files.rejectedKeepDays * DAY_MS },
      { actorId: null, event: 'checks_failed', detail: { problems: report.problems.length, secrets: report.secrets.length } },
    );
    if (f.uploadedBy) await notify(f.uploadedBy, 'file_checked', { title: f.originalName, result: 'not accepted', note: report.problems.slice(0, 3).join(' ') });
    return { ok: true, value: next };
  }
  const next = await updateFile(
    f,
    { state: 'awaiting_review', sha256: sha, checks: { ...checks, twins, malwareScan: 'not performed' } },
    { actorId: null, event: 'checks_passed', detail: { malwareScan: 'not performed' } },
  );
  await notifyAdmins('file_review_needed', { title: f.originalName });
  if (f.uploadedBy)
    await notify(f.uploadedBy, 'file_checked', { title: f.originalName, result: 'passed, waiting for review', note: 'The automatic checks passed. A SellOnBay reviewer will look at it next.' });
  return { ok: true, value: next };
}

/* The human review checklist (all must be ticked to approve). */
export const REVIEW_CHECKLIST = {
  opened_in_sandbox: 'I opened and ran the files in an isolated sandbox',
  matches_listing: 'The files match what the listing promises',
  no_harmful_code: 'I found no harmful, hidden or tracking code',
  licences_ok: 'Licence file and third-party notices are present and allow resale',
} as const;
export type ChecklistKey = keyof typeof REVIEW_CHECKLIST;

/*
 * 5 and 6. A Catalog admin approves or rejects. Approving needs: automatic checks passed, every checklist item ticked (the files are NOT
 * malware-scanned: the sandbox review is the only check of what the code does), a version label. The bytes are copied once to product-files, the copy is re-hashed and must match,
 * then a file version is created. Audited before anything changes.
 */
export async function reviewFile(
  adminId: string | null,
  fileId: string,
  decision: 'approve' | 'reject',
  input: { note: string; checklist?: Partial<Record<ChecklistKey, boolean>>; label?: string; changelog?: string },
  opts: { store?: ObjectStore; now?: number } = {},
): Promise<Result<{ file: FileObject; version?: FileVersion }>> {
  const store = opts.store ?? objectStore();
  const now = opts.now ?? Date.now();
  const note = input.note.trim();
  if (note.length > 1000) return fail(400, 'Keep the note under 1000 characters.');
  const f = await getFile(fileId);
  if (!f) return fail(404, 'File not found.');
  if (decision === 'reject') {
    if (note.length < 5) return fail(400, 'Tell the seller why (at least 5 characters).');
    if (!['awaiting_review', 'checking', 'failed_checks'].includes(f.state)) return fail(409, `This file is ${f.state.replace('_', ' ')}.`);
    await auditStrict(adminId, 'file_rejected', 'file', f.id, { note, product: f.productId });
    const next = await updateFile(
      f,
      { state: 'rejected', reviewedBy: adminId, reviewedAt: now, reviewNote: note, rejectedAt: now, purgeAfter: now + CONFIG.files.rejectedKeepDays * DAY_MS },
      { actorId: adminId, event: 'rejected', detail: { note } },
    );
    if (f.uploadedBy) await notify(f.uploadedBy, 'file_checked', { title: f.originalName, result: 'rejected', note });
    return { ok: true, value: { file: next } };
  }
  if (f.state !== 'awaiting_review') return fail(409, 'Only a file that passed the automatic checks can be approved.');
  if ((!f.productId && !f.orderId) || !f.sha256 || !f.sizeBytes) return fail(409, 'This file has no product, order or hash recorded.');
  // A file an old scanner marked infected is never approved (history kept from before the scanner was removed).
  if (f.scanVerdict === 'infected') return fail(409, 'A malware scan found a problem in this file before scanning was removed. It cannot be approved.');
  const missing = (Object.keys(REVIEW_CHECKLIST) as ChecklistKey[]).filter((k) => input.checklist?.[k] !== true);
  if (missing.length) return fail(400, `Tick every review item first: ${missing.map((k) => REVIEW_CHECKLIST[k]).join('; ')}.`);
  // A work order's delivery or a revision belongs to one order: it is approved without becoming a product version.
  const orderFile = f.purpose === 'delivery' || f.purpose === 'revision';
  const label = (input.label ?? '').trim();
  if (!orderFile && !/^[0-9A-Za-z][0-9A-Za-z._ -]{0,29}$/.test(label)) return fail(400, 'Give the version a short label, like 1.0.');
  const changelog = (input.changelog ?? '').trim().slice(0, 2000) || null;
  // The quarantine copy must still be the bytes that were checked (no swap between checking and review).
  const nowSha = await store.sha256(QUARANTINE, f.quarantinePath);
  if (nowSha !== f.sha256) {
    await auditStrict(adminId, 'file_swap_detected', 'file', f.id, { expected: f.sha256, found: nowSha });
    await updateFile(
      f,
      { state: 'rejected', reviewedBy: adminId, reviewedAt: now, reviewNote: 'The file changed after it was checked.', rejectedAt: now, purgeAfter: now + CONFIG.files.rejectedKeepDays * DAY_MS },
      { actorId: adminId, event: 'swap_detected', detail: {} },
    );
    return fail(409, 'The file changed after it was checked. It was rejected; the seller must upload it again.');
  }
  await auditStrict(adminId, 'file_approved', 'file', f.id, { product: f.productId, sha256: f.sha256, label, checklist: Object.keys(REVIEW_CHECKLIST), note });
  const approvedPath = f.productId ? `${f.productId}/${f.id}/${f.sha256}.zip` : `orders/${f.orderId}/${f.id}/${f.sha256}.zip`;
  try {
    await store.promote(f.quarantinePath, approvedPath);
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Could not store the approved file.');
  }
  if ((await store.sha256(APPROVED, approvedPath)) !== f.sha256) return fail(500, 'The stored copy does not match the checked file. Nothing was approved; ask a Super Admin.');
  const approved = await updateFile(
    f,
    { state: 'approved', approvedPath, reviewedBy: adminId, reviewedAt: now, reviewNote: note || null, reviewChecklist: Object.fromEntries(Object.keys(REVIEW_CHECKLIST).map((k) => [k, true])) },
    { actorId: adminId, event: 'approved', detail: { label, sha256: f.sha256 } },
  );
  if (orderFile) {
    if (f.uploadedBy) await notify(f.uploadedBy, 'file_checked', { title: f.originalName, result: 'approved', note: 'Approved. Send the delivery for release from your order.' });
    return { ok: true, value: { file: approved } };
  }
  if (!f.productId) return fail(409, 'A product version needs a product.');
  const version = await insertVersion({ productId: f.productId, label, fileId: f.id, changelog, approvedBy: adminId });
  if (f.uploadedBy) await notify(f.uploadedBy, 'file_checked', { title: f.originalName, result: 'approved', note: `Approved as version ${label}.` });
  return { ok: true, value: { file: approved, version } };
}

/* An admin asks for the checks to run again (after the file could not be read). Only for files waiting in "checking". */
export async function retryChecks(adminId: string | null, fileId: string): Promise<Result<FileObject>> {
  const f = await getFile(fileId);
  if (!f) return fail(404, 'File not found.');
  if (f.state !== 'checking') return fail(409, 'Only files waiting for checks can be checked again.');
  await auditStrict(adminId, 'file_checks_retry', 'file', f.id, {});
  return runChecks(fileId);
}

/* 7. Deletes rejected and failed uploads from quarantine after the retention period, unless a legal hold applies. Records stay. */
export async function purgeExpired(now = Date.now(), store: ObjectStore = objectStore()): Promise<number> {
  let n = 0;
  for (const f of await listFiles({ states: ['rejected', 'failed_checks'] })) {
    if (f.legalHold || !f.purgeAfter || f.purgeAfter > now) continue;
    try {
      await store.remove(QUARANTINE, f.quarantinePath);
    } catch {
      continue; // tried again on the next run
    }
    await updateFile(f, { state: 'purged', purgedAt: now }, { actorId: null, event: 'purged', detail: { after: CONFIG.files.rejectedKeepDays } });
    n++;
  }
  return n;
}

/*
 * The scheduled job: runs the checks for uploads waiting in "checking" (a few per run: each may be 500 MB) and deletes expired rejected files.
 */
export async function fileJobs(now = Date.now(), opts: { store?: ObjectStore } = {}): Promise<{ checked: number; purged: number }> {
  let checked = 0;
  for (const f of (await listFiles({ states: ['checking'] })).reverse()) {
    if (checked >= 3) break;
    const r = await runChecks(f.id, { store: opts.store, now }).catch(() => null);
    if (r?.ok) checked++;
  }
  return { checked, purged: await purgeExpired(now, opts.store) };
}
