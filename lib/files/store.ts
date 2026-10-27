import 'server-only';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';

/*
 * Records of uploaded source files, their events and the approved file versions (migration 0058). Postgres when there, memory otherwise.
 * Only lib/files/service.ts writes. The database refuses to change an approved file or delete any record; memory mode mirrors those rules.
 */
export type FileState = 'awaiting_upload' | 'checking' | 'failed_checks' | 'awaiting_review' | 'approved' | 'rejected' | 'purged';
export type FilePurpose = 'listing' | 'version' | 'delivery' | 'revision' | 'legacy';
export type FileObject = {
  id: string;
  purpose: FilePurpose;
  productId: string | null;
  orderId: string | null;
  uploadedBy: string | null;
  originalName: string;
  declaredSize: number;
  sizeBytes: number | null;
  sha256: string | null;
  quarantinePath: string;
  approvedPath: string | null;
  state: FileState;
  checks: Record<string, unknown>;
  scanProvider: string | null;
  scanVerdict: 'clean' | 'infected' | 'error' | null;
  scanReference: string | null;
  scanDetail: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  purgeAfter: number | null;
  legalHold: boolean;
  createdAt: number;
  updatedAt: number;
};
export type FileVersion = { id: string; productId: string; label: string; fileId: string; changelog: string | null; approvedBy: string | null; approvedAt: number };
export type FileEvent = { fileId: string; actorId: string | null; event: string; from: FileState | null; to: FileState | null; detail: Record<string, unknown>; at: number };

type Mem = { files: Map<string, FileObject>; events: FileEvent[]; versions: FileVersion[] };
const mem: Mem = ((globalThis as { __filesMem?: Mem }).__filesMem ??= { files: new Map(), events: [], versions: [] });

let ready: { ok: boolean; at: number } | undefined;
export async function filesPg(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('file_objects').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

const COLS =
  'id, purpose, product_id, order_id, uploaded_by, original_name, declared_size, size_bytes, sha256, quarantine_path, approved_path, state, checks, scan_provider, scan_verdict, scan_reference, scan_detail, reviewed_by, review_note, purge_after, legal_hold, created_at, updated_at';
type Row = Record<string, unknown>;
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : null);
const fromRow = (r: Row): FileObject => ({
  id: r.id as string,
  purpose: r.purpose as FilePurpose,
  productId: (r.product_id as string) ?? null,
  orderId: (r.order_id as string) ?? null,
  uploadedBy: (r.uploaded_by as string) ?? null,
  originalName: r.original_name as string,
  declaredSize: Number(r.declared_size),
  sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
  sha256: (r.sha256 as string) ?? null,
  quarantinePath: r.quarantine_path as string,
  approvedPath: (r.approved_path as string) ?? null,
  state: r.state as FileState,
  checks: (r.checks as Record<string, unknown>) ?? {},
  scanProvider: (r.scan_provider as string) ?? null,
  scanVerdict: (r.scan_verdict as FileObject['scanVerdict']) ?? null,
  scanReference: (r.scan_reference as string) ?? null,
  scanDetail: (r.scan_detail as string) ?? null,
  reviewedBy: (r.reviewed_by as string) ?? null,
  reviewNote: (r.review_note as string) ?? null,
  purgeAfter: ms(r.purge_after),
  legalHold: !!r.legal_hold,
  createdAt: ms(r.created_at) ?? 0,
  updatedAt: ms(r.updated_at) ?? 0,
});
const iso = (v: number | null | undefined) => (typeof v === 'number' ? new Date(v).toISOString() : null);
const uuidOrNull = (id: string | null | undefined) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);

export async function insertFile(f: Omit<FileObject, 'createdAt' | 'updatedAt'>, ev: Omit<FileEvent, 'fileId' | 'at'>): Promise<FileObject> {
  const now = Date.now();
  if (!(await filesPg())) {
    const rec = { ...f, createdAt: now, updatedAt: now };
    mem.files.set(f.id, rec);
    mem.events.push({ ...ev, fileId: f.id, at: now });
    return rec;
  }
  const db = createAdminClient();
  const { data, error } = await db
    .from('file_objects')
    .insert({
      id: f.id,
      purpose: f.purpose,
      product_id: f.productId,
      order_id: f.orderId,
      uploaded_by: uuidOrNull(f.uploadedBy),
      original_name: f.originalName,
      declared_size: f.declaredSize,
      quarantine_path: f.quarantinePath,
      state: f.state,
    })
    .select(COLS)
    .single();
  if (error || !data) throw new Error('Could not record the upload.');
  await logEvent(f.id, ev);
  return fromRow(data);
}

export async function getFile(id: string): Promise<FileObject | null> {
  if (!(await filesPg())) return mem.files.get(id) ?? null;
  const { data } = await createAdminClient().from('file_objects').select(COLS).eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function listFiles(filter: { states?: FileState[]; productId?: string; uploadedBy?: string } = {}): Promise<FileObject[]> {
  if (!(await filesPg()))
    return [...mem.files.values()]
      .filter((f) => (!filter.states || filter.states.includes(f.state)) && (!filter.productId || f.productId === filter.productId) && (!filter.uploadedBy || f.uploadedBy === filter.uploadedBy))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  let q = createAdminClient().from('file_objects').select(COLS).order('updated_at', { ascending: false }).limit(300);
  if (filter.states) q = q.in('state', filter.states);
  if (filter.productId) q = q.eq('product_id', filter.productId);
  if (filter.uploadedBy) q = q.eq('uploaded_by', filter.uploadedBy);
  const { data } = await q;
  return (data ?? []).map(fromRow);
}

async function logEvent(fileId: string, ev: Omit<FileEvent, 'fileId' | 'at'>) {
  if (!(await filesPg())) {
    mem.events.push({ ...ev, fileId, at: Date.now() });
    return;
  }
  const { error } = await createAdminClient()
    .from('file_events')
    .insert({ file_id: fileId, actor_id: uuidOrNull(ev.actorId), event: ev.event, from_state: ev.from, to_state: ev.to, detail: ev.detail });
  if (error) throw new Error('Could not log the file change.');
}

export type FilePatch = Partial<
  Pick<FileObject, 'state' | 'sizeBytes' | 'sha256' | 'approvedPath' | 'checks' | 'scanProvider' | 'scanVerdict' | 'scanReference' | 'scanDetail' | 'reviewedBy' | 'reviewNote' | 'purgeAfter'>
> & {
  reviewedAt?: number;
  rejectedAt?: number;
  scannedAt?: number;
  purgedAt?: number;
  reviewChecklist?: Record<string, boolean>;
};

/* Moves a file on only if it is still in the state the caller saw. Approved files cannot change (also refused by the database). */
export async function updateFile(prev: FileObject, patch: FilePatch, ev: Omit<FileEvent, 'fileId' | 'at' | 'from' | 'to'>): Promise<FileObject> {
  if (prev.state === 'approved') throw new Error('An approved file is immutable.');
  const to = patch.state ?? prev.state;
  if (!(await filesPg())) {
    const cur = mem.files.get(prev.id);
    if (!cur || cur.state !== prev.state) throw new Error('The file changed meanwhile. Reload and try again.');
    if (cur.sha256 && patch.sha256 && patch.sha256 !== cur.sha256) throw new Error('A recorded file hash never changes.');
    const { reviewedAt: _r, rejectedAt: _j, scannedAt: _s, purgedAt: _p, reviewChecklist: _c, ...plain } = patch;
    const next = { ...cur, ...plain, updatedAt: Date.now() };
    mem.files.set(prev.id, next);
    mem.events.push({ ...ev, fileId: prev.id, from: prev.state, to, at: Date.now() });
    return next;
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const map: Record<string, string> = {
    state: 'state',
    sizeBytes: 'size_bytes',
    sha256: 'sha256',
    approvedPath: 'approved_path',
    checks: 'checks',
    scanProvider: 'scan_provider',
    scanVerdict: 'scan_verdict',
    scanReference: 'scan_reference',
    scanDetail: 'scan_detail',
    reviewedBy: 'reviewed_by',
    reviewNote: 'review_note',
    reviewChecklist: 'review_checklist',
  };
  for (const [k, v] of Object.entries(patch)) {
    if (k in map) row[map[k]] = k === 'reviewedBy' ? uuidOrNull(v as string) : v;
  }
  if (patch.purgeAfter !== undefined) row.purge_after = iso(patch.purgeAfter);
  if (patch.reviewedAt) row.reviewed_at = iso(patch.reviewedAt);
  if (patch.rejectedAt) row.rejected_at = iso(patch.rejectedAt);
  if (patch.scannedAt) row.scanned_at = iso(patch.scannedAt);
  if (patch.purgedAt) row.purged_at = iso(patch.purgedAt);
  const { data, error } = await createAdminClient().from('file_objects').update(row).eq('id', prev.id).eq('state', prev.state).select(COLS);
  if (error) throw new Error('Could not save the file record.');
  if (!data?.length) throw new Error('The file changed meanwhile. Reload and try again.');
  await logEvent(prev.id, { ...ev, from: prev.state, to });
  return fromRow(data[0]);
}

export async function fileEvents(fileId: string): Promise<FileEvent[]> {
  if (!(await filesPg())) return mem.events.filter((e) => e.fileId === fileId);
  const { data } = await createAdminClient().from('file_events').select('file_id, actor_id, event, from_state, to_state, detail, created_at').eq('file_id', fileId).order('id');
  return (data ?? []).map((r) => ({ fileId: r.file_id, actorId: r.actor_id, event: r.event, from: r.from_state, to: r.to_state, detail: r.detail ?? {}, at: Date.parse(r.created_at) }));
}

export async function insertVersion(v: Omit<FileVersion, 'id' | 'approvedAt'>): Promise<FileVersion> {
  const now = Date.now();
  if (!(await filesPg())) {
    if (mem.versions.some((x) => x.productId === v.productId && x.label === v.label)) throw new Error('That version label is already used for this product.');
    if (mem.versions.some((x) => x.fileId === v.fileId)) throw new Error('This file is already a version.');
    const rec = { ...v, id: crypto.randomUUID(), approvedAt: now };
    mem.versions.push(rec);
    return rec;
  }
  const { data, error } = await createAdminClient()
    .from('file_versions')
    .insert({ product_id: v.productId, label: v.label, file_id: v.fileId, changelog: v.changelog, approved_by: uuidOrNull(v.approvedBy) })
    .select('id, product_id, label, file_id, changelog, approved_by, approved_at')
    .single();
  if (error || !data) throw new Error(/duplicate|unique/i.test(error?.message ?? '') ? 'That version label is already used for this product.' : 'Could not save the version.');
  return { id: data.id, productId: data.product_id, label: data.label, fileId: data.file_id, changelog: data.changelog, approvedBy: data.approved_by, approvedAt: Date.parse(data.approved_at) };
}

export async function versionsOf(productId: string): Promise<FileVersion[]> {
  if (!(await filesPg())) return mem.versions.filter((v) => v.productId === productId).sort((a, b) => b.approvedAt - a.approvedAt);
  const { data } = await createAdminClient()
    .from('file_versions')
    .select('id, product_id, label, file_id, changelog, approved_by, approved_at')
    .eq('product_id', productId)
    .order('approved_at', { ascending: false });
  return (data ?? []).map((d) => ({ id: d.id, productId: d.product_id, label: d.label, fileId: d.file_id, changelog: d.changelog, approvedBy: d.approved_by, approvedAt: Date.parse(d.approved_at) }));
}

export async function versionById(id: string): Promise<FileVersion | null> {
  if (!(await filesPg())) return mem.versions.find((v) => v.id === id) ?? null;
  const { data: d } = await createAdminClient().from('file_versions').select('id, product_id, label, file_id, changelog, approved_by, approved_at').eq('id', id).maybeSingle();
  return d ? { id: d.id, productId: d.product_id, label: d.label, fileId: d.file_id, changelog: d.changelog, approvedBy: d.approved_by, approvedAt: Date.parse(d.approved_at) } : null;
}
