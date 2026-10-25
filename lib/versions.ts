import 'server-only';
import { audit } from './admin/audit';
import { isBlocked } from './chatFilter';
import { DAY_MS } from './config';
import { limit } from './rateLimit';
import { notify, notifyAdmins } from './notify';
import { FUNDED_STATES } from './orders/machine';
import { orderStore } from './orders/store';
import { endsAt, isActive, promisedDays } from './productInfo';
import { createAdminClient } from './supabase/server';

/*
 * New versions of a digital product. The seller publishes a version (a number, what changed, a new private file link); an admin
 * reviews it like a listing. Once approved, every buyer whose update period is still running (the product's update_days, counted from their purchase)
 * is told, and downloads the new files from their order. Nobody else gets a version published after their period ended.
 * The first file stays in products.code_url; versions are the later ones.
 */
export type VersionStatus = 'in_review' | 'live' | 'rejected';
export type Version = {
  id: string;
  productId: string;
  productSlug: string;
  version: string;
  changelog: string;
  fileUrl: string;
  status: VersionStatus;
  note?: string;
  createdAt: number;
  publishedAt?: number;
};
export type Result<T = true> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

export const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,19}$/;
const MAX_IN_REVIEW = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------- pure rules ---------- */
export const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

/*
 * Which published version a buyer gets. A buyer always gets the latest version that existed when they paid. While their update period runs they also
 * get everything published since; when it ends, they keep what they had then. Returns null when only the first file applies.
 */
export function eligibleVersion<T extends { publishedAt?: number }>(live: T[], fundedAt: number, updateDays: number, now = Date.now()): T | null {
  const end = updateDays > 0 ? fundedAt + updateDays * DAY_MS : fundedAt;
  const cutoff = Math.max(fundedAt, Math.min(now, end));
  const ok = live.filter((v) => v.publishedAt !== undefined && v.publishedAt <= cutoff).sort((a, b) => a.publishedAt! - b.publishedAt!);
  return ok.at(-1) ?? null;
}

export function checkNewVersion(i: { version: string; changelog: string; fileUrl: string }): string | null {
  if (!VERSION_RE.test(i.version.trim())) return 'Write a version number like 1.1 or 2.0.3 (letters, digits, dots and dashes, up to 20 characters).';
  const c = i.changelog.trim();
  if (c.length < 10 || c.length > 2000) return 'Say what changed in 10 to 2000 characters.';
  if (isBlocked(c)) return 'Keep emails, phone numbers, links and outside payment talk out of the change list.';
  if (!isHttps(i.fileUrl.trim())) return 'Add a private link to the new files (https).';
  return null;
}

/* ---------- storage: the database when there is one, memory otherwise ---------- */
export type ProductRef = { id: string; slug: string; sellerId: string; name: string; status: string; platform: string; description: string; codeUrl: string; updateDays: number };
type Mem = { versions: Map<string, Version & { by: string }>; products: Map<string, ProductRef> };
const mem: Mem = ((globalThis as { __versionMem?: Mem }).__versionMem ??= { versions: new Map(), products: new Map() });
/* Memory mode has no seller accounts. Tests register their product here. */
export const registerProduct = (p: ProductRef) => mem.products.set(p.slug, p);
const pg = async () => (await orderStore()).kind === 'postgres';

async function loadProduct(slug: string): Promise<ProductRef | null> {
  if (await pg()) {
    const { data } = await createAdminClient().from('products').select('id, slug, seller_id, name, status, platform, description, code_url, update_days').eq('slug', slug).maybeSingle();
    return data
      ? {
          id: data.id,
          slug: data.slug,
          sellerId: data.seller_id,
          name: data.name,
          status: data.status,
          platform: data.platform ?? 'web',
          description: data.description,
          codeUrl: data.code_url,
          updateDays: data.update_days ?? 0,
        }
      : null;
  }
  return mem.products.get(slug) ?? null;
}

const fromRow = (r: Record<string, unknown>, slug: string): Version => ({
  id: r.id as string,
  productId: r.product_id as string,
  productSlug: slug,
  version: r.version as string,
  changelog: r.changelog as string,
  fileUrl: r.file_url as string,
  status: r.status as VersionStatus,
  note: (r.note as string) ?? undefined,
  createdAt: Date.parse(r.created_at as string),
  publishedAt: r.published_at ? Date.parse(r.published_at as string) : undefined,
});

export async function versionsOf(slug: string, status?: VersionStatus): Promise<Version[]> {
  if (await pg()) {
    const p = await loadProduct(slug);
    if (!p) return [];
    let q = createAdminClient().from('product_versions').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(100);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return []; // before migration 0037
    return (data ?? []).map((r) => fromRow(r, slug));
  }
  return [...mem.versions.values()].filter((v) => v.productSlug === slug && (!status || v.status === status)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getVersion(id: string): Promise<(Version & { sellerId: string; title: string }) | null> {
  if (await pg()) {
    if (!UUID.test(id)) return null;
    const { data } = await createAdminClient().from('product_versions').select('*, products(slug, name, seller_id)').eq('id', id).maybeSingle();
    if (!data) return null;
    const pr = (Array.isArray(data.products) ? data.products[0] : data.products) as { slug: string; name: string; seller_id: string } | null;
    return pr ? { ...fromRow(data, pr.slug), sellerId: pr.seller_id, title: pr.name } : null;
  }
  const v = mem.versions.get(id);
  const p = v ? mem.products.get(v.productSlug) : undefined;
  return v && p ? { ...v, sellerId: p.sellerId, title: p.name } : null;
}

/* Versions waiting for an admin, oldest first. */
export async function reviewQueue(): Promise<(Version & { title: string })[]> {
  if (await pg()) {
    const { data, error } = await createAdminClient().from('product_versions').select('*, products(slug, name)').eq('status', 'in_review').order('created_at').limit(100);
    if (error) return [];
    return (data ?? []).map((r) => {
      const pr = (Array.isArray(r.products) ? r.products[0] : r.products) as { slug: string; name: string } | null;
      return { ...fromRow(r, pr?.slug ?? ''), title: pr?.name ?? '' };
    });
  }
  return [...mem.versions.values()].filter((v) => v.status === 'in_review').map((v) => ({ ...v, title: mem.products.get(v.productSlug)?.name ?? '' }));
}

/* ---------- the seller publishes a version ---------- */
export async function publishVersion(sellerId: string, slug: string, i: { version: string; changelog: string; fileUrl: string }): Promise<Result<Version>> {
  const p = await loadProduct(slug);
  if (!p || p.sellerId !== sellerId) return fail(404, 'Listing not found.');
  if (p.platform !== 'digital') return fail(409, 'Versions are for digital products.');
  if (p.status !== 'live') return fail(409, 'You can publish a new version once the listing is live.');
  const bad = checkNewVersion(i);
  if (bad) return fail(400, bad);
  if (!(await limit(`version:${sellerId}`, 10, 24 * 3_600_000))) return fail(429, 'You published a lot of versions today. Try again tomorrow.');
  const version = i.version.trim();
  const all = await versionsOf(slug);
  if (all.some((v) => v.version.toLowerCase() === version.toLowerCase())) return fail(409, `Version ${version} already exists. Pick a new number.`);
  if (all.filter((v) => v.status === 'in_review').length >= MAX_IN_REVIEW) return fail(409, 'You already have versions waiting for review. Wait for those first.');
  const row = { version, changelog: i.changelog.trim(), fileUrl: i.fileUrl.trim() };

  let v: Version;
  if (await pg()) {
    const { data, error } = await createAdminClient()
      .from('product_versions')
      .insert({ product_id: p.id, version: row.version, changelog: row.changelog, file_url: row.fileUrl, created_by: sellerId })
      .select('*')
      .single();
    if (error || !data) return fail(error?.code === '23505' ? 409 : 500, error?.code === '23505' ? `Version ${version} already exists. Pick a new number.` : 'Could not save the version.');
    v = fromRow(data, slug);
  } else {
    v = { id: crypto.randomUUID(), productId: p.id, productSlug: slug, version: row.version, changelog: row.changelog, fileUrl: row.fileUrl, status: 'in_review', createdAt: Date.now() };
    mem.versions.set(v.id, { ...v, by: sellerId });
  }
  await notifyAdmins('version_review', { title: p.name, version: v.version }, `version-review:${v.id}`);
  return { ok: true, value: v };
}

/* ---------- the admin decides ---------- */
export async function decideVersion(adminId: string | null, id: string, decision: 'approve' | 'reject', note: string, filesChecked: boolean, now = Date.now()): Promise<Result<{ notified: number }>> {
  const v = await getVersion(id);
  if (!v) return fail(404, 'Version not found.');
  if (v.status !== 'in_review') return fail(409, `This version is ${v.status.replace('_', ' ')}, not waiting for review.`);
  const n = note.trim();
  if (n.length > 500) return fail(400, 'Keep the note under 500 characters.');
  if (n && isBlocked(n)) return fail(400, 'Keep emails, phone numbers and outside payment talk out of the note.');
  if (decision === 'reject' && n.length < 5) return fail(400, 'Tell the seller why (at least 5 characters).');
  const p = await loadProduct(v.productSlug);
  if (!p) return fail(404, 'Listing not found.');
  // A paused or rejected listing (an abuse report, an admin) does not send new files to its buyers until it is live again.
  if (decision === 'approve' && p.status !== 'live') return fail(409, `The listing is ${p.status.replace('_', ' ')}. Approve the version once the listing is live again.`);

  if (decision === 'approve') {
    if (!filesChecked) return fail(400, 'Open the files in a sandbox and tick the box before approving a version.');
  }

  const status: VersionStatus = decision === 'approve' ? 'live' : 'rejected';
  if (await pg()) {
    const { data } = await createAdminClient()
      .from('product_versions')
      .update({ status, note: n || null, reviewed_by: adminId, published_at: decision === 'approve' ? new Date(now).toISOString() : null })
      .eq('id', id)
      .eq('status', 'in_review')
      .select('id');
    if (!data?.length) return fail(409, 'This version has just changed.');
  } else {
    const m = mem.versions.get(id)!;
    m.status = status;
    m.note = n || undefined;
    if (decision === 'approve') m.publishedAt = now;
  }
  await audit(adminId, `version_${decision}`, 'product', p.slug, { version: v.version, note: n, filesChecked });
  await notify(v.sellerId, 'version_decision', { title: p.name, version: v.version, decision: decision === 'approve' ? 'approved' : 'rejected', note: n });
  const notified = decision === 'approve' ? await notifyBuyers(p, { ...v, publishedAt: now }, now) : 0;
  return { ok: true, value: { notified } };
}

/* Everyone who paid for this product and whose update period is still running hears about the new version, once each. */
async function notifyBuyers(p: ProductRef, v: Version, now: number): Promise<number> {
  const orders = (await (await orderStore()).byState([...FUNDED_STATES])).filter(
    (o) => o.productKey === p.slug && !!o.buyerId && o.fundedAt !== undefined && isActive(o.fundedAt, promisedDays(o.updateDays, p.updateDays), now),
  );
  let n = 0;
  for (const o of orders) {
    const until = endsAt(o.fundedAt, promisedDays(o.updateDays, p.updateDays))!;
    await notify(
      o.buyerId,
      'product_update',
      { title: p.name, orderId: o.id, version: v.version, changelog: v.changelog.slice(0, 300), until: new Date(until).toISOString().slice(0, 10) },
      { dedupe: `product-update:${v.id}:${o.id}` },
    );
    n++;
  }
  return n;
}

/* ---------- what a buyer gets ---------- */
/* The file for an order: the newest version the buyer is entitled to, or the first file. Never throws: if versions cannot be read the first file is used.
   `orderDays` is the update period kept on the order when it was bought (null on older orders). */
export async function fileForOrder(productId: string, baseUrl: string, fundedAt: number, orderDays: number | null = null, now = Date.now()): Promise<{ url: string; version: string | null }> {
  try {
    if (!(await pg())) return { url: baseUrl, version: null };
    const db = createAdminClient();
    const { data: prod } = await db.from('products').select('update_days').eq('id', productId).maybeSingle();
    const { data } = await db.from('product_versions').select('version, file_url, published_at').eq('product_id', productId).eq('status', 'live');
    const live = (data ?? []).map((r) => ({ version: r.version as string, url: r.file_url as string, publishedAt: Date.parse(r.published_at as string) }));
    const pick = eligibleVersion(live, fundedAt, promisedDays(orderDays, prod?.update_days ?? 0), now);
    return pick ? { url: pick.url, version: pick.version } : { url: baseUrl, version: null };
  } catch {
    return { url: baseUrl, version: null };
  }
}

/* What the order page shows: the versions the buyer is entitled to (newest first) and whether one came after they paid. */
export async function versionsForOrder(slug: string, fundedAt: number, updateDays: number, now = Date.now()) {
  const live = (await versionsOf(slug, 'live')).filter((v) => v.publishedAt !== undefined);
  const mine = eligibleVersion(live, fundedAt, updateDays, now);
  const shown = live.filter((v) => !mine || v.publishedAt! <= mine.publishedAt!).sort((a, b) => b.publishedAt! - a.publishedAt!);
  return {
    current: mine ? mine.version : null,
    isNew: !!mine && mine.publishedAt! > fundedAt,
    list: shown.slice(0, 5).map((v) => ({ version: v.version, changelog: v.changelog, at: v.publishedAt! })),
  };
}
