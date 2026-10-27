import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HOUR_MS } from '@/lib/config';
import { parseGa4Report, trustedCountry } from '@/lib/countryCore';
import { firstPartyCountries, recordCountry } from '@/lib/countryAnalytics';
import { setFlag } from '@/lib/featureFlags';
import { dataApiReader, ga4Countries, serviceAssertion } from '@/lib/ga4Country';
import type { Order } from '@/lib/orders/machine';
import { cleanFilters, latin1, parts, rowOf, selectOrders } from '@/lib/reports/rules';
import { buyerReceipt, downloadExport, exportsBy, exportSales, purgeReports } from '@/lib/reports/service';
import { paidOrder } from './fixtures/paidOrder';

const hdr = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const order = (o: Partial<Order>): Order =>
  ({
    id: crypto.randomUUID(),
    state: 'accepted',
    title: 'Kit',
    lines: [['Kit', 10_000]],
    feeCents: 1500,
    priceCents: 10_000,
    refundedCents: 0,
    sellerId: 's-1',
    createdAt: 0,
    fundedAt: Date.parse('2026-10-10'),
    ...o,
  }) as Order;

describe('sales report rules (pure)', () => {
  it('a seller export is always their own; ranges are checked', () => {
    const f = cleanFilters({ sellerId: '11111111-1111-4111-8111-111111111111', from: '2026-10-01', to: '2026-10-20' }, 'seller', 'me', Date.parse('2026-10-27'));
    expect(f.ok && f.value.sellerId).toBe('me');
    expect(cleanFilters({ from: '2026-10-20', to: '2026-10-01' }, 'admin', 'a', Date.now())).toMatchObject({ ok: false });
    expect(cleanFilters({ from: '2024-01-01', to: '2026-10-01' }, 'admin', 'a', Date.now())).toMatchObject({ ok: false });
    expect(cleanFilters({ statuses: ['accepted', 'hacked'] }, 'admin', 'a', Date.now())).toMatchObject({ ok: true, value: { statuses: ['accepted'] } });
  });
  it('figures come from what the order recorded, split like the ledger', () => {
    expect(rowOf(order({}), 'Free')).toMatchObject({ quotedCents: 10_000, commissionCents: 1500, netCents: 8500, plan: 'Free' });
    // a quotation order: the seller gross excludes a verified pass-through domain line
    expect(
      rowOf(
        order({
          lines: [
            ['Site', 10_000],
            ['Domain', 1500],
          ],
          sellerGrossCents: 10_000,
          feeCents: 1000,
        }),
        'Pro',
      ),
    ).toMatchObject({ quotedCents: 11_500, commissionCents: 2500, netCents: 9000 });
  });
  it('selects only paid sales in range, in a fixed order, and only the seller own ones', () => {
    const a = order({ fundedAt: Date.parse('2026-10-05'), sellerId: 'me' });
    const b = order({ fundedAt: Date.parse('2026-10-03'), sellerId: 'other' });
    const unpaid = order({ state: 'awaiting_payment', fundedAt: undefined });
    const f = cleanFilters({ from: '2026-10-01', to: '2026-10-20' }, 'admin', 'x', Date.parse('2026-10-27'));
    if (!f.ok) throw new Error(f.error);
    expect(selectOrders([a, b, unpaid], f.value, 'admin', 'x').map((o) => o.id)).toEqual([b.id, a.id]);
    expect(selectOrders([a, b, unpaid], { ...f.value, sellerId: 'me' }, 'seller', 'me').map((o) => o.id)).toEqual([a.id]);
  });
  it('splits into files of at most 1,000 rows', () => {
    expect(parts(Array.from({ length: 2500 }, (_, i) => i)).map((p) => p.length)).toEqual([1000, 1000, 500]);
    expect(parts([])).toEqual([[]]);
    expect(latin1('Café ✓ মোবাইল')).toBe('Café ? ??????');
  });
});

describe('sales exports', () => {
  it('stay off until the flag is on; then a file per 1,000 rows, logged, kept 24 hours, only for its maker', async () => {
    expect(await exportSales({ id: 'fin-1', name: 'Finance One', scope: 'admin' }, {})).toMatchObject({ ok: false, status: 409 });
    expect((await setFlag('super-1', 'reports.sales_pdf', true, 'Testing exports.')).ok).toBe(true);
    const { sellerId, orderId } = await paidOrder(true);
    const now = Date.now();
    const r = await exportSales({ id: 'fin-1', name: 'Finance One', scope: 'admin' }, {}, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.files).toHaveLength(1);
    expect(r.value.files[0]).toMatchObject({ part: 1, parts: 1, scope: 'admin' });
    expect(r.value.files[0].rowCount).toBeGreaterThan(0);
    const id = r.value.files[0].id;
    expect(await downloadExport('someone-else', id, now)).toMatchObject({ ok: false, status: 404 });
    const d = await downloadExport('fin-1', id, now);
    expect(d.ok && Buffer.from(d.value.bytes).subarray(0, 5).toString()).toBe('%PDF-');
    // The seller sees only their own sale.
    const s = await exportSales({ id: sellerId, name: 'Seller', scope: 'seller' }, { sellerId: 'not-me' }, now);
    expect(s.ok && s.value.files[0]).toMatchObject({ rowCount: 1, scope: 'seller' });
    // After 24 hours the file goes, the log entry stays.
    expect(await purgeReports(now + 25 * HOUR_MS)).toBeGreaterThanOrEqual(2);
    expect(await downloadExport('fin-1', id, now + 25 * HOUR_MS)).toMatchObject({ ok: false, status: 410 });
    expect((await exportsBy('fin-1')).find((e) => e.id === id)).toMatchObject({ deletedAt: expect.any(Number), rowCount: r.value.files[0].rowCount });
    // A buyer receipt is only for the buyer's own paid order.
    const { buyer } = await paidOrder(true);
    expect(await buyerReceipt(buyer, orderId)).toMatchObject({ ok: false, status: 404 });
    await setFlag('super-1', 'reports.sales_pdf', false, 'Back off after the test.');
  });
});

describe('country analytics', () => {
  it('trusts a proxy country header only when the server says so, and only real two-letter codes', () => {
    const env = { FIRST_PARTY_COUNTRY_HEADER: 'cf-ipcountry', FIRST_PARTY_COUNTRY_TRUSTED: '1' };
    expect(trustedCountry(hdr({ 'cf-ipcountry': 'bd' }), env)).toBe('BD');
    expect(trustedCountry(hdr({ 'cf-ipcountry': 'XX' }), env)).toBeNull();
    expect(trustedCountry(hdr({ 'cf-ipcountry': 'T1' }), env)).toBeNull();
    expect(trustedCountry(hdr({ 'cf-ipcountry': 'BD' }), { FIRST_PARTY_COUNTRY_HEADER: 'cf-ipcountry' })).toBeNull(); // not trusted
    expect(trustedCountry(hdr({ 'x-country': 'BD' }), { FIRST_PARTY_COUNTRY_HEADER: 'x-country', FIRST_PARTY_COUNTRY_TRUSTED: '1' })).toBeNull(); // unknown header
  });
  it('first-party counting stays off: the flag is locked until legal approval', async () => {
    expect(await setFlag('super-1', 'analytics.first_party_country', true, 'Try to switch it on.')).toMatchObject({ ok: false, status: 409 });
    expect(await recordCountry('visitor-123456', hdr({ 'cf-ipcountry': 'BD' }), Date.now(), { FIRST_PARTY_COUNTRY_HEADER: 'cf-ipcountry', FIRST_PARTY_COUNTRY_TRUSTED: '1' })).toBe(false);
    expect(await firstPartyCountries('2000-01-01', '2100-01-01')).toEqual([]);
  });
  it('the GA4 panel is off until B-5, and the reader parses a runReport answer (never called against Google here)', async () => {
    expect(await ga4Countries('2026-10-01', '2026-10-27')).toMatchObject({ state: 'off' });
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    const sa = { client_email: 'reader@example.iam.gserviceaccount.com', private_key: privateKey };
    const jwt = serviceAssertion(sa, 1_800_000_000_000);
    const [h, b, sig] = jwt.split('.');
    expect(createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(b, 'base64url').toString())).toMatchObject({ scope: 'https://www.googleapis.com/auth/analytics.readonly', iss: sa.client_email });
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 't' }));
      return new Response(
        JSON.stringify({
          rows: [
            { dimensionValues: [{ value: 'Bangladesh' }, { value: 'BD' }], metricValues: [{ value: '40' }, { value: '55' }, { value: '120' }, { value: '3' }] },
            { dimensionValues: [{ value: 'India' }, { value: 'IN' }], metricValues: [{ value: '70' }, { value: '90' }, { value: '200' }, { value: '-1' }] },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const rows = await dataApiReader('123456789', sa, fake).countries('2026-10-01', '2026-10-27');
    expect(rows.map((r) => r.code)).toEqual(['IN', 'BD']);
    expect(rows[0]).toMatchObject({ users: 70, keyEvents: 0 });
    expect(calls[1]).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport');
    expect(parseGa4Report({})).toEqual([]);
  });
});
