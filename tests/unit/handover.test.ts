import { describe, expect, it } from 'vitest';
import { findAny } from '@/lib/apps';
import { GITHUB_NAME, deliveryTypeOf, licenceOf, thirdPartyOf } from '@/lib/handover';
import { LICENCES, LICENCE_TYPES, copyleftNote, parseThirdParty } from '@/lib/licences';
import { thirdPartySchema } from '@/lib/schemas';
import { DEMO } from '@/lib/orders/machine';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, confirmAccess, createOrder, deliver, getOrder, handoverSent, orderEvents } from '@/lib/orders/service';

describe('licence types and third-party code', () => {
  it('three licence types, each with plain terms', () => {
    expect(LICENCE_TYPES).toEqual(['single_project', 'multi_project', 'full_transfer']);
    for (const t of LICENCE_TYPES) expect(LICENCES[t].terms.length).toBeGreaterThan(20);
  });
  it('reads "Name - Licence" lines; unknown licences become Other; empty lines are dropped', () => {
    expect(parseThirdParty('Date picker - MIT\nChart helper - GPL-3.0\n\nMystery lib - WTFPL\nPlain name')).toEqual([
      { name: 'Date picker', licence: 'MIT' },
      { name: 'Chart helper', licence: 'GPL-3.0' },
      { name: 'Mystery lib', licence: 'Other' },
      { name: 'Plain name', licence: 'Other' },
    ]);
    expect(parseThirdParty('x'.repeat(200) + ' - MIT')[0].name).toHaveLength(80);
    expect(parseThirdParty(Array(40).fill('a - MIT').join('\n'))).toHaveLength(20);
    expect(thirdPartySchema.safeParse(parseThirdParty('a - MIT')).success).toBe(true);
  });
  it('GPL and other licences with conditions show a visible note; MIT and Apache do not', () => {
    expect(copyleftNote([{ name: 'A', licence: 'MIT' }])).toBeNull();
    expect(copyleftNote([{ name: 'A', licence: 'Apache-2.0' }])).toBeNull();
    expect(copyleftNote([])).toBeNull();
    expect(copyleftNote([{ name: 'Chart helper', licence: 'GPL-3.0' }])).toMatch(/Chart helper \(GPL-3.0\).*share your own source/);
  });
  it('starter products carry a licence, and two have declared third-party code with a note', () => {
    expect(licenceOf(findAny('saas-ui-kit')!)).toBe('multi_project');
    expect(licenceOf(findAny('fittrack')!)).toBe('single_project');
    expect(copyleftNote(thirdPartyOf(findAny('wp-booking')!))).toMatch(/GPL-2.0/);
    expect(copyleftNote(thirdPartyOf(findAny('seo-audit')!))).toBeNull();
  });
});

describe('how a product is handed over', () => {
  it('sites go live, downloads download, three starter products use a repository', () => {
    expect(deliveryTypeOf(findAny('saffron-table')!)).toBe('live_site');
    expect(deliveryTypeOf(findAny('n8n-leads')!)).toBe('download');
    expect(deliveryTypeOf(findAny('seo-audit')!)).toBe('repo_access');
  });
  it('GitHub names: letters, digits and single hyphens, 39 at most', () => {
    for (const ok of ['octocat', 'a', 'a-b-c', 'User123', 'x'.repeat(39)]) expect(GITHUB_NAME.test(ok), ok).toBe(true);
    for (const bad of ['', '-a', 'a-', 'a--b', 'a b', 'a/b', 'x'.repeat(40), 'name@x', '../x']) expect(GITHUB_NAME.test(bad), bad).toBe(false);
  });
});

const repoOrder = (over: object = {}) =>
  createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'repo_access',
    title: 'Script',
    lines: [['Script', 4_000]],
    days: 1,
    buyerId: null,
    sellerId: 'seller-r',
    githubUsername: 'octocat',
    productKey: 'seo-audit',
    demo: false,
    ...over,
  });
const fundIt = (o: { id: string; priceCents: number }) =>
  handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'pay_x', at: Date.now() });

describe('repo_access: invite, confirm, then review', () => {
  it('the review window does not start until the buyer confirms access', async () => {
    const o = await repoOrder();
    await fundIt(o);
    expect((await confirmAccess(o.id, null)).ok).toBe(false); // nothing was sent yet
    expect((await getOrder(o.id))!.state).toBe('funded');
    expect((await handoverSent(o.id, 'seller-r')).ok).toBe(true);
    expect((await handoverSent(o.id, 'seller-r')).ok).toBe(false); // already sent
    const mid = (await getOrder(o.id))!;
    expect(mid.state).toBe('in_delivery');
    expect(mid.deliveredAt).toBeUndefined();
    expect((await accept(o.id, null)).ok).toBe(false); // cannot accept what was not delivered
    expect((await confirmAccess(o.id, null)).ok).toBe(true);
    const done = (await getOrder(o.id))!;
    expect(done.state).toBe('delivered');
    expect(done.reviewEndsAt! - done.deliveredAt!).toBe(48 * 3_600_000);
    expect((await orderEvents(o.id)).map((e) => e.event)).toEqual(['created', 'funded', 'repo_invited', 'access_confirmed']);
  });
  it('only repository orders have this flow', async () => {
    const o = await repoOrder({ deliveryType: 'download' });
    await fundIt(o);
    expect((await handoverSent(o.id, 'seller-r')).ok).toBe(false);
    expect((await confirmAccess(o.id, null)).ok).toBe(false);
    expect((await deliver(o.id, 'seller-r')).ok).toBe(true);
  });
  it('a demo seller sends the invite on its own but never confirms for the buyer', async () => {
    const o = await repoOrder({ sellerId: null, demo: true });
    await fundIt(o);
    const f = (await getOrder(o.id))!;
    const later = f.fundedAt! + DEMO.startMs + 1000;
    const { tick } = await import('@/lib/orders/service');
    const t = await tick(f, later);
    expect(t.state).toBe('in_delivery');
    expect((await tick(t, later + DEMO.buildMs * 10)).state).toBe('in_delivery'); // still waiting for the buyer
  });
});
