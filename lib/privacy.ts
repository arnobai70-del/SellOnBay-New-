import 'server-only';
import { audit } from './admin/audit';
import { acct, sellerKey } from './ledger';
import { ledgerStore } from './ledgerStore';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';
import { forgetLiveProducts } from './catalog';

/*
 * Your data (GDPR and CCPA). Export: a JSON file with what we hold about the signed-in person, nothing about anybody else and no secrets.
 * Delete: a request, refused while money or a dispute is still open, then an admin processes it. Processing ANONYMISES the account: the profile
 * loses its name, payout details, developer profile, notifications and the text of questions go, the sign-in is renamed and locked.
 * Payments, orders, the ledger, the audit log and the download log stay, because the law makes us keep them, but no longer point to a named person.
 */
export type DataRequest = { id: string; userId: string; kind: 'export' | 'delete'; status: 'pending' | 'done' | 'refused'; note?: string; createdAt: number };

/* Keys that must never appear in an export, at any depth. */
const SECRET_KEY = /password|secret|token|api_?key|code_url|trial_url|payment_ref|payout_ref/i;
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSecrets) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !SECRET_KEY.test(k))
        .map(([k, v]) => [k, stripSecrets(v)]),
    ) as T;
  return value;
}

export type Snapshot = { openOrders: number; openDisputes: number; pendingPayouts: number; moneyHeldCents?: number; debtCents?: number };
/* Why a deletion cannot go ahead yet, in plain words. Empty means it can. */
export function deletionBlockers(s: Snapshot): string[] {
  const out: string[] = [];
  if (s.openOrders > 0) out.push(`${s.openOrders} order(s) are still open. Finish or cancel them first.`);
  if (s.openDisputes > 0) out.push(`${s.openDisputes} dispute(s) are still open.`);
  if (s.pendingPayouts > 0) out.push(`${s.pendingPayouts} payout(s) are still on their way to you.`);
  // Deleting the account removes the payout details, so money still held for a seller (pending, available or kept back) could never be paid.
  if ((s.moneyHeldCents ?? 0) > 0) out.push('You still have earnings with us. They must be paid out first.');
  if ((s.debtCents ?? 0) > 0) out.push('Your seller account owes a balance from a refund. It must be settled first.');
  return out;
}

const pg = async () => (await orderStore()).kind === 'postgres';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOSED = ['paid_out', 'refunded', 'cancelled'];

async function snapshot(userId: string): Promise<Snapshot> {
  const db = createAdminClient();
  const [asBuyer, asSeller, disputes, payouts] = await Promise.all([
    db.from('orders').select('id, status').eq('buyer_id', userId),
    db.from('orders').select('id, status').eq('seller_id', userId),
    db.from('disputes').select('id, status').eq('opened_by', userId).neq('status', 'decided'),
    db.from('payouts').select('id, status').eq('seller_id', userId).in('status', ['scheduled', 'exported']),
  ]);
  const open = [...(asBuyer.data ?? []), ...(asSeller.data ?? [])].filter((o) => !CLOSED.includes(o.status)).length;
  const L = await ledgerStore();
  const k = sellerKey(userId);
  const held = (await L.balance(acct.pending(k))) + (await L.balance(acct.available(k))) + (await L.balance(acct.reserve(k)));
  const debt = await L.balance(acct.debt(k));
  return { openOrders: open, openDisputes: disputes.data?.length ?? 0, pendingPayouts: payouts.data?.length ?? 0, moneyHeldCents: held, debtCents: debt };
}

/* Everything we hold about this person. Own rows only; other people appear only as ids. */
export async function exportData(userId: string): Promise<Record<string, unknown>> {
  if (!(await pg()) || !UUID.test(userId)) return { note: 'There is no account data in demo mode.' };
  const db = createAdminClient();
  const [profile, seller, dev, asBuyer, asSeller, disputes, reviews, notes, presale, blocked, actions, downloads, requests, products] = await Promise.all([
    db.from('profiles').select('id, role, full_name, strikes, flagged, banned, suspended_until, created_at').eq('id', userId).maybeSingle(),
    db.from('seller_profiles').select('display_name, bio, payout_method, email_verified, phone_verified, id_verified, created_at').eq('user_id', userId).maybeSingle(),
    db.from('dev_profiles').select('handle, name, headline, gig, country, bio, langs, skills, areas, packs, avail, status, created_at').eq('user_id', userId).maybeSingle(),
    db
      .from('orders')
      .select('id, kind, status, title, price_cents, currency, lines, domain, created_at, funded_at, delivered_at, accepted_at, seller_id, payment_brand, payment_last4')
      .eq('buyer_id', userId),
    db.from('orders').select('id, kind, status, title, price_cents, fee_cents, currency, created_at, funded_at, delivered_at, accepted_at, buyer_id').eq('seller_id', userId),
    db.from('disputes').select('id, order_id, reason, detail, status, decision, created_at, decided_at').eq('opened_by', userId),
    db.from('reviews').select('order_id, product_key, rating, body, created_at').eq('buyer_id', userId),
    db.from('notifications').select('kind, payload, read_at, created_at').eq('user_id', userId),
    db.from('presale_messages').select('product_key, body, reply, created_at').or(`buyer_id.eq.${userId},seller_id.eq.${userId}`),
    db.from('blocked_messages').select('reason, body, context, product_key, created_at').eq('sender_id', userId),
    db.from('account_actions').select('action, reason, until, created_at').eq('user_id', userId),
    db.from('download_events').select('order_id, kind, ip, file_hash, bytes, created_at').eq('user_id', userId),
    db.from('data_requests').select('kind, status, created_at, done_at').eq('user_id', userId),
    db.from('products').select('slug, name, category, status, price_cents, description, includes, created_at').eq('seller_id', userId),
  ]);
  const orderIds = [...(asBuyer.data ?? []), ...(asSeller.data ?? [])].map((o) => o.id);
  const events = orderIds.length ? await db.from('order_events').select('order_id, event, from_state, to_state, created_at').in('order_id', orderIds).order('id') : { data: [] };
  const consents = await db.from('order_consents').select('order_id, kind, text_version, ip, user_agent, created_at').eq('user_id', userId); // empty before migration 0034
  return stripSecrets({
    generatedAt: new Date().toISOString(),
    about: 'Everything SellOnBay holds about your account. Other people appear only as ids. Payments, orders and the ledger are also kept in our accounting records.',
    email: (await db.auth.admin.getUserById(userId)).data.user?.email ?? null,
    profile: profile.data,
    sellerProfile: seller.data,
    developerProfile: dev.data,
    listings: products.data,
    ordersAsBuyer: asBuyer.data,
    ordersAsSeller: asSeller.data,
    orderHistory: events.data,
    disputesYouOpened: disputes.data,
    reviews: reviews.data,
    notifications: notes.data,
    preSaleQuestions: presale.data,
    blockedMessages: blocked.data,
    accountActions: actions.data,
    downloads: downloads.data,
    acceptances: consents.data ?? [],
    dataRequests: requests.data,
  });
}

export type Result<T = true> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

export async function logExport(userId: string) {
  if (await pg()) await createAdminClient().from('data_requests').insert({ user_id: userId, kind: 'export', status: 'done', done_at: new Date().toISOString() });
}

export async function requestDeletion(userId: string): Promise<Result<{ blockers: string[] }>> {
  if (!(await pg())) return fail(404, 'There are no accounts in demo mode.');
  const blockers = deletionBlockers(await snapshot(userId));
  if (blockers.length) return { ok: false, status: 409, error: blockers.join(' ') };
  const db = createAdminClient();
  const { data: open } = await db.from('data_requests').select('id').eq('user_id', userId).eq('kind', 'delete').eq('status', 'pending').limit(1);
  if (open?.length) return fail(409, 'You already asked to delete your account. We will process it soon.');
  const { error } = await db.from('data_requests').insert({ user_id: userId, kind: 'delete' });
  if (error) return fail(500, 'Could not save the request.');
  return { ok: true, value: { blockers: [] } };
}

export async function myRequests(userId: string): Promise<DataRequest[]> {
  if (!(await pg())) return [];
  const { data } = await createAdminClient().from('data_requests').select('id, user_id, kind, status, note, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
  return (data ?? []).map((r) => ({ id: r.id, userId: r.user_id, kind: r.kind, status: r.status, note: r.note ?? undefined, createdAt: Date.parse(r.created_at) }));
}
export async function pendingDeletions(): Promise<(DataRequest & { name: string })[]> {
  if (!(await pg())) return [];
  const db = createAdminClient();
  const { data } = await db.from('data_requests').select('id, user_id, kind, status, note, created_at').eq('kind', 'delete').eq('status', 'pending').order('created_at').limit(100);
  const rows = data ?? [];
  const { data: names } = rows.length
    ? await db
        .from('profiles')
        .select('id, full_name')
        .in(
          'id',
          rows.map((r) => r.user_id),
        )
    : { data: [] as { id: string; full_name: string }[] };
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    status: r.status,
    note: r.note ?? undefined,
    createdAt: Date.parse(r.created_at),
    name: names?.find((n) => n.id === r.user_id)?.full_name || '(no name)',
  }));
}

/* An admin processes a deletion request: anonymise, lock, and say so in the audit log. Refused (and the person told why) while anything is open. */
export async function processDeletion(adminId: string | null, requestId: string): Promise<Result> {
  if (!(await pg())) return fail(404, 'There are no accounts in demo mode.');
  const db = createAdminClient();
  const { data: r } = await db.from('data_requests').select('id, user_id, kind, status').eq('id', requestId).maybeSingle();
  if (!r || r.kind !== 'delete') return fail(404, 'Request not found.');
  if (r.status !== 'pending') return fail(409, 'This request is already handled.');
  const userId = r.user_id as string;
  const { data: p } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (p?.role === 'admin') return fail(400, 'Remove the admin role first.');
  const blockers = deletionBlockers(await snapshot(userId));
  if (blockers.length) {
    await db
      .from('data_requests')
      .update({ status: 'refused', note: blockers.join(' '), done_at: new Date().toISOString(), done_by: adminId })
      .eq('id', requestId);
    await audit(adminId, 'deletion_refused', 'profile', userId, { blockers });
    return fail(409, 'Refused for now: ' + blockers.join(' '));
  }
  // Every step is checked. If one fails the request stays pending (it can be run again: every step is safe to repeat) and the admin sees which step.
  const failed: string[] = [];
  const step = async (name: string, run: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run;
    if (error) failed.push(`${name}: ${error.message}`);
  };
  await step('profile', db.from('profiles').update({ full_name: 'Deleted user', banned: true }).eq('id', userId));
  await step('seller profile', db.from('seller_profiles').delete().eq('user_id', userId));
  await step('developer profile', db.from('dev_profiles').delete().eq('user_id', userId));
  await step('notifications', db.from('notifications').delete().eq('user_id', userId));
  await step('questions asked', db.from('presale_messages').update({ body: '[deleted]', ip: null }).eq('buyer_id', userId));
  await step('answers given', db.from('presale_messages').update({ reply: '[deleted]' }).eq('seller_id', userId).not('reply', 'is', null));
  await step('blocked messages', db.from('blocked_messages').update({ body: '[deleted]', ip: null }).eq('sender_id', userId));
  await step('hire briefs', db.from('hire_requests').update({ brief: "[deleted at the person's request]" }).eq('buyer_id', userId));
  await step('live listings', db.from('products').update({ status: 'paused', review_note: 'Paused: the seller deleted their account.' }).eq('seller_id', userId).eq('status', 'live'));
  forgetLiveProducts();
  // Unpublished listings go, except those that past orders or reviews point to: those are kept as rejected so the records stay whole.
  const { data: unpublished, error: listErr } = await db.from('products').select('id').eq('seller_id', userId).in('status', ['draft', 'in_review', 'rejected']);
  if (listErr) failed.push(`unpublished listings: ${listErr.message}`);
  for (const l of unpublished ?? []) {
    const { error } = await db.from('products').delete().eq('id', l.id);
    if (error) await step('unpublished listing', db.from('products').update({ status: 'rejected', review_note: 'The seller deleted their account.' }).eq('id', l.id));
  }
  const { error: authErr } = await db.auth.admin.updateUserById(userId, { email: `deleted-${userId}@deleted.invalid`, ban_duration: '876000h', user_metadata: {} });
  if (authErr) failed.push(`sign-in account: ${authErr.message}`);
  if (failed.length) {
    await audit(adminId, 'deletion_incomplete', 'profile', userId, { requestId, failed });
    return fail(500, 'Not finished, the request is still pending. Run it again. Failed: ' + failed.join('; '));
  }
  await db.from('data_requests').update({ status: 'done', done_at: new Date().toISOString(), done_by: adminId }).eq('id', requestId);
  await audit(adminId, 'account_anonymised', 'profile', userId, { requestId });
  return { ok: true, value: true };
}
