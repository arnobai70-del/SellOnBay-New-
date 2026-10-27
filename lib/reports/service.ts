import 'server-only';
import { createHash } from 'node:crypto';
import { audit } from '../admin/audit';
import { CONFIG, HOUR_MS } from '../config';
import { isFlagOn } from '../featureFlags';
import { orderStore } from '../orders/store';
import { getOrder } from '../orders/service';
import { planById } from '../plans/store';
import { limit } from '../rateLimit';
import { createAdminClient } from '../supabase/server';
import { cleanFilters, fileExpiresAt, parts, rowOf, SALE_STATES, selectOrders, type Filters, type ReportScope } from './rules';
import { receiptPdf, salesPdf } from './pdf';

/*
 * Sales PDF exports and buyer receipts (migration 0065, report_exports + private `reports` bucket). Postgres and Storage when there,
 * memory otherwise. The routes check who is asking (Finance or Super for all sales, the seller for their own, the buyer for a receipt).
 */
type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
export type ExportRow = {
  id: string;
  batchId: string;
  scope: ReportScope;
  requestedBy: string | null;
  filters: Record<string, unknown>;
  part: number;
  parts: number;
  rowCount: number;
  sha256: string;
  path: string;
  expiresAt: number;
  deletedAt: number | null;
  createdAt: number;
};
const g = globalThis as { __repMem?: { rows: Map<string, ExportRow>; files: Map<string, Uint8Array> }; __repPg?: boolean };
const mem = (g.__repMem ??= { rows: new Map(), files: new Map() });
async function pg(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (g.__repPg !== undefined) return g.__repPg;
  const { error } = await createAdminClient().from('report_exports').select('id').limit(1);
  return (g.__repPg = !error);
}
const uuidOrNull = (id: string | null) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
const fromRow = (r: Record<string, unknown>): ExportRow => ({
  id: r.id as string,
  batchId: r.batch_id as string,
  scope: r.scope as ReportScope,
  requestedBy: (r.requested_by as string) ?? null,
  filters: (r.filters as Record<string, unknown>) ?? {},
  part: r.part as number,
  parts: r.parts as number,
  rowCount: r.row_count as number,
  sha256: r.file_sha256 as string,
  path: r.file_path as string,
  expiresAt: Date.parse(r.expires_at as string),
  deletedAt: r.file_deleted_at ? Date.parse(r.file_deleted_at as string) : null,
  createdAt: Date.parse(r.created_at as string),
});

async function saveFile(row: ExportRow, bytes: Uint8Array): Promise<void> {
  if (!(await pg())) {
    mem.files.set(row.path, bytes);
    mem.rows.set(row.id, row);
    return;
  }
  const db = createAdminClient();
  const up = await db.storage.from('reports').upload(row.path, bytes, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw new Error('Could not store the report.');
  const { error } = await db.from('report_exports').insert({
    id: row.id,
    batch_id: row.batchId,
    scope: row.scope,
    requested_by: uuidOrNull(row.requestedBy),
    filters: row.filters,
    part: row.part,
    parts: row.parts,
    row_count: row.rowCount,
    file_sha256: row.sha256,
    file_path: row.path,
    expires_at: new Date(row.expiresAt).toISOString(),
    created_at: new Date(row.createdAt).toISOString(),
  });
  if (error) {
    await db.storage.from('reports').remove([row.path]); // no file without its log entry
    throw new Error('Could not log the report.');
  }
}

export async function exportsBy(userId: string, limitRows = 30): Promise<ExportRow[]> {
  if (!(await pg()))
    return [...mem.rows.values()]
      .filter((r) => r.requestedBy === userId)
      .sort((a, b) => b.createdAt - a.createdAt || a.part - b.part)
      .slice(0, limitRows);
  const { data } = await createAdminClient().from('report_exports').select('*').eq('requested_by', userId).order('created_at', { ascending: false }).limit(limitRows);
  return (data ?? []).map(fromRow);
}
async function exportById(id: string): Promise<ExportRow | null> {
  if (!(await pg())) return mem.rows.get(id) ?? null;
  const { data } = await createAdminClient().from('report_exports').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

const filterText = (f: Filters) =>
  [
    `${f.from} to ${f.to}`,
    f.statuses.length ? `status ${f.statuses.join(', ')}` : 'all statuses',
    f.productId ? `product ${f.productId.slice(0, 8)}` : '',
    f.sellerId ? `seller ${f.sellerId.slice(0, 8)}` : '',
    f.planId ? `plan ${f.planId.slice(0, 8)}` : '',
    f.ownerType ? `owner ${f.ownerType}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

/*
 * Builds the sales PDFs for one export: 1,000 rows per file at most, numbered parts, each logged with its SHA-256 and kept 24 hours.
 * scope admin: every sale (the route allows Finance and Super only); scope seller: only the seller's own, with no buyer data in any row.
 */
export async function exportSales(
  who: { id: string; name: string; scope: 'admin' | 'seller' },
  raw: Record<string, unknown>,
  now = Date.now(),
): Promise<Result<{ batchId: string; files: ExportRow[] }>> {
  if (!(await isFlagOn('reports.sales_pdf'))) return fail(409, 'Sales PDF exports are switched off. A Super Admin can switch them on under Feature flags.');
  if (!(await limit(`report:${who.id}`, CONFIG.reports.exportsPerHour, HOUR_MS))) return fail(429, 'Too many exports this hour. Try again later.');
  const c = cleanFilters(raw, who.scope, who.id, now);
  if (!c.ok) return fail(400, c.error);
  const store = await orderStore();
  const all = who.scope === 'seller' ? await store.forUser(who.id) : await store.byState([...SALE_STATES]);
  const orders = selectOrders(all, c.value, who.scope, who.id);
  const planNames = new Map<string, string>();
  for (const id of new Set(orders.map((o) => o.feePlanId).filter((x): x is string => !!x))) planNames.set(id, (await planById(id))?.name ?? 'plan');
  const rows = orders.map((o) => rowOf(o, o.feePlanId ? (planNames.get(o.feePlanId) ?? 'plan') : 'before plans'));
  const chunks = parts(rows);
  const batchId = crypto.randomUUID();
  const files: ExportRow[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const bytes = await salesPdf({
      title: who.scope === 'seller' ? 'Your sales' : 'Sales report',
      exportedBy: who.name,
      exportedAt: now,
      part: i + 1,
      parts: chunks.length,
      filterText: filterText(c.value),
      rows: chunks[i],
    });
    const row: ExportRow = {
      id: crypto.randomUUID(),
      batchId,
      scope: who.scope,
      requestedBy: who.id,
      filters: c.value as unknown as Record<string, unknown>,
      part: i + 1,
      parts: chunks.length,
      rowCount: chunks[i].length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      path: `${who.scope}/${batchId}/${i + 1}.pdf`,
      expiresAt: fileExpiresAt(now),
      deletedAt: null,
      createdAt: now,
    };
    await saveFile(row, bytes);
    files.push(row);
  }
  if (who.scope === 'admin') await audit(who.id, 'sales_report_exported', 'report', batchId, { filters: c.value, rows: rows.length, parts: chunks.length });
  return { ok: true, value: { batchId, files } };
}

/* The name printed on an export ("Exported by ..."). */
export async function exporterName(id: string | null): Promise<string> {
  if (!id) return 'Demo admin';
  if (!(await pg())) return id;
  const { data } = await createAdminClient().from('profiles').select('full_name').eq('id', id).maybeSingle();
  return (data?.full_name as string | undefined)?.trim() || id.slice(0, 8);
}

/* A buyer's receipt for one of their paid orders, made fresh each time and logged like an export. */
export async function buyerReceipt(buyerId: string, orderId: string, now = Date.now()): Promise<Result<{ bytes: Uint8Array; name: string }>> {
  const o = await getOrder(orderId);
  if (!o || o.buyerId !== buyerId) return fail(404, 'Order not found.');
  if (!o.fundedAt) return fail(409, 'A receipt is available once your payment is verified.');
  if (!(await limit(`receipt:${buyerId}`, CONFIG.reports.exportsPerHour, HOUR_MS))) return fail(429, 'Too many receipts this hour. Try again later.');
  const code = o.id.slice(0, 8).toUpperCase();
  const bytes = await receiptPdf({
    exportedAt: now,
    orderCode: code,
    title: o.title,
    paidOn: new Date(o.fundedAt).toISOString().slice(0, 10),
    lines: o.lines,
    totalCents: o.priceCents,
    refundedCents: o.refundedCents,
    licence: (o.licence ?? 'single_project').replace(/_/g, ' '),
    status: o.state.replace(/_/g, ' '),
  });
  const batchId = crypto.randomUUID();
  await saveFile(
    {
      id: crypto.randomUUID(),
      batchId,
      scope: 'buyer',
      requestedBy: buyerId,
      filters: { order: o.id },
      part: 1,
      parts: 1,
      rowCount: 1,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      path: `buyer/${batchId}/1.pdf`,
      expiresAt: fileExpiresAt(now),
      deletedAt: null,
      createdAt: now,
    },
    bytes,
  );
  return { ok: true, value: { bytes, name: `receipt-${code}.pdf` } };
}

/* The person who made an export downloads it again while it is kept (24 hours). Nobody else, whatever their role. */
export async function downloadExport(userId: string, id: string, now = Date.now()): Promise<Result<{ bytes: Uint8Array; name: string }>> {
  const r = await exportById(id);
  if (!r || r.requestedBy !== userId) return fail(404, 'Report not found.');
  if (r.deletedAt || now > r.expiresAt) return fail(410, 'This file was deleted after 24 hours. Export it again.');
  let bytes: Uint8Array | undefined;
  if (await pg()) {
    const { data } = await createAdminClient().storage.from('reports').download(r.path);
    bytes = data ? new Uint8Array(await data.arrayBuffer()) : undefined;
  } else bytes = mem.files.get(r.path);
  if (!bytes) return fail(404, 'The file could not be found. Export it again.');
  if (createHash('sha256').update(bytes).digest('hex') !== r.sha256) return fail(409, 'The stored file does not match its record. Export it again.');
  return { ok: true, value: { bytes, name: `sales-${r.batchId.slice(0, 8)}-part-${r.part}-of-${r.parts}.pdf` } };
}

/* Deletes generated files older than 24 hours; the log entries stay (cron, lib/orders jobs). */
export async function purgeReports(now = Date.now()): Promise<number> {
  if (!(await pg())) {
    let n = 0;
    for (const r of mem.rows.values())
      if (!r.deletedAt && now > r.expiresAt) {
        mem.files.delete(r.path);
        mem.rows.set(r.id, { ...r, deletedAt: now });
        n++;
      }
    return n;
  }
  const db = createAdminClient();
  const { data } = await db.from('report_exports').select('*').is('file_deleted_at', null).lt('expires_at', new Date(now).toISOString()).limit(500);
  let n = 0;
  for (const r of (data ?? []).map(fromRow)) {
    const rm = await db.storage.from('reports').remove([r.path]);
    if (rm.error) continue;
    const { error } = await db
      .from('report_exports')
      .update({ file_deleted_at: new Date(now).toISOString() })
      .eq('id', r.id)
      .is('file_deleted_at', null);
    if (!error) n++;
  }
  return n;
}
