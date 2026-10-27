import 'server-only';
import { auditStrict } from '../admin/audit';
import { DAY_MS } from '../config';
import { notify } from '../notify';
import { givesBenefits, isPlanCode, mayMove, mayPublishAnother, priceFor, type Billing, type Plan, type SubState } from './rules';
import { currentPlan, insertSubscription, openSubscription, planById, publishedOrWaiting, subscriptionById, updateSubscription, type Subscription } from './store';

/*
 * Seller plans: what a seller is on, and the only ways it changes. A seller may ask for a plan; every other step (taking payment, starting,
 * renewing, a failed renewal, cancelling, ending) is an admin decision made case by case with a reason (O-4). Each step is written to the
 * subscription's own append-only log and to the audit log before it counts.
 */
export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

/* The plan a seller is on now: the subscription's plan while it gives benefits, otherwise Free. */
export async function sellerPlan(sellerId: string): Promise<{ plan: Plan; subscription: Subscription | null }> {
  const sub = await openSubscription(sellerId);
  if (sub && givesBenefits(sub.status)) {
    const p = await planById(sub.planId);
    if (p) return { plan: p, subscription: sub };
  }
  return { plan: await currentPlan('free'), subscription: sub };
}

/* May this seller send one more listing to be published? (O-3) Existing listings are never unpublished by a plan change. */
export async function checkListingLimit(sellerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { plan } = await sellerPlan(sellerId);
  return mayPublishAnother(await publishedOrWaiting(sellerId), plan);
}

/* A seller asks for Pro or Business. Nothing is charged here; an admin takes it from there. */
export async function requestPlan(sellerId: string, code: string, billing: string): Promise<Result<Subscription>> {
  if (!isPlanCode(code) || code === 'free') return fail(400, 'Choose Pro or Business.');
  if (billing !== 'monthly' && billing !== 'yearly') return fail(400, 'Choose monthly or yearly.');
  if (await openSubscription(sellerId)) return fail(409, 'You already have a plan request or subscription. Message SellOnBay to change it.');
  const plan = await currentPlan(code);
  try {
    const sub = await insertSubscription(
      { sellerId, planId: plan.id, billing: billing as Billing, status: 'requested', priceCents: priceFor(plan, billing as Billing) },
      { actorId: sellerId, event: 'requested', from: null, to: 'requested', reason: `${plan.name}, ${billing}`, meta: { plan: plan.code, version: plan.version } },
    );
    return { ok: true, value: sub };
  } catch (e) {
    return fail(409, (e as Error).message);
  }
}

export const ADMIN_SUB_ACTIONS = ['await_payment', 'activate', 'renewal_due', 'renew', 'renewal_failed', 'cancel', 'end', 'resume'] as const;
export type AdminSubAction = (typeof ADMIN_SUB_ACTIONS)[number];
const TARGET: Record<AdminSubAction, SubState> = {
  await_payment: 'pending_payment',
  activate: 'active',
  renewal_due: 'renewal_due',
  renew: 'active',
  renewal_failed: 'renewal_failed',
  cancel: 'cancelling',
  end: 'ended',
  resume: 'active',
};

/*
 * An admin moves a subscription. `activate` and `renew` need the reference of a payment Finance has reconciled and the new period end; nothing
 * is assumed about automatic renewals, grace periods or refunds (O-4). Audited first, then saved only if nobody else changed it meanwhile.
 */
export async function adminSubscriptionAction(
  adminId: string | null,
  subscriptionId: string,
  action: AdminSubAction,
  input: { reason: string; paymentRef?: string; periodDays?: number },
  now = Date.now(),
): Promise<Result<Subscription>> {
  const why = input.reason.trim();
  if (why.length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  if (why.length > 500) return fail(400, 'Keep the reason under 500 characters.');
  if (!(ADMIN_SUB_ACTIONS as readonly string[]).includes(action)) return fail(400, 'Unknown action.');
  const sub = await subscriptionById(subscriptionId);
  if (!sub) return fail(404, 'Subscription not found.');
  const to = TARGET[action];
  if (!mayMove(sub.status, to)) return fail(409, `A subscription that is ${sub.status.replace('_', ' ')} cannot be moved to ${to.replace('_', ' ')}.`);
  const patch: Partial<Pick<Subscription, 'status' | 'periodStart' | 'periodEnd'>> = { status: to };
  const meta: Record<string, unknown> = {};
  if (action === 'activate' || action === 'renew') {
    const ref = (input.paymentRef ?? '').trim();
    if (ref.length < 3 || ref.length > 100) return fail(400, 'Give the reference of the payment Finance reconciled.');
    const days = Math.round(Number(input.periodDays));
    if (!Number.isInteger(days) || days < 1 || days > 400) return fail(400, 'Give the length of the paid period in days (1 to 400).');
    const start = action === 'renew' && sub.periodEnd && sub.periodEnd > now ? sub.periodEnd : now;
    patch.periodStart = start;
    patch.periodEnd = start + days * DAY_MS;
    meta.paymentRef = ref;
    meta.periodDays = days;
  }
  await auditStrict(adminId, `subscription_${action}`, 'subscription', sub.id, { reason: why, from: sub.status, to, seller: sub.sellerId, ...meta });
  try {
    const next = await updateSubscription(sub, patch, { actorId: adminId, event: action, from: sub.status, to, reason: why, meta });
    const plan = await planById(sub.planId);
    await notify(sub.sellerId, 'plan_changed', { plan: plan?.name ?? 'your plan', status: to.replace('_', ' ') });
    return { ok: true, value: next };
  } catch (e) {
    return fail(409, (e as Error).message);
  }
}
