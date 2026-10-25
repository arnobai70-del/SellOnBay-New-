import 'server-only';
import { createHash } from 'node:crypto';
import { audit } from './admin/audit';
import { isBlocked } from './chatFilter';
import { CONFIG, DAY_MS } from './config';
import { limit } from './rateLimit';
import { notify, notifyAdmins } from './notify';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';
import { bump } from './metrics';
import { forgetLiveProducts } from './catalog';

/*
 * Abuse reports for hosted sites (spec 8.8). Anyone can report; every report reaches the admins. When enough DIFFERENT verified people (a verified-email account or
 * a buyer of that listing, each counted once) report the same listing inside the window, the listing is paused automatically until an admin has looked at it:
 * the site goes dark first, review follows. An admin can suspend, dismiss, or put the site back (reinstate).
 */
export type Report = { id: string; url: string; reason: string; status: string; createdAt: number; slug?: string; reporters: number; verifiedReporters: number };
export type Result = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

type MemReport = Report & { key: string; note?: string; verified: boolean };
type Mem = { reports: MemReport[]; paused: Set<string> };
const mem: Mem = ((globalThis as { __abuseMem?: Mem }).__abuseMem ??= { reports: [], paused: new Set() });
const pg = async () => (await orderStore()).kind === 'postgres';

export const slugOf = (url: string) => /\/(?:demo|product|preview)\/([a-z0-9-]+)/i.exec(url)?.[1];
/* A reporter is counted once: the account if signed in, otherwise a hash of the address (never the address itself). */
export const reporterKey = (userId: string | null, ip: string) => (userId ? `u:${userId}` : 'ip:' + createHash('sha256').update(ip).digest('hex').slice(0, 24));
export const isPausedInMemory = (slug: string) => mem.paused.has(slug);

/*
 * Only a report from a verified-email account, or from a buyer who really ordered this listing, counts toward the automatic pause. Anonymous and
 * throwaway-account reports are still saved and still alert the admins, so a competitor cannot take a listing offline with fake accounts.
 */
export async function isVerifiedReporter(userId: string | null, slug: string | undefined): Promise<boolean> {
  if (!userId) return false;
  if (slug) {
    const orders = await (await orderStore()).forUser(userId);
    if (orders.some((o) => o.buyerId === userId && !!o.fundedAt && o.productKey === slug)) return true;
  }
  if (!(await pg())) return false;
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return !!data.user?.email_confirmed_at;
}

const REASONS = ['phishing', 'counterfeit', 'malware', 'copyright', 'other'];

export async function fileReport(i: { url: string; reason: string; detail: string; userId: string | null; ip: string }, now = Date.now()): Promise<Result & { autoPaused?: string }> {
  const url = i.url.trim().slice(0, 300);
  if (!url || !REASONS.includes(i.reason)) return fail(400, 'Check the address and the reason.');
  const detail = i.detail.trim().slice(0, 1000);
  // Too many reports from one address is itself a sign of abuse of this form.
  if (!(await limit(`abuse-ip:${i.ip}`, CONFIG.abuse.perIpPerHour, 3_600_000))) return fail(429, 'You have sent a lot of reports. Try again later.');
  const key = reporterKey(i.userId, i.ip);
  const text = detail ? `${i.reason}: ${detail}` : i.reason;
  const slug = slugOf(url);
  const verified = await isVerifiedReporter(i.userId, slug);

  if (await pg()) {
    const db = createAdminClient();
    const { error } = await db.from('abuse_reports').insert({ site_url: url, reason: text, reporter_id: i.userId, reporter_key: key, verified });
    if (error) return fail(500, 'Could not save the report.');
  } else mem.reports.push({ id: crypto.randomUUID(), url, reason: text, status: 'open', createdAt: now, slug, key, verified, reporters: 1, verifiedReporters: verified ? 1 : 0 });

  await bump('reports', 1, now);
  await notifyAdmins('abuse_alert', { what: `abuse report: ${i.reason}`, detail: `${url}${detail ? ': ' + detail.slice(0, 200) : ''}` });
  if (!slug) return { ok: true };

  // How many different VERIFIED people reported this listing recently?
  const since = now - CONFIG.abuse.windowDays * DAY_MS;
  let distinct = 0;
  if (await pg()) {
    const { data } = await createAdminClient()
      .from('abuse_reports')
      .select('reporter_key, site_url, created_at')
      .eq('verified', true)
      .gte('created_at', new Date(since).toISOString())
      .ilike('site_url', `%/${slug}%`)
      .limit(500);
    distinct = new Set((data ?? []).filter((r) => slugOf(r.site_url) === slug).map((r) => r.reporter_key)).size;
  } else distinct = new Set(mem.reports.filter((r) => r.verified && r.slug === slug && r.createdAt >= since).map((r) => r.key)).size;
  if (distinct < CONFIG.abuse.autoSuspendReports) return { ok: true };

  const paused = await pauseListing(slug, `Paused automatically after ${distinct} independent verified abuse reports. An admin will review it.`);
  if (paused) {
    await audit(null, 'abuse_auto_pause', 'product', slug, { reporters: distinct, windowDays: CONFIG.abuse.windowDays });
    await notifyAdmins(
      'abuse_alert',
      { what: 'listing paused automatically', detail: `${slug} had ${distinct} independent reports. Review it in Abuse reports.` },
      `autopause:${slug}:${new Date(now).toISOString().slice(0, 10)}`,
    );
    return { ok: true, autoPaused: slug };
  }
  return { ok: true };
}

/* Takes a listing offline (status paused). Returns false if there is no such listing or it was not live. */
async function pauseListing(slug: string, note: string): Promise<boolean> {
  if (await pg()) {
    const { data } = await createAdminClient()
      .from('products')
      .update({ status: 'paused', review_note: note, reviewed_at: new Date().toISOString() })
      .eq('slug', slug)
      .eq('status', 'live')
      .select('seller_id');
    if (!data?.length) return false;
    forgetLiveProducts();
    await notify(data[0].seller_id, 'listing_decision', { name: slug, decision: 'paused', note });
    return true;
  }
  if (mem.paused.has(slug)) return false;
  mem.paused.add(slug);
  return true;
}

export async function listReports(openOnly = true): Promise<Report[]> {
  if (await pg()) {
    let q = createAdminClient().from('abuse_reports').select('id, site_url, reason, status, created_at, reporter_key, verified').order('created_at', { ascending: false }).limit(200);
    if (openOnly) q = q.eq('status', 'open');
    const { data } = await q;
    const rows = data ?? [];
    return rows.map((r) => ({
      id: r.id,
      url: r.site_url,
      reason: r.reason,
      status: r.status,
      createdAt: Date.parse(r.created_at),
      slug: slugOf(r.site_url),
      reporters: new Set(rows.filter((x) => slugOf(x.site_url) === slugOf(r.site_url) && x.reporter_key).map((x) => x.reporter_key)).size || 1,
      verifiedReporters: new Set(rows.filter((x) => x.verified && slugOf(x.site_url) === slugOf(r.site_url) && x.reporter_key).map((x) => x.reporter_key)).size,
    }));
  }
  return mem.reports.filter((r) => !openOnly || r.status === 'open').map(({ key: _k, note: _n, verified: _v, ...r }) => r);
}

export async function decideReport(adminId: string | null, id: string, decision: 'suspend' | 'dismiss' | 'reinstate', note: string): Promise<Result> {
  const n = note.trim();
  if (n.length > 500) return fail(400, 'Keep the note under 500 characters.');
  if (n && isBlocked(n)) return fail(400, 'Keep emails, phone numbers and outside payment talk out of the note.');
  const status = decision === 'suspend' ? 'suspended' : 'dismissed';
  if (await pg()) {
    const db = createAdminClient();
    const { data: r } = await db.from('abuse_reports').select('id, site_url, status').eq('id', id).maybeSingle();
    if (!r) return fail(404, 'Report not found.');
    if (r.status !== 'open') return fail(409, 'This report is already decided.');
    const slug = slugOf(r.site_url);
    let changed: string | null = null;
    // Only a live listing is paused (one still in review stays there), and only a listing paused over abuse reports is put back.
    if (slug && decision === 'suspend') changed = (await pauseListing(slug, `Paused after an abuse report was upheld. ${n}`.trim())) ? slug : null;
    if (slug && decision === 'reinstate')
      changed = (
        await db
          .from('products')
          .update({ status: 'live', review_note: n || 'Put back after review.' })
          .eq('slug', slug)
          .eq('status', 'paused')
          .like('review_note', 'Paused % abuse report%')
          .select('id')
      ).data?.length
        ? slug
        : null;
    await db
      .from('abuse_reports')
      .update({ status, note: n || null, decided_by: adminId, decided_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'open');
    if (changed) forgetLiveProducts();
    await audit(adminId, `abuse_${decision}`, 'abuse_report', id, { url: r.site_url, listing: changed, note: n });
    return { ok: true };
  }
  const r = mem.reports.find((x) => x.id === id);
  if (!r) return fail(404, 'Report not found.');
  if (r.status !== 'open') return fail(409, 'This report is already decided.');
  r.status = status;
  r.note = n;
  if (r.slug && decision === 'suspend') mem.paused.add(r.slug);
  if (r.slug && decision === 'reinstate') mem.paused.delete(r.slug);
  await audit(adminId, `abuse_${decision}`, 'abuse_report', id, { url: r.url, note: n });
  return { ok: true };
}

/* Admin clean-up: remove every abuse report a (fake) account filed. Returns how many went. */
export async function deleteReportsBy(userId: string): Promise<number> {
  if (await pg()) return (await createAdminClient().from('abuse_reports').delete().eq('reporter_id', userId).select('id')).data?.length ?? 0;
  const keep = mem.reports.filter((r) => r.key !== `u:${userId}`);
  const n = mem.reports.length - keep.length;
  mem.reports = keep;
  return n;
}
