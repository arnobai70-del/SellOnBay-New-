import 'server-only';
import { mayBuy } from '../accounts';
import { auditStrict } from '../admin/audit';
import { productRecord } from '../catalog';
import { cashReceived, MANUAL_REF } from '../ledger';
import { ledgerStore } from '../ledgerStore';
import { notify } from '../notify';
import type { Order, OrderEvent } from '../orders/machine';
import { fund } from '../orders/service';
import { orderStore } from '../orders/store';
import { commissionFor } from '../plans/rules';
import { sellerPlan } from '../plans/service';
import { currentPlan } from '../plans/store';
import { getSettings } from '../settings';
import { createAdminClient } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';

/*
 * Cash at a point of sale (owner, 2026-11-08): treated exactly like a verified bank transfer. An admin records the cash with its receipt number;
 * the order is created at the listing's price for the buyer's own account, the cash goes into "cash on hand" (held by SellOnBay) and funds the order
 * through the same path as a reconciled transfer. Then the normal flow: 48-hour review, acceptance, the 7-day hold, the Thursday payout of the
 * seller's share. Closed while the free beta runs. The admin who took the cash is in the audit log, before anything changes.
 */
type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
export const RECEIPT = /^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/;

async function buyerByEmail(email: string): Promise<{ id: string; role: string } | null> {
  if (!supabaseConfigured) return null;
  const db = createAdminClient();
  const want = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === want);
    if (u) {
      const { data: p } = await db.from('profiles').select('role, banned').eq('id', u.id).single();
      return p && !p.banned ? { id: u.id, role: p.role } : null;
    }
    if (!data || data.users.length < 200) break;
  }
  return null;
}

export async function cashSale(adminId: string | null, input: { buyerEmail: string; productKey: string; receipt: string; amountCents: number }, now = Date.now()): Promise<R<{ orderId: string }>> {
  if ((await getSettings()).paymentsMode !== 'live') return fail(409, 'The cash desk opens when live payments start.');
  const receipt = input.receipt.trim();
  if (!RECEIPT.test(receipt)) return fail(400, 'Write the receipt number: 3 to 40 letters, numbers and dashes.');
  const L = await ledgerStore();
  if ((await L.lines(`cash-in:${receipt}`)).length) return fail(409, 'That receipt number is already recorded.');
  const buyer = await buyerByEmail(input.buyerEmail);
  if (!buyer || !mayBuy(buyer.role)) return fail(404, 'No buyer account with that email. The buyer needs an account first.');
  const found = await productRecord(input.productKey);
  if (!found || found.status !== 'live' || !found.product.dbId) return fail(404, 'That website is not on sale.');
  const p = found.product;
  if (p.sellerId === buyer.id) return fail(409, 'A seller cannot buy their own website.');
  const priceCents = Math.round(p.price * 100);
  if (input.amountCents !== priceCents) return fail(400, `The cash must be the listing's price, $${(priceCents / 100).toFixed(2)}.`);
  const ownerType = p.ownerType ?? (p.sellerId ? 'seller' : 'platform');
  const plan = p.sellerId && ownerType === 'seller' ? (await sellerPlan(p.sellerId)).plan : await currentPlan('free');
  const money = commissionFor([{ label: p.name, cents: priceCents, kind: 'product' }], plan, ownerType);

  const id = crypto.randomUUID();
  await auditStrict(adminId, 'cash_received', 'order', id, { receipt, amount: priceCents, product: p.id, buyer: buyer.id });
  const order: Order = {
    id,
    kind: 'product',
    pkg: 'asis',
    deliveryType: p.repo ? 'repo_access' : 'download',
    state: 'awaiting_payment',
    title: p.name,
    buyerId: buyer.id,
    sellerId: p.sellerId ?? null,
    productId: p.dbId ?? null,
    productKey: p.id,
    devKey: null,
    lines: [[p.name, priceCents]],
    priceCents,
    feeCents: money.feeCents,
    refundedCents: 0,
    currency: 'USD',
    days: p.days,
    hours: p.hours,
    express: false,
    instant: false,
    demo: false,
    licence: 'standard',
    attempts: 0,
    createdAt: now,
    sellerGrossCents: money.sellerGrossCents,
    feePlanId: plan.id,
  };
  const created: OrderEvent = { orderId: id, actorId: adminId, event: 'created_at_pos', from: null, to: 'awaiting_payment', meta: { receipt, total: priceCents }, at: now };
  await (await orderStore()).insert(order, created);
  await L.post(cashReceived(id, receipt, priceCents));
  const r = await fund(id, { ref: `${MANUAL_REF}cash:${receipt}`, brand: 'Cash', last4: '' }, undefined, adminId);
  if (!r.ok) return fail(409, `The cash was recorded but the order could not be funded: ${r.error}`);
  await notify(buyer.id, 'payment_reconciled', { title: p.name });
  return { ok: true, value: { orderId: id } };
}
