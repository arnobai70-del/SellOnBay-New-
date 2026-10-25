import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { decideReport, fileReport, isPausedInMemory, listReports, reporterKey, slugOf } from '@/lib/abuse';
import { CONFIG, DAY_MS } from '@/lib/config';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { createOrder } from '@/lib/orders/service';

let n = 0;
const slug = () => `abuse-site-${Date.now()}-${++n}`;
const report = (url: string, ip: string, userId: string | null = null, now = Date.now(), reason = 'phishing') => fileReport({ url, reason, detail: 'Looks like a fake login page.', userId, ip }, now);

/* A buyer who really paid for this listing: the only kind of signed-in reporter that counts in a demo (no email verification exists there). */
const buyerOf = async (productKey: string, buyerId: string) => {
  const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'S', lines: [['S', 5000]], days: 1, buyerId, sellerId: 'abuse-seller', productKey, demo: false });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  return buyerId;
};

describe('who counts as a different reporter', () => {
  it('an account counts once, an address counts once and is only ever stored as a hash', () => {
    expect(reporterKey('u1', '1.1.1.1')).toBe(reporterKey('u1', '2.2.2.2'));
    expect(reporterKey(null, '1.1.1.1')).toBe(reporterKey(null, '1.1.1.1'));
    expect(reporterKey(null, '1.1.1.1')).not.toBe(reporterKey(null, '1.1.1.2'));
    expect(reporterKey('u1', '1.1.1.1')).not.toBe(reporterKey(null, '1.1.1.1'));
    expect(reporterKey(null, '203.0.113.9')).not.toContain('203.0.113.9');
  });
  it('finds the listing in a demo, product or preview address', () => {
    expect(slugOf('https://launchbay.example/demo/my-shop/index.html')).toBe('my-shop');
    expect(slugOf('http://localhost:3000/product/clinic-desk')).toBe('clinic-desk');
    expect(slugOf('example.com')).toBeUndefined();
  });
});

describe('filing a report', () => {
  it('needs an address and a known reason', async () => {
    expect((await fileReport({ url: '', reason: 'phishing', detail: '', userId: null, ip: '9.9.9.1' })).ok).toBe(false);
    expect((await fileReport({ url: 'x.com/product/a', reason: 'banana', detail: '', userId: null, ip: '9.9.9.1' })).ok).toBe(false);
  });
  it('one address cannot flood the form', async () => {
    const ip = `9.8.${n}.1`;
    const url = `https://x.example/product/${slug()}`;
    const results = [];
    for (let i = 0; i < CONFIG.abuse.perIpPerHour + 2; i++) results.push(await report(url, ip));
    expect(results.slice(0, CONFIG.abuse.perIpPerHour).every((r) => r.ok)).toBe(true);
    expect(results.at(-1)).toMatchObject({ ok: false, status: 429 });
  });
});

describe('automatic pause', () => {
  it('pauses the listing once enough DIFFERENT buyers reported it, not before', async () => {
    const s = slug();
    const url = `https://launchbay.example/demo/${s}/index.html`;
    const b = [await buyerOf(s, `ab-${s}-1`), await buyerOf(s, `ab-${s}-2`), await buyerOf(s, `ab-${s}-3`)];
    const r1 = await report(url, '10.0.0.1', b[0]);
    const r2 = await report(url, '10.0.0.2', b[1]);
    expect(r1.autoPaused ?? r2.autoPaused).toBeUndefined();
    expect(isPausedInMemory(s)).toBe(false);
    const r3 = await report(url, '10.0.0.3', b[2]);
    expect(r3.autoPaused).toBe(s);
    expect(isPausedInMemory(s)).toBe(true);
    expect((await auditList(200)).some((e) => e.action === 'abuse_auto_pause' && e.targetRef === s)).toBe(true);
  });
  it('anonymous and throwaway accounts are saved and alert the admins but never pause a listing', async () => {
    const s = slug();
    const url = `https://launchbay.example/product/${s}`;
    for (let i = 1; i <= 6; i++) expect((await report(url, `10.6.0.${i}`, i % 2 ? null : `fake-account-${s}-${i}`)).autoPaused).toBeUndefined();
    expect(isPausedInMemory(s)).toBe(false);
    const mine = (await listReports(true)).filter((r) => r.slug === s);
    expect(mine.length).toBe(6);
    expect(mine[0].verifiedReporters).toBe(0);
  });
  it('a buyer of a different listing does not count for this one', async () => {
    const s = slug();
    const url = `https://launchbay.example/product/${s}`;
    for (let i = 1; i <= 4; i++) expect((await report(url, `10.7.0.${i}`, await buyerOf('someone-elses-site', `ab-other-${s}-${i}`))).autoPaused).toBeUndefined();
    expect(isPausedInMemory(s)).toBe(false);
  });
  it('the same person reporting again and again does not count more than once', async () => {
    const s = slug();
    const url = `https://launchbay.example/product/${s}`;
    const same = await buyerOf(s, `ab-same-${s}`);
    for (let i = 0; i < 4; i++) expect((await report(url, '10.1.0.1', same)).autoPaused).toBeUndefined();
    expect(isPausedInMemory(s)).toBe(false);
  });
  it('old reports fall out of the window, and reports about other listings are not mixed in', async () => {
    const s = slug(),
      other = slug();
    const old = Date.now() - (CONFIG.abuse.windowDays + 1) * DAY_MS;
    await report(`https://x.example/product/${s}`, '10.2.0.1', await buyerOf(s, `ab-o1-${s}`), old);
    await report(`https://x.example/product/${s}`, '10.2.0.2', await buyerOf(s, `ab-o2-${s}`), old);
    await report(`https://x.example/product/${other}`, '10.2.0.3', await buyerOf(other, `ab-o3-${s}`));
    const last = await report(`https://x.example/product/${s}`, '10.2.0.4', await buyerOf(s, `ab-o4-${s}`));
    expect(last.autoPaused).toBeUndefined();
    expect(isPausedInMemory(s)).toBe(false);
    expect(isPausedInMemory(other)).toBe(false);
  });
  it('a report about something that is not a listing here never pauses anything', async () => {
    for (let i = 1; i <= 4; i++) expect((await report('https://some-other-site.example/login', `10.3.0.${i}`)).autoPaused).toBeUndefined();
  });
});

describe('the admin decides', () => {
  it('suspend, dismiss and put back, each once, with a note that keeps contact details out', async () => {
    const s = slug();
    await report(`https://x.example/product/${s}`, '10.4.0.1');
    const mine = (await listReports(true)).find((r) => r.slug === s)!;
    expect(mine.reporters).toBe(1);
    expect((await decideReport('admin-1', mine.id, 'suspend', 'call me on 555 123 4567')).ok).toBe(false);
    expect((await decideReport('admin-1', mine.id, 'suspend', 'Confirmed fake login.')).ok).toBe(true);
    expect(isPausedInMemory(s)).toBe(true);
    expect((await decideReport('admin-1', mine.id, 'dismiss', '')).ok).toBe(false); // decided once
    expect((await listReports(true)).some((r) => r.id === mine.id)).toBe(false);
    expect((await decideReport('admin-1', '00000000-0000-4000-8000-000000000000', 'dismiss', '')).ok).toBe(false);
  });
  it('putting a site back after an automatic pause lifts it', async () => {
    const s = slug();
    const url = `https://x.example/product/${s}`;
    for (const [k, ip] of ['10.5.0.1', '10.5.0.2', '10.5.0.3'].entries()) await report(url, ip, await buyerOf(s, `ab-r${k}-${s}`));
    expect(isPausedInMemory(s)).toBe(true);
    const open = (await listReports(true)).find((r) => r.slug === s)!;
    expect((await decideReport('admin-1', open.id, 'reinstate', 'Checked, it is fine.')).ok).toBe(true);
    expect(isPausedInMemory(s)).toBe(false);
  });
});
