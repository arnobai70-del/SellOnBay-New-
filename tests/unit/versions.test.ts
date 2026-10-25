import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { DAY_MS } from '@/lib/config';
import { notificationsFor } from '@/lib/notify';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { cancel, createOrder } from '@/lib/orders/service';
import { checkNewVersion, decideVersion, eligibleVersion, publishVersion, registerProduct, reviewQueue, versionsForOrder, versionsOf } from '@/lib/versions';

let n = 0;
const product = (over: Partial<Parameters<typeof registerProduct>[0]> = {}) => {
  const slug = `ver-prod-${Date.now()}-${++n}`;
  const p = {
    id: `pid-${slug}`,
    slug,
    sellerId: `ver-seller-${n}`,
    name: 'Lead Capture',
    status: 'live',
    platform: 'digital',
    description: 'Captures leads and sends them to a CRM.',
    codeUrl: 'https://example.com/v1.zip',
    updateDays: 30,
    ...over,
  };
  registerProduct(p);
  return p;
};
const input = (over: Partial<{ version: string; changelog: string; fileUrl: string }> = {}) => ({
  version: '1.1',
  changelog: 'Fixes the login bug and adds a CSV export.',
  fileUrl: 'https://example.com/v1.1.zip',
  ...over,
});
/* A buyer who paid for the product (real money path, as in the other tests). */
const buyer = async (slug: string, id = `ver-buyer-${++n}`, updateDays?: number) => {
  const o = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'download',
    title: 'Lead Capture',
    lines: [['Product', 5000]],
    days: 1,
    buyerId: id,
    sellerId: 'x',
    productKey: slug,
    updateDays,
    demo: false,
  });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  return { id, order: o };
};

describe('which version a buyer gets', () => {
  const T = Date.UTC(2026, 9, 1);
  const live = [
    { v: '1.1', publishedAt: T + 5 * DAY_MS },
    { v: '1.2', publishedAt: T + 20 * DAY_MS },
    { v: '2.0', publishedAt: T + 60 * DAY_MS },
  ];
  it('the latest one that existed when they paid, plus everything released while their update period runs', () => {
    expect(eligibleVersion(live, T, 30, T + 1 * DAY_MS)).toBeNull(); // nothing yet: the first file
    expect(eligibleVersion(live, T, 30, T + 6 * DAY_MS)?.v).toBe('1.1');
    expect(eligibleVersion(live, T, 30, T + 25 * DAY_MS)?.v).toBe('1.2');
    expect(eligibleVersion(live, T, 30, T + 90 * DAY_MS)?.v).toBe('1.2'); // 2.0 came after their period ended
  });
  it('with no update period they keep what existed when they paid', () => {
    expect(eligibleVersion(live, T + 10 * DAY_MS, 0, T + 90 * DAY_MS)?.v).toBe('1.1');
    expect(eligibleVersion(live, T, 0, T + 90 * DAY_MS)).toBeNull();
  });
  it('a buyer who pays after a version is out gets it even without updates', () => {
    expect(eligibleVersion(live, T + 70 * DAY_MS, 0, T + 80 * DAY_MS)?.v).toBe('2.0');
  });
});

describe('what a new version needs', () => {
  it('a plain number, a real change list without contact details, and an https link', () => {
    expect(checkNewVersion(input())).toBeNull();
    expect(checkNewVersion(input({ version: '' }))).toMatch(/version number/);
    expect(checkNewVersion(input({ version: '1 1' }))).toMatch(/version number/);
    expect(checkNewVersion(input({ version: 'x'.repeat(21) }))).toMatch(/version number/);
    expect(checkNewVersion(input({ changelog: 'fix' }))).toMatch(/10 to 2000/);
    expect(checkNewVersion(input({ changelog: 'Write to me at seller@example.com for the fix.' }))).toMatch(/Keep emails/);
    expect(checkNewVersion(input({ fileUrl: 'http://example.com/a.zip' }))).toMatch(/https/);
    expect(checkNewVersion(input({ fileUrl: 'javascript:alert(1)' }))).toMatch(/https/);
  });
});

describe('the seller publishes a version', () => {
  it('goes in review and the admins are told; it is not visible to buyers yet', async () => {
    const p = product();
    const r = await publishVersion(p.sellerId, p.slug, input());
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.status).toBe('in_review');
    expect((await reviewQueue()).some((v) => v.productSlug === p.slug)).toBe(true);
    expect(await versionsOf(p.slug, 'live')).toHaveLength(0);
  });
  it('only the seller of a live digital product, with a new number, and not too many at once', async () => {
    const p = product();
    expect((await publishVersion('someone-else', p.slug, input())).ok).toBe(false);
    expect((await publishVersion(p.sellerId, 'no-such-product', input())).ok).toBe(false);
    expect(await publishVersion(p.sellerId, product({ platform: 'web', sellerId: p.sellerId }).slug, input())).toMatchObject({ ok: false, status: 409 });
    expect(await publishVersion(p.sellerId, product({ status: 'in_review', sellerId: p.sellerId }).slug, input())).toMatchObject({ ok: false, status: 409 });
    expect((await publishVersion(p.sellerId, p.slug, input({ version: '1.0.1' }))).ok).toBe(true);
    expect(await publishVersion(p.sellerId, p.slug, input({ version: '1.0.1' }))).toMatchObject({ ok: false, status: 409 });
    expect((await publishVersion(p.sellerId, p.slug, input({ version: '1.0.2' }))).ok).toBe(true);
    expect((await publishVersion(p.sellerId, p.slug, input({ version: '1.0.3' }))).ok).toBe(true);
    expect(await publishVersion(p.sellerId, p.slug, input({ version: '1.0.4' }))).toMatchObject({ ok: false, status: 409 }); // three waiting
  });
});

describe('the admin decides', () => {
  it('approving needs the sandbox tick, rejecting needs a reason, a version is decided once, and every step is audited', async () => {
    const p = product();
    const v = await publishVersion(p.sellerId, p.slug, input());
    if (!v.ok) throw new Error(v.error);
    expect((await decideVersion('admin-1', v.value.id, 'approve', '', false)).ok).toBe(false);
    expect((await decideVersion('admin-1', v.value.id, 'reject', 'no', false)).ok).toBe(false);
    expect((await decideVersion('admin-1', v.value.id, 'approve', 'call me on 555 123 4567', true)).ok).toBe(false);
    expect((await decideVersion('admin-1', 'nope', 'approve', '', true)).ok).toBe(false);
    expect((await decideVersion('admin-1', v.value.id, 'approve', 'Looks fine.', true)).ok).toBe(true);
    expect((await decideVersion('admin-1', v.value.id, 'reject', 'Changed my mind.', false)).ok).toBe(false);
    expect((await versionsOf(p.slug, 'live')).map((x) => x.version)).toEqual(['1.1']);
    expect((await auditList(300)).some((e) => e.action === 'version_approve' && e.targetRef === p.slug)).toBe(true);
    const w = await publishVersion(p.sellerId, p.slug, input({ version: '1.2' }));
    if (!w.ok) throw new Error(w.error);
    expect((await decideVersion('admin-1', w.value.id, 'reject', 'The zip is empty.', false)).ok).toBe(true);
    expect((await versionsOf(p.slug, 'live')).map((x) => x.version)).toEqual(['1.1']);
    expect((await notificationsFor(p.sellerId)).filter((x) => x.kind === 'version_decision')).toHaveLength(2);
  });
  it('tells exactly the buyers whose update period is running, once each, and nobody whose order was cancelled', async () => {
    const p = product({ updateDays: 30 });
    const a = await buyer(p.slug);
    const b = await buyer(p.slug);
    const gone = await buyer(p.slug);
    await cancel(gone.order.id, gone.id, 'test');
    const other = await buyer(product().slug);
    const v = await publishVersion(p.sellerId, p.slug, input());
    if (!v.ok) throw new Error(v.error);
    const done = await decideVersion('admin-1', v.value.id, 'approve', '', true);
    expect(done.ok && done.value.notified).toBe(2);
    for (const who of [a, b]) {
      const mine = (await notificationsFor(who.id)).filter((x) => x.kind === 'product_update');
      expect(mine).toHaveLength(1);
      expect(mine[0].text).toMatch(/Version 1\.1/);
    }
    expect((await notificationsFor(gone.id)).some((x) => x.kind === 'product_update')).toBe(false);
    expect((await notificationsFor(other.id)).some((x) => x.kind === 'product_update')).toBe(false);
  });
  it('a product with no update period tells nobody, and its older buyers do not get the new version', async () => {
    const p = product({ updateDays: 0 });
    const a = await buyer(p.slug);
    const v = await publishVersion(p.sellerId, p.slug, input());
    if (!v.ok) throw new Error(v.error);
    const done = await decideVersion('admin-1', v.value.id, 'approve', '', true);
    expect(done.ok && done.value.notified).toBe(0);
    const view = await versionsForOrder(p.slug, a.order.fundedAt ?? Date.now() - 1000, 0);
    expect(view).toMatchObject({ current: null, isNew: false });
  });
  it('the order page lists what the buyer is entitled to and says when one is new', async () => {
    const p = product({ updateDays: 30 });
    const a = await buyer(p.slug);
    const v = await publishVersion(p.sellerId, p.slug, input());
    if (!v.ok) throw new Error(v.error);
    await decideVersion('admin-1', v.value.id, 'approve', '', true, Date.now() + 1000);
    const view = await versionsForOrder(p.slug, a.order.fundedAt ?? Date.now() - 1000, 30, Date.now() + 2000);
    expect(view.current).toBe('1.1');
    expect(view.isNew).toBe(true);
    expect(view.list[0]).toMatchObject({ version: '1.1' });
  });
  it('a seller who shortens the update period later does not cut off a buyer who paid while it was longer', async () => {
    const p = product({ updateDays: 0 }); // the listing now says no updates
    const kept = await buyer(p.slug, undefined, 30); // bought while it promised 30 days
    const older = await buyer(p.slug); // an order from before the promise was kept on orders: the listing's value applies
    const v = await publishVersion(p.sellerId, p.slug, input());
    if (!v.ok) throw new Error(v.error);
    const done = await decideVersion('admin-1', v.value.id, 'approve', '', true);
    expect(done.ok && done.value.notified).toBe(1);
    expect((await notificationsFor(kept.id)).some((x) => x.kind === 'product_update')).toBe(true);
    expect((await notificationsFor(older.id)).some((x) => x.kind === 'product_update')).toBe(false);
  });
});
