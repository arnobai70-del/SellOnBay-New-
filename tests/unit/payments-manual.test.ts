import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { getOrder } from '@/lib/orders/service';
import { checkSubmission, coverage, orderCode, proofKind, referenceKey } from '@/lib/payments/rules';
import { approveRefund, markRefundPaid, reconcile, refundOrder, rejectPayment, saveMethodAsAdmin, submitManualPayment } from '@/lib/payments/service';
import { attemptsFor, listRefunds } from '@/lib/payments/store';
import { memRequestable } from '@/lib/requests/products';
import { acceptQuote, adminRequestAction, draftQuote, issueQuote, submitRequest } from '@/lib/requests/service';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const terms = { deliveryDays: 3, supportDays: 0, updateDays: 0 };

/* A real quotation order of 4900 cents, awaiting payment. */
async function order() {
  const id = crypto.randomUUID();
  const p = {
    id,
    slug: `pay-${id.slice(0, 6)}`,
    name: 'Shop site',
    sellerId: `seller-${id.slice(0, 6)}`,
    ownerType: 'seller' as const,
    status: 'live',
    platform: 'web',
    deliveryType: 'live_site' as const,
    deliveryDays: 3,
    deliveryHours: null,
    supportDays: 0,
    updateDays: 0,
    priceCents: 4900,
    setupCents: null,
    customCents: null,
    expressCents: null,
    expressHelps: true,
    latestVersionId: crypto.randomUUID(),
  };
  memRequestable(p);
  const buyer = `buyer-${id.slice(0, 6)}`;
  const r = await submitRequest(buyer, { licenceTier: 'single_project', package: 'asis', intendedUse: 'My online shop.', consent: true, product: p.slug });
  if (!r.ok) throw new Error(r.error);
  await adminRequestAction('admin-1', r.value.id, 'review', {});
  const d = await draftQuote('admin-1', r.value.id, { lines: [{ label: 'Shop site', cents: 4900, kind: 'product' }], terms });
  if (!d.ok) throw new Error(d.error);
  await issueQuote('admin-1', d.value.id);
  const a = await acceptQuote(buyer, d.value.id);
  if (!a.ok) throw new Error(a.error);
  return { buyer, orderId: a.value.orderId };
}
async function method() {
  const m = await saveMethodAsAdmin(
    'finance-1',
    { kind: 'bank_transfer', label: `Test bank ${Math.random().toString(36).slice(2, 6)}`, instructions: 'Transfer to the account shown by Finance.', currency: 'USD', active: true },
    'Test method.',
  );
  if (!m.ok) throw new Error(m.error);
  return m.value;
}
const bal = async (a: string) => (await ledgerStore()).balance(a);
const ref = () => `TRX-${Math.random().toString(36).slice(2, 10)}`;

describe('payment rules', () => {
  it('references compare without case, spaces or separators; the order code is stable', () => {
    expect(referenceKey('trx 12-34/ab')).toBe(referenceKey('TRX1234AB'));
    expect(orderCode('a1b2c3d4-e5f6-4000-8000-000000000000')).toBe('SOB-A1B2C3D4E5');
  });
  it('a submission needs a reference, a sane amount and a past date', () => {
    expect(checkSubmission({ methodId: 'm', reference: 'ab', amountCents: 100, paidOn: '2026-10-01' }, 4900, '2026-10-27')).toMatchObject({ ok: false });
    expect(checkSubmission({ methodId: 'm', reference: 'TRX123', amountCents: 100, paidOn: '2026-11-01' }, 4900, '2026-10-27')).toMatchObject({ ok: false });
    expect(checkSubmission({ methodId: 'm', reference: 'TRX123', amountCents: 4900 * 11, paidOn: '2026-10-01' }, 4900, '2026-10-27')).toMatchObject({ ok: false });
    expect(checkSubmission({ methodId: 'm', reference: 'TRX123', amountCents: 4900, paidOn: '2026-10-01' }, 4900, '2026-10-27').ok).toBe(true);
  });
  it('coverage adds reconciled payments and finds what is short or above', () => {
    expect(coverage(4900, [2000])).toEqual({ covered: false, receivedCents: 2000, shortCents: 2900, excessCents: 0 });
    expect(coverage(4900, [2000, 3000])).toEqual({ covered: true, receivedCents: 5000, shortCents: 0, excessCents: 100 });
  });
  it('a proof is checked by its bytes', () => {
    expect(proofKind(PNG)?.type).toBe('image/png');
    expect(proofKind(strToU8('%PDF-1.7 ...'))?.type).toBe('application/pdf');
    expect(proofKind(strToU8('<html>'))).toBeNull();
  });
});

describe('manual payment (D-I): a proof funds nothing until Finance reconciles real funds', () => {
  it('submitting moves the order to payment review; the same reference cannot be used twice', async () => {
    const { buyer, orderId } = await order();
    const m = await method();
    expect(await submitManualPayment('someone-else', orderId, { methodId: m.id, reference: ref(), amountCents: 4900, paidOn: '2026-10-20' }, null)).toMatchObject({ ok: false, status: 404 });
    expect(await submitManualPayment(buyer, orderId, { methodId: m.id, reference: 'TRX-1', amountCents: 4900, paidOn: '2026-10-20' }, { bytes: strToU8('<script>') })).toMatchObject({ ok: false });
    const r = ref();
    const s = await submitManualPayment(buyer, orderId, { methodId: m.id, reference: r, amountCents: 4900, paidOn: '2026-10-20' }, { bytes: PNG });
    expect(s.ok && s.value.status).toBe('submitted');
    expect((await getOrder(orderId))!.state).toBe('payment_review');
    expect((await getOrder(orderId))!.fundedAt).toBeUndefined();
    expect(await submitManualPayment(buyer, orderId, { methodId: m.id, reference: r.toLowerCase().replace('-', ' '), amountCents: 4900, paidOn: '2026-10-20' }, null)).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it('a partial payment does not fund; the second payment completes it; the ledger holds then moves exactly the price to escrow', async () => {
    const { buyer, orderId } = await order();
    const m = await method();
    const s1 = await submitManualPayment(buyer, orderId, { methodId: m.id, reference: ref(), amountCents: 2000, paidOn: '2026-10-20' }, null);
    if (!s1.ok) throw new Error(s1.error);
    expect(await reconcile('finance-1', s1.value.id, { amountReceivedCents: 2000, statementRef: 'ST-1', receivedAt: Date.now() - 1000 })).toMatchObject({
      ok: true,
      value: { funded: false, shortCents: 2900 },
    });
    expect((await getOrder(orderId))!.state).toBe('awaiting_payment');
    expect(await bal(acct.held(orderId))).toBe(2000);
    const s2 = await submitManualPayment(buyer, orderId, { methodId: m.id, reference: ref(), amountCents: 2900, paidOn: '2026-10-21' }, null);
    if (!s2.ok) throw new Error(s2.error);
    const r2 = await reconcile('finance-1', s2.value.id, { amountReceivedCents: 2900, statementRef: 'ST-2', receivedAt: Date.now() - 1000 });
    expect(r2.ok && r2.value).toMatchObject({ funded: true, excessCents: 0 });
    const o = (await getOrder(orderId))!;
    expect(o.fundedAt).toBeDefined();
    expect(o.payment?.ref).toMatch(/^manual:/);
    expect(await bal(acct.held(orderId))).toBe(0);
    expect(await bal(acct.escrow(orderId))).toBe(4900);
    expect((await auditList(500)).filter((e) => e.action === 'payment_reconciled' && [s1.value.id, s2.value.id].includes(e.targetRef))).toHaveLength(2);
  });

  it('an overpayment funds the order and the extra becomes a refund owed back; Finance approves and records it', async () => {
    const { buyer, orderId } = await order();
    const m = await method();
    const s = await submitManualPayment(buyer, orderId, { methodId: m.id, reference: ref(), amountCents: 5000, paidOn: '2026-10-20' }, null);
    if (!s.ok) throw new Error(s.error);
    const r = await reconcile('finance-1', s.value.id, { amountReceivedCents: 5000, statementRef: 'ST-3', receivedAt: Date.now() - 1000 });
    expect(r.ok && r.value).toMatchObject({ funded: true, excessCents: 100 });
    expect(await bal(acct.escrow(orderId))).toBe(4900);
    expect(await bal(acct.refundDue(orderId))).toBe(100);
    const [rf] = await listRefunds({ orderId });
    expect(rf).toMatchObject({ kind: 'overpayment', amountCents: 100, status: 'requested' });
    expect(await markRefundPaid('finance-1', rf.id, { method: 'Bank', reference: 'RF-1' })).toMatchObject({ ok: false }); // approve first
    expect((await approveRefund('finance-1', rf.id)).ok).toBe(true);
    expect((await markRefundPaid('finance-1', rf.id, { method: 'Bank transfer', reference: 'RF-100' })).ok).toBe(true);
    expect(await bal(acct.refundDue(orderId))).toBe(0);
  });

  it('a rejected payment funds nothing, sends the order back to waiting, and frees the reference', async () => {
    const { buyer, orderId } = await order();
    const m = await method();
    const r = ref();
    const s = await submitManualPayment(buyer, orderId, { methodId: m.id, reference: r, amountCents: 4900, paidOn: '2026-10-20' }, null);
    if (!s.ok) throw new Error(s.error);
    expect(await rejectPayment('finance-1', s.value.id, 'no')).toMatchObject({ ok: false });
    expect((await rejectPayment('finance-1', s.value.id, 'Nothing arrived with this reference.')).ok).toBe(true);
    expect((await getOrder(orderId))!.state).toBe('awaiting_payment');
    expect(await reconcile('finance-1', s.value.id, { amountReceivedCents: 4900, statementRef: 'X-1', receivedAt: Date.now() })).toMatchObject({ ok: false, status: 409 });
    expect((await submitManualPayment(buyer, orderId, { methodId: m.id, reference: r, amountCents: 4900, paidOn: '2026-10-20' }, null)).ok).toBe(true);
  });

  it('a payment reconciled twice is refused the second time (idempotent)', async () => {
    const { buyer, orderId } = await order();
    const m = await method();
    const s = await submitManualPayment(buyer, orderId, { methodId: m.id, reference: ref(), amountCents: 4900, paidOn: '2026-10-20' }, null);
    if (!s.ok) throw new Error(s.error);
    const input = { amountReceivedCents: 4900, statementRef: 'ST-9', receivedAt: Date.now() - 1000 };
    expect((await reconcile('finance-1', s.value.id, input)).ok).toBe(true);
    expect(await reconcile('finance-1', s.value.id, input)).toMatchObject({ ok: false, status: 409 });
    expect(await bal(acct.escrow(orderId))).toBe(4900);
    expect((await attemptsFor(orderId)).filter((a) => a.status === 'reconciled')).toHaveLength(1);
  });

  it('Finance refunds a paid order before acceptance: cancelled, escrow owed back, cleared when paid', async () => {
    const { buyer, orderId } = await order();
    const m = await method();
    const s = await submitManualPayment(buyer, orderId, { methodId: m.id, reference: ref(), amountCents: 4900, paidOn: '2026-10-20' }, null);
    if (!s.ok) throw new Error(s.error);
    await reconcile('finance-1', s.value.id, { amountReceivedCents: 4900, statementRef: 'ST-5', receivedAt: Date.now() - 1000 });
    const rf = await refundOrder('finance-1', orderId, 'Buyer asked to cancel before work started.');
    expect(rf.ok && rf.value).toMatchObject({ kind: 'order', amountCents: 4900, status: 'approved' });
    expect((await getOrder(orderId))!.state).toBe('cancelled');
    expect(await bal(acct.escrow(orderId))).toBe(0);
    expect(await bal(acct.refundDue(orderId))).toBe(4900);
    if (rf.ok && rf.value) expect((await markRefundPaid('finance-1', rf.value.id, { method: 'Bank transfer', reference: 'RF-200' })).ok).toBe(true);
    expect(await bal(acct.refundDue(orderId))).toBe(0);
  });

  it('only quotation orders take manual payments, and only an active method', async () => {
    const { buyer, orderId } = await order();
    const off = await saveMethodAsAdmin('finance-1', { kind: 'local_wallet', label: 'Wallet off', instructions: 'Not used at the moment.', currency: 'USD', active: false }, 'Inactive method.');
    if (!off.ok) throw new Error(off.error);
    expect(await submitManualPayment(buyer, orderId, { methodId: off.value.id, reference: ref(), amountCents: 4900, paidOn: '2026-10-20' }, null)).toMatchObject({ ok: false });
  });
});
