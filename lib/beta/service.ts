import 'server-only';
import { audit } from '../admin/audit';
import { productRecord } from '../catalog';
import { emailProvider } from '../providers/email';
import { EMAIL_ROUTES, emailSenderFor } from '../emailRouting';
import { examplesBuyable } from '../examples';
import { notify } from '../notify';
import { getOrder, insertBetaOrder, move } from '../orders/service';
import { orderStore } from '../orders/store';
import type { Order } from '../orders/machine';
import { getSettings } from '../settings';
import { SITE_URL } from '../site';
import { createAdminClient } from '../supabase/server';
import { BETA_METHOD, betaEligible, checkBetaInput, checkFeedback, feedbackDue, type BetaFeedback, type BetaInput } from './rules';

/*
 * A beta request is an order with a total of $0 and no money anywhere: never funded, so never in the ledger, never in escrow and never in a payout. The record is the
 * order_events row, plus the buyer's answers here. Sales emails that fail are tried again by the scheduled job (sales_notified_at).
 */
export type BetaRequest = BetaInput & {
  orderId: string;
  buyerId: string;
  productKey: string;
  decidedBy?: string;
  decidedAt?: number;
  declineReason?: string;
  salesNotifiedAt?: number;
  feedbackSentAt?: number;
  createdAt: number;
};
export type BetaAnswers = BetaFeedback & { orderId: string; at: number };
export type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

const g = globalThis as unknown as { __beta?: { req: Map<string, BetaRequest>; fb: Map<string, BetaAnswers> } };
const mem = (g.__beta ??= { req: new Map(), fb: new Map() });
const pg = async () => (await orderStore()).kind === 'postgres';

type Row = {
  order_id: string;
  buyer_id: string;
  product_key: string;
  name: string;
  email: string;
  country: string;
  company: string;
  use_for: string;
  domain: string;
  decided_by: string | null;
  decided_at: string | null;
  decline_reason: string | null;
  sales_notified_at: string | null;
  feedback_sent_at: string | null;
  created_at: string;
};
const ms = (s: string | null) => (s ? Date.parse(s) : undefined);
const toReq = (r: Row): BetaRequest => ({
  orderId: r.order_id,
  buyerId: r.buyer_id,
  productKey: r.product_key,
  name: r.name,
  email: r.email,
  country: r.country,
  company: r.company,
  useFor: r.use_for,
  domain: r.domain,
  decidedBy: r.decided_by ?? undefined,
  decidedAt: ms(r.decided_at),
  declineReason: r.decline_reason ?? undefined,
  salesNotifiedAt: ms(r.sales_notified_at),
  feedbackSentAt: ms(r.feedback_sent_at),
  createdAt: Date.parse(r.created_at),
});

export async function betaRequest(orderId: string): Promise<BetaRequest | null> {
  if (!(await pg())) return mem.req.get(orderId) ?? null;
  const { data } = await createAdminClient().from('beta_requests').select('*').eq('order_id', orderId).maybeSingle();
  return data ? toReq(data as Row) : null;
}

/* Newest first; waiting ones only when asked. */
export async function betaRequests(filter: { waiting?: boolean } = {}): Promise<BetaRequest[]> {
  if (!(await pg())) return [...mem.req.values()].filter((r) => !filter.waiting || !r.decidedAt).sort((a, b) => b.createdAt - a.createdAt);
  let q = createAdminClient().from('beta_requests').select('*').order('created_at', { ascending: false }).limit(500);
  if (filter.waiting) q = q.is('decided_at', null);
  return ((await q).data ?? []).map((r) => toReq(r as Row));
}

async function mailSales(r: BetaRequest, title: string, now: number): Promise<void> {
  await emailProvider().send({
    to: EMAIL_ROUTES.sales,
    from: emailSenderFor('support'),
    replyTo: r.email,
    subject: `New beta request: ${title}`.slice(0, 150),
    text: `${r.name} (${r.email}, ${r.country}${r.company ? `, ${r.company}` : ''}) asked for ${title}.\n\nWill use it for: ${r.useFor}\n${r.domain ? `Domain: ${r.domain}\n` : ''}\nReview it: ${SITE_URL}/dashboard/admin/beta`,
    idempotencyKey: `beta-sales/${r.orderId}`,
  });
  if (await pg())
    await createAdminClient()
      .from('beta_requests')
      .update({ sales_notified_at: new Date(now).toISOString() })
      .eq('order_id', r.orderId);
  else mem.req.set(r.orderId, { ...r, salesNotifiedAt: now });
}

export async function requestBeta(buyerId: string, key: string, raw: Partial<Record<keyof BetaInput, unknown>>, now = Date.now()): Promise<R<Order>> {
  if ((await getSettings()).paymentsMode !== 'beta_free') return fail(409, 'The free beta has ended.');
  const input = checkBetaInput(raw);
  if (!input.ok) return fail(400, input.error);
  const found = await productRecord(key);
  if (!found || found.status !== 'live') return fail(404, 'This website is not available.');
  const p = found.product;
  const isExample = !p.sellerId;
  if (isExample ? !examplesBuyable() : !betaEligible(p)) return fail(409, 'This website is available after beta.');
  if (p.sellerId === buyerId) return fail(409, 'This is your own website.');
  const mine = await betaRequests();
  if (mine.some((r) => r.buyerId === buyerId && r.productKey === p.id && (!r.decidedAt || !r.declineReason))) return fail(409, 'You have already requested this website.');

  const order = await insertBetaOrder(
    {
      title: p.name,
      buyerId,
      sellerId: p.sellerId ?? null,
      productId: p.dbId,
      productKey: p.id,
      deliveryType: p.repo ? 'repo_access' : 'download',
      days: p.days,
      hours: p.hours,
      licence: 'standard',
      meta: { amount: 0, method: BETA_METHOD, licence: 'standard' },
    },
    now,
  );
  const row: BetaRequest = { ...input.value, orderId: order.id, buyerId, productKey: p.id, createdAt: now };
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('beta_requests')
      .insert({
        order_id: order.id,
        buyer_id: buyerId,
        product_id: p.dbId ?? null,
        product_key: p.id,
        name: row.name,
        email: row.email,
        country: row.country,
        company: row.company,
        use_for: row.useFor,
        domain: row.domain,
        created_at: new Date(now).toISOString(),
      });
    if (error) {
      // Without its answers the order cannot be reviewed: close it, and let the buyer try again.
      await move(order.id, 'beta_declined', { actorId: null, event: 'beta_request_failed', meta: { amount: 0, method: BETA_METHOD }, now }).catch(() => {});
      return fail(500, 'Could not save your request. Please try again.');
    }
  } else mem.req.set(order.id, row);

  // The request is saved, so a mail problem never loses it: the scheduled job tries again.
  await mailSales(row, p.name, now).catch(() => {});
  await notify(buyerId, 'beta_requested', { title: p.name, orderId: order.id });
  return { ok: true, value: order };
}

export async function decideBeta(adminId: string | null, orderId: string, decision: 'approve' | 'decline', reason: string, now = Date.now()): Promise<R<Order>> {
  const r = await betaRequest(orderId);
  if (!r) return fail(404, 'Request not found.');
  if (r.decidedAt) return fail(409, 'This request has already been decided.');
  const why = reason.trim();
  if (decision === 'decline' && (why.length < 5 || why.length > 500)) return fail(400, 'Write the reason for the buyer (5 to 500 characters).');
  const moved = await move(orderId, decision === 'approve' ? 'beta_approved' : 'beta_declined', {
    actorId: adminId,
    event: decision === 'approve' ? 'beta_approved' : 'beta_declined',
    meta: { amount: 0, method: BETA_METHOD, ...(why ? { reason: why } : {}) },
    now,
  });
  if (!moved.ok) return moved;
  const patch = { decidedBy: adminId ?? undefined, decidedAt: now, declineReason: decision === 'decline' ? why : undefined };
  if (await pg())
    await createAdminClient()
      .from('beta_requests')
      .update({ decided_by: adminId, decided_at: new Date(now).toISOString(), decline_reason: patch.declineReason ?? null })
      .eq('order_id', orderId);
  else mem.req.set(orderId, { ...r, ...patch });
  await audit(adminId, decision === 'approve' ? 'beta_approved' : 'beta_declined', 'order', orderId, why ? { reason: why } : {});
  await notify(r.buyerId, decision === 'approve' ? 'beta_approved' : 'beta_declined', { title: moved.order.title, orderId, reason: why });
  return { ok: true, value: moved.order };
}

/* The scheduled job: sales emails that failed, and the feedback email 7 days after approval. Each goes once. */
export async function runBetaJobs(now = Date.now()): Promise<{ sales: number; feedback: number }> {
  let sales = 0;
  let feedback = 0;
  for (const r of await betaRequests()) {
    if (!r.salesNotifiedAt && !r.decidedAt) {
      const o = await getOrder(r.orderId);
      await mailSales(r, o?.title ?? r.productKey, now).then(
        () => sales++,
        () => {},
      );
    }
    if (feedbackDue({ decidedAt: r.decidedAt, approved: !r.declineReason, feedbackSentAt: r.feedbackSentAt }, now)) {
      const o = await getOrder(r.orderId);
      await notify(r.buyerId, 'beta_feedback', { title: o?.title ?? r.productKey, orderId: r.orderId, url: `${SITE_URL}/feedback/${r.orderId}` }, { dedupe: r.orderId });
      if (await pg())
        await createAdminClient()
          .from('beta_requests')
          .update({ feedback_sent_at: new Date(now).toISOString() })
          .eq('order_id', r.orderId);
      else mem.req.set(r.orderId, { ...r, feedbackSentAt: now });
      feedback++;
    }
  }
  return { sales, feedback };
}

export async function betaFeedbackOf(orderId: string): Promise<BetaAnswers | null> {
  if (!(await pg())) return mem.fb.get(orderId) ?? null;
  const { data } = await createAdminClient().from('beta_feedback').select('*').eq('order_id', orderId).maybeSingle();
  return data ? { orderId: data.order_id, rating: data.rating, worked: data.worked, improve: data.improve, at: Date.parse(data.created_at) } : null;
}

export async function allBetaFeedback(): Promise<BetaAnswers[]> {
  if (!(await pg())) return [...mem.fb.values()].sort((a, b) => b.at - a.at);
  const { data } = await createAdminClient().from('beta_feedback').select('*').order('created_at', { ascending: false }).limit(500);
  return (data ?? []).map((d) => ({ orderId: d.order_id, rating: d.rating, worked: d.worked, improve: d.improve, at: Date.parse(d.created_at) }));
}

export async function saveFeedback(buyerId: string, orderId: string, raw: Partial<Record<keyof BetaFeedback, unknown>>, now = Date.now()): Promise<R<true>> {
  const r = await betaRequest(orderId);
  if (!r || r.buyerId !== buyerId) return fail(404, 'Request not found.');
  if (!r.decidedAt || r.declineReason) return fail(409, 'Feedback opens after your request is approved.');
  const v = checkFeedback(raw);
  if (!v.ok) return fail(400, v.error);
  if (await betaFeedbackOf(orderId)) return fail(409, 'You have already sent your feedback. Thank you.');
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('beta_feedback')
      .insert({ order_id: orderId, rating: v.value.rating, worked: v.value.worked, improve: v.value.improve, created_at: new Date(now).toISOString() });
    if (error) return fail(500, 'Could not save your feedback.');
  } else mem.fb.set(orderId, { ...v.value, orderId, at: now });
  return { ok: true, value: true };
}
