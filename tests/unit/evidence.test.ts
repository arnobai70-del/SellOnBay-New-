import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { sendMessage } from '@/lib/chat';
import { BUGFIX_DAYS, REVIEW_HOURS } from '@/lib/config';
import { consentsOf, recordConsent, whoIs } from '@/lib/consent';
import { ACCEPT_TEXT, ACCEPT_TEXT_VERSION } from '@/lib/consentText';
import { buildEvidencePdf, evidenceSections, fingerprint, maskAddress } from '@/lib/evidence';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, createOrder, deliver, getOrder } from '@/lib/orders/service';
import { logDownload } from '@/lib/delivery/service';

let n = 0;
const flow = async () => {
  const k = ++n;
  const o = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'download',
    title: 'Evidence test kit',
    lines: [['Kit', 10_000]],
    days: 1,
    buyerId: `ev-b${k}`,
    sellerId: `ev-s${k}`,
    demo: false,
  });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  await deliver(o.id, `ev-s${k}`);
  return o;
};

describe('the words next to the accept box', () => {
  it('say the real numbers and have a version', () => {
    expect(ACCEPT_TEXT).toContain(`${BUGFIX_DAYS} days`);
    expect(ACCEPT_TEXT).toContain(`${REVIEW_HOURS} hours`);
    expect(ACCEPT_TEXT_VERSION).toMatch(/^accept-v\d+$/);
  });
});

describe('the acceptance log', () => {
  it('takes the address, the browser and a hash of the device from the request, never the raw device id', () => {
    const req = new Request('http://x.test/', { headers: { 'x-forwarded-for': '203.0.113.45, 10.0.0.1', 'user-agent': 'TestBrowser/1.0', cookie: 'a=1; lb_dev=0123456789abcdef; b=2' } });
    const w = whoIs(req);
    expect(w.ip).toBe('203.0.113.45');
    expect(w.userAgent).toBe('TestBrowser/1.0');
    expect(w.deviceHash).toMatch(/^[0-9a-f]{24}$/);
    expect(w.deviceHash).not.toContain('0123456789abcdef');
    expect(whoIs(new Request('http://x.test/')).deviceHash).toBeNull();
  });
  it('is written once per click with the version of the words, and read back for the order', async () => {
    const o = await flow();
    await recordConsent({ orderId: o.id, userId: o.buyerId, ip: '203.0.113.45', userAgent: 'TestBrowser/1.0', deviceHash: 'abc' });
    const rows = await consentsOf(o.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderId: o.id, userId: o.buyerId, kind: 'accept', version: ACCEPT_TEXT_VERSION, ip: '203.0.113.45', userAgent: 'TestBrowser/1.0' });
    expect(await consentsOf('another-order')).toHaveLength(0);
  });
});

describe('the evidence file', () => {
  it('hides the end of an address from the parties and shows all of it to the admin', () => {
    expect(maskAddress('203.0.113.45')).toBe('203.0.113.x');
    expect(maskAddress('2001:db8:85a3::1')).toBe('2001:db8:...');
    expect(maskAddress('unknown')).toBe('unknown');
  });
  it('has the order, the timeline, the deliveries, the acceptance, the chat and the certificate, and says what is missing', async () => {
    const o = await flow();
    await logDownload({ order_id: o.id, kind: 'real', user_id: o.buyerId, ip: '198.51.100.77', user_agent: 'UA', file_hash: 'f'.repeat(64), bytes: 1234 });
    await sendMessage((await getOrder(o.id))!, 'buyer', o.buyerId, '198.51.100.77', 'The zip opens fine, thanks.');
    await recordConsent({ orderId: o.id, userId: o.buyerId, ip: '198.51.100.77', userAgent: 'TestBrowser/9', deviceHash: 'devhash1' });
    await accept(o.id, o.buyerId);
    const fresh = (await getOrder(o.id))!;
    const admin = await evidenceSections(fresh, 'admin');
    const titles = admin.map((s) => s.title);
    expect(titles).toEqual(expect.arrayContaining(['Order', 'Timeline', 'File delivery log', 'Handover certificate', 'Buyer acceptance']));
    expect(titles.some((t) => t.startsWith('Order chat'))).toBe(true);
    const flat = (s: typeof admin) => s.flatMap((x) => x.lines).join('\n');
    expect(flat(admin)).toContain('Evidence test kit');
    expect(flat(admin)).toContain('198.51.100.77'); // the admin sees the whole address
    expect(flat(admin)).toContain('fffffffffffffff'); // the file fingerprint
    expect(flat(admin)).toContain('The zip opens fine');
    expect(flat(admin)).toContain('TestBrowser/9');
    expect(flat(admin)).toContain(ACCEPT_TEXT);
    expect(flat(admin)).toContain('delivered');
    const party = await evidenceSections(fresh, 'party');
    expect(flat(party)).toContain('198.51.100.x');
    expect(flat(party)).not.toContain('198.51.100.77');
  });
  it('says so when there was no click (accepted by the timer) and when nothing was downloaded', async () => {
    const o = await flow();
    const flat = (await evidenceSections((await getOrder(o.id))!, 'party')).flatMap((x) => x.lines).join('\n');
    expect(flat).toContain('The buyer has not accepted yet');
    expect(flat).toContain('No file was downloaded');
  });
  it('the fingerprint follows the content', async () => {
    const o = await flow();
    const a = await evidenceSections((await getOrder(o.id))!, 'admin');
    expect(fingerprint(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(a)).toBe(fingerprint(a));
    expect(fingerprint([...a, { title: 'Extra', lines: ['x'] }])).not.toBe(fingerprint(a));
  });
  it('builds a real PDF with the order in it, long words do not break it', async () => {
    const o = await flow();
    await logDownload({ order_id: o.id, kind: 'real', user_id: o.buyerId, ip: '198.51.100.9', user_agent: 'UA', file_hash: 'a'.repeat(64), bytes: 1 });
    await sendMessage((await getOrder(o.id))!, 'seller', `ev-s${n}`, '198.51.100.9', 'x'.repeat(300));
    const bytes = await buildEvidencePdf((await getOrder(o.id))!, 'admin');
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain(o.id);
  });
});
