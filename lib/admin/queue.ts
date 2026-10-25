import 'server-only';
import { isBlocked } from '../chatFilter';
import { notify } from '../notify';
import { orderStore } from '../orders/store';
import { unsuspend } from '../strikes';
import { createAdminClient } from '../supabase/server';
import { audit } from './audit';
import { forgetLiveProducts } from '../catalog';

/*
 * What admins review and decide: new listings, developer profiles, accounts and abuse reports. Each decision is written to the audit log
 * and tells the person concerned. A digital product is only approved after the admin ticks that
 * they opened its files in a sandbox (CLAUDE.md), and the tick is recorded.
 */
const pg = async () => (await orderStore()).kind === 'postgres';
export type Result = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });
const noteProblem = (note: string) => (note.length > 600 ? 'Keep the note under 600 characters.' : isBlocked(note) ? 'Keep emails, phone numbers and outside payment talk out of the note.' : null);

export type QueueListing = {
  slug: string;
  name: string;
  seller: string;
  sellerId: string;
  category: string;
  platform: string;
  priceCents: number;
  description: string;
  includes: string[];
  demoUrl: string | null;
  codeUrl: string | null;
  sampleUrl: string | null;
  hasTrial: boolean;
  licence: string | null;
  thirdParty: { name: string; licence: string }[];
  digital: boolean;
  createdAt: number;
};
export type QueueDev = { handle: string; name: string; headline: string; bio: string; userId: string; createdAt: number };

export async function listingQueue(): Promise<QueueListing[]> {
  if (!(await pg())) return [];
  const db = createAdminClient();
  const { data } = await db
    .from('products')
    .select('id, slug, name, seller_id, category, platform, price_cents, description, includes, demo_url, code_url, sample_url, trial_url, licence_type, third_party, created_at')
    .eq('status', 'in_review')
    .order('created_at', { ascending: true })
    .limit(100);
  const rows = data ?? [];
  const { data: names } = rows.length
    ? await db
        .from('profiles')
        .select('id, full_name')
        .in(
          'id',
          rows.map((r) => r.seller_id),
        )
    : { data: [] as { id: string; full_name: string }[] };
  const list = rows.map((r) => ({
    id: r.id as string,
    slug: r.slug,
    name: r.name,
    seller: names?.find((n) => n.id === r.seller_id)?.full_name || 'Seller',
    sellerId: r.seller_id,
    category: r.category,
    platform: r.platform ?? 'web',
    priceCents: r.price_cents,
    description: r.description,
    includes: r.includes ?? [],
    demoUrl: r.demo_url && r.demo_url !== 'about:blank' ? r.demo_url : null,
    codeUrl: r.code_url && r.code_url !== 'about:blank' ? r.code_url : null,
    sampleUrl: r.sample_url,
    hasTrial: !!r.trial_url,
    licence: r.licence_type,
    thirdParty: Array.isArray(r.third_party) ? r.third_party : [],
    digital: r.platform === 'digital',
    createdAt: Date.parse(r.created_at),
  }));
  return list.map(({ id: _id, ...rest }) => rest);
}

export type AdminListingRow = { slug: string; name: string; seller: string; status: string; platform: string; priceCents: number; createdAt: number };

/* Every listing that is not a draft, newest first, for the admin's listings page (status filter optional). */
export async function allListings(status = ''): Promise<AdminListingRow[]> {
  if (!(await pg())) return [];
  const db = createAdminClient();
  let q = db.from('products').select('slug, name, seller_id, status, platform, price_cents, created_at').neq('status', 'draft').order('created_at', { ascending: false }).limit(200);
  if (['live', 'in_review', 'rejected', 'paused'].includes(status)) q = q.eq('status', status);
  const { data } = await q;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.seller_id).filter(Boolean))];
  const { data: names } = ids.length ? await db.from('profiles').select('id, full_name').in('id', ids) : { data: [] as { id: string; full_name: string }[] };
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    seller: names?.find((n) => n.id === r.seller_id)?.full_name || 'Seller',
    status: r.status,
    platform: r.platform ?? 'web',
    priceCents: r.price_cents,
    createdAt: Date.parse(r.created_at),
  }));
}

export async function devQueue(): Promise<QueueDev[]> {
  if (!(await pg())) return [];
  const { data } = await createAdminClient()
    .from('dev_profiles')
    .select('handle, name, headline, bio, user_id, created_at')
    .eq('status', 'in_review')
    .order('created_at', { ascending: true })
    .limit(100);
  return (data ?? []).map((r) => ({ handle: r.handle, name: r.name, headline: r.headline, bio: r.bio, userId: r.user_id, createdAt: Date.parse(r.created_at) }));
}

export type ListingDecision = 'approve' | 'changes' | 'reject';
// Sent back for changes stays the same row (address, reviews, orders) in a state the seller can edit and resend; a draft could only be resent as a new listing.
const STATUS: Record<ListingDecision, string> = { approve: 'live', changes: 'rejected', reject: 'rejected' };
const WORD: Record<ListingDecision, string> = { approve: 'approved', changes: 'sent back for changes', reject: 'rejected' };

export async function decideListing(adminId: string | null, slug: string, decision: ListingDecision, note: string, filesChecked: boolean): Promise<Result> {
  if (!(await pg())) return fail(404, 'There are no listings to review in demo mode.');
  const problem = noteProblem(note);
  if (problem) return fail(400, problem);
  if (decision !== 'approve' && note.trim().length < 5) return fail(400, 'Tell the seller what to fix or why (at least 5 characters).');
  const db = createAdminClient();
  const { data: p } = await db.from('products').select('id, slug, name, seller_id, status, platform, code_url, description, demo_url, third_party').eq('slug', slug).maybeSingle();
  if (!p) return fail(404, 'Listing not found.');
  if (p.status !== 'in_review') return fail(409, `This listing is ${p.status}, not waiting for review.`);
  if (decision === 'approve' && p.platform === 'digital' && !filesChecked) return fail(400, 'Open the files in a sandbox and tick the box before approving a digital product.');
  const hasFiles = typeof p.code_url === 'string' && p.code_url !== '' && p.code_url !== 'about:blank';
  if (decision === 'approve') {
    if (p.platform === 'digital' && !hasFiles) return fail(400, 'Digital products need a valid seller file link before approval.');
  }
  let update = db
    .from('products')
    .update({ status: STATUS[decision], review_note: note.trim() || null, reviewed_by: adminId, reviewed_at: new Date().toISOString() })
    .eq('id', p.id)
    .eq('status', 'in_review');
  // A file URL changed during the scan cannot inherit the old scan's approval.
  if (decision === 'approve' && hasFiles) update = update.eq('code_url', p.code_url);
  const { data: upd } = await update.select('id');
  if (!upd?.length) return fail(409, 'This listing has just changed.');
  forgetLiveProducts();
  await audit(adminId, `listing_${decision}`, 'product', slug, { note: note.trim(), filesChecked, platform: p.platform });
  await notify(p.seller_id, 'listing_decision', { name: p.name, decision: WORD[decision], note: note.trim() || 'Your listing is live.' });
  return { ok: true };
}

export async function decideDev(adminId: string | null, handle: string, decision: ListingDecision, note: string): Promise<Result> {
  if (!(await pg())) return fail(404, 'There are no profiles to review in demo mode.');
  const problem = noteProblem(note);
  if (problem) return fail(400, problem);
  if (decision !== 'approve' && note.trim().length < 5) return fail(400, 'Tell the developer what to fix or why (at least 5 characters).');
  const db = createAdminClient();
  const { data: p } = await db.from('dev_profiles').select('user_id, name, status').eq('handle', handle).maybeSingle();
  if (!p) return fail(404, 'Profile not found.');
  if (p.status !== 'in_review') return fail(409, `This profile is ${p.status}, not waiting for review.`);
  const status = decision === 'approve' ? 'live' : 'rejected';
  const { data: upd } = await db
    .from('dev_profiles')
    .update({ status, review_note: note.trim() || null, reviewed_by: adminId, reviewed_at: new Date().toISOString() })
    .eq('handle', handle)
    .eq('status', 'in_review')
    .select('user_id');
  if (!upd?.length) return fail(409, 'This profile has just changed.');
  await audit(adminId, `developer_${decision}`, 'dev_profile', handle, { note: note.trim() });
  await notify(p.user_id, 'listing_decision', { name: `profile ${p.name}`, decision: WORD[decision], note: note.trim() || 'Your profile is live.' });
  return { ok: true };
}

/* ---------- accounts ---------- */
export type UserRow = { id: string; name: string; role: string; banned: boolean; flagged: boolean; strikes: number; suspendedUntil?: number; createdAt: number };
export async function listUsers(search = ''): Promise<UserRow[]> {
  if (!(await pg())) return [];
  let q = createAdminClient().from('profiles').select('id, full_name, role, banned, flagged, strikes, suspended_until, created_at').order('created_at', { ascending: false }).limit(100);
  const s = search
    .trim()
    .replace(/[%,()]/g, '')
    .slice(0, 60);
  if (s) q = q.ilike('full_name', `%${s}%`);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.full_name || '(no name)',
    role: r.role,
    banned: !!r.banned,
    flagged: !!r.flagged,
    strikes: r.strikes ?? 0,
    suspendedUntil: r.suspended_until ? Date.parse(r.suspended_until) : undefined,
    createdAt: Date.parse(r.created_at),
  }));
}

export type UserAction = 'ban' | 'unban' | 'unsuspend' | 'clear_flag';
export async function userAction(adminId: string | null, userId: string, action: UserAction, note: string): Promise<Result> {
  if (!(await pg())) return fail(404, 'There are no accounts in demo mode.');
  const problem = noteProblem(note);
  if (problem) return fail(400, problem);
  if (note.trim().length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  if (userId === adminId) return fail(400, 'You cannot do this to your own account.');
  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('id, role').eq('id', userId).maybeSingle();
  if (!p) return fail(404, 'Account not found.');
  // ban_reason comes with migration 0035; before it is there the ban simply has no reason.
  const reason = action === 'unban' ? (await db.from('profiles').select('ban_reason').eq('id', userId).maybeSingle()).data?.ban_reason : null;
  if (action === 'unban' && reason === 'chargeback') return fail(409, 'This buyer was banned for a lost chargeback. That ban is permanent.');
  if (action === 'ban' && p.role === 'admin') return fail(400, 'Remove the admin role first.');
  if (action === 'unban' && (await db.from('data_requests').select('id').eq('user_id', userId).eq('kind', 'delete').eq('status', 'done').limit(1)).data?.length)
    return fail(409, "This account was deleted at the person's request. It cannot be brought back.");
  // The ban also reaches sign-in, so a banned person's session cannot be renewed; the unban lifts both.
  // A failed write must not reach the audit log as done.
  if (action === 'ban') {
    if ((await db.from('profiles').update({ banned: true }).eq('id', userId)).error) return fail(500, 'Could not save. Nothing was changed.');
    const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    if (error) console.error('ban: could not lock sign-in', error.message);
  } else if (action === 'unban') {
    if ((await db.from('profiles').update({ banned: false }).eq('id', userId)).error) return fail(500, 'Could not save. Nothing was changed.');
    const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    if (error) console.error('unban: could not unlock sign-in', error.message);
  } else if (action === 'unsuspend') await unsuspend(userId, adminId);
  else if ((await db.from('profiles').update({ flagged: false }).eq('id', userId)).error) return fail(500, 'Could not save. Nothing was changed.');
  await audit(adminId, `user_${action}`, 'profile', userId, { note: note.trim() });
  return { ok: true };
}

/* ---------- abuse reports ---------- */
export { decideReport, listReports, type Report } from '../abuse';
