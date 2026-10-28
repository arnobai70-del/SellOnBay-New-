import { memRequestable } from '@/lib/requests/products';
import { reconcile, saveMethodAsAdmin, submitManualPayment } from '@/lib/payments/service';
import { acceptQuote, adminRequestAction, draftQuote, issueQuote, submitRequest, superDecision } from '@/lib/requests/service';

/*
 * A paid quotation order. readyMade: files only (download, as is); otherwise a work order (live site). `version` uses a product whose file
 * really went through upload, checks and approval (tests/unit/delivery-chain.test.ts); without it the version id is made up.
 */
export async function paidOrder(
  readyMade: boolean,
  opts: {
    terms?: Record<string, unknown>;
    beforeQuote?: (productId: string, sellerId: string) => Promise<void>;
    version?: { productId: string; sellerId: string; versionId: string };
  } = {},
) {
  const id = opts.version?.productId ?? crypto.randomUUID();
  const sellerId = opts.version?.sellerId ?? `seller-${id.slice(0, 6)}`;
  memRequestable({
    id,
    slug: `rel-${id.slice(0, 6)}`,
    name: readyMade ? 'Script pack' : 'Shop site',
    sellerId,
    ownerType: 'seller',
    status: 'live',
    platform: readyMade ? 'digital' : 'web',
    deliveryType: readyMade ? 'download' : 'live_site',
    deliveryDays: 3,
    deliveryHours: null,
    supportDays: 0,
    updateDays: 0,
    priceCents: 4900,
    setupCents: null,
    customCents: null,
    expressCents: null,
    expressHelps: true,
    latestVersionId: opts.version?.versionId ?? crypto.randomUUID(),
  });
  if (opts.beforeQuote) await opts.beforeQuote(id, sellerId);
  const buyer = `buyer-${id.slice(0, 6)}`;
  const r = await submitRequest(buyer, { licenceTier: 'multi_project', package: 'asis', intendedUse: 'For my clients.', consent: true, product: `rel-${id.slice(0, 6)}` });
  if (!r.ok) throw new Error(r.error);
  await adminRequestAction('admin-1', r.value.id, 'review', {});
  const d = await draftQuote('admin-1', r.value.id, { lines: [{ label: 'Item', cents: 4900, kind: 'product' }], terms: { deliveryDays: 3, ...opts.terms }, overrideReason: 'Multi-project price.' });
  if (!d.ok) throw new Error(d.error);
  await issueQuote('admin-1', d.value.id);
  await superDecision('super-1', d.value.id, 'approve', 'Multi-project licence agreed.');
  const a = await acceptQuote(buyer, d.value.id);
  if (!a.ok) throw new Error(a.error);
  const m = await saveMethodAsAdmin('finance-1', { kind: 'bank_transfer', label: `Bank ${id.slice(0, 4)}`, instructions: 'Pay to the account shown.', currency: 'USD', active: true }, 'Test method.');
  if (!m.ok) throw new Error(m.error);
  const s = await submitManualPayment(buyer, a.value.orderId, { methodId: m.value.id, reference: `T-${id.slice(0, 8)}`, amountCents: 4900, paidOn: '2026-10-20' }, null);
  if (!s.ok) throw new Error(s.error);
  const rc = await reconcile('finance-1', s.value.id, { amountReceivedCents: 4900, statementRef: 'ST-1', receivedAt: Date.now() - 1000 });
  if (!rc.ok) throw new Error(rc.error);
  return { buyer, sellerId, orderId: a.value.orderId };
}
