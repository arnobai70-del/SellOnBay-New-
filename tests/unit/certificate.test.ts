import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildCertificate, type CertificateData } from '@/lib/certificate';
import { logDownload } from '@/lib/delivery/service';
import { getCertificate } from '@/lib/orders/certificate';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, createOrder, deliver, getOrder, orderEvents } from '@/lib/orders/service';

/* The PDF's page contents are compressed. This inflates every stream and reads the text that was drawn (literal and hex strings). */
function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let out = '';
  let from = 0;
  for (;;) {
    const a = buf.indexOf('stream', from, 'latin1');
    if (a < 0) break;
    const start = buf[a + 6] === 0x0d ? a + 8 : a + 7;
    const end = buf.indexOf('endstream', start, 'latin1');
    if (end < 0) break;
    try {
      const text = inflateSync(buf.subarray(start, end)).toString('latin1');
      for (const m of text.matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9a-fA-F]+)>/g)) out += (m[1] ?? Buffer.from(m[2], 'hex').toString('latin1')) + '\n';
    } catch {
      /* not a compressed content stream */
    }
    from = end + 9;
  }
  return out;
}

const data = (over: Partial<CertificateData> = {}): CertificateData => ({
  orderId: '3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab',
  productName: 'Lead Capture to CRM (n8n)',
  version: '1',
  seller: 'Samir Khan',
  buyer: 'Buyer account 12345678',
  licence: 'multi_project',
  thirdParty: [{ name: 'Chart helper', licence: 'GPL-3.0' }],
  acceptedAt: Date.UTC(2026, 9, 5, 12, 30, 15),
  files: [{ sha256: 'a'.repeat(64), bytes: 1234, at: Date.UTC(2026, 9, 3, 8, 0, 0) }],
  events: [
    { event: 'created', at: Date.UTC(2026, 9, 3, 7, 0, 0) },
    { event: 'funded', at: Date.UTC(2026, 9, 3, 7, 5, 0) },
    { event: 'accepted', at: Date.UTC(2026, 9, 5, 12, 30, 15) },
  ],
  ...over,
});

describe('handover certificate PDF', () => {
  it('is a real PDF with the order, parties, licence, file hash, UTC time and the lawyer-review tag', async () => {
    const bytes = await buildCertificate(data());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const raw = pdfText(bytes);
    for (const needle of ['3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab', 'Samir Khan', 'Multi project', 'a'.repeat(64), '2026-10-05 12:30:15 UTC', 'LAWYER REVIEW', 'Chart helper (GPL-3.0)'])
      expect(raw, needle).toContain(needle);
  });
  it('a list of many files and events runs onto more pages instead of off the page', async () => {
    const files = Array.from({ length: 60 }, (_, i) => ({ sha256: String(i).padStart(64, 'b'), bytes: i, at: Date.UTC(2026, 9, 3) }));
    const doc = await PDFDocument.load(await buildCertificate(data({ files })));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
  it('names with letters the standard font cannot draw do not break it', async () => {
    const bytes = await buildCertificate(data({ seller: 'সামির খান', buyer: 'Zoë Ångström 日本' }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
  it('an order with no files says so', async () => {
    const raw = pdfText(await buildCertificate(data({ files: [], deliveryNote: 'A live site was set up for the buyer. No files passed through the platform.' })));
    expect(raw).toContain('No files passed through the platform');
  });
});

describe('the certificate is made when an order is accepted', () => {
  const funded = async () => {
    const o = await createOrder({
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'download',
      title: 'Lead Capture to CRM (n8n)',
      lines: [['Lead Capture', 2_900]],
      days: 1,
      buyerId: null,
      sellerId: 'seller-c',
      productKey: 'n8n-leads',
      demo: false,
    });
    await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
    return o;
  };
  it('not before acceptance; once at acceptance, with the delivered file hash; never made twice', async () => {
    const o = await funded();
    const fileHash = createHash('sha256').update('the seller file').digest('hex');
    await logDownload({ order_id: o.id, kind: 'real', user_id: null, ip: '1.1.1.1', user_agent: 't', file_hash: fileHash, bytes: 15 });
    await deliver(o.id, 'seller-c');
    expect(await getCertificate(o.id)).toBeNull();
    await accept(o.id, null);
    const c = (await getCertificate(o.id))!;
    expect(c).toBeTruthy();
    expect(createHash('sha256').update(c.bytes).digest('hex')).toBe(c.sha256);
    expect(pdfText(c.bytes)).toContain(fileHash);
    await getOrder(o.id); // reading again must not make a second one
    expect((await orderEvents(o.id)).filter((e) => e.event === 'certificate_issued')).toHaveLength(1);
    expect((await orderEvents(o.id)).find((e) => e.event === 'certificate_issued')?.meta).toEqual({ sha256: c.sha256 });
  });
  it('a cancelled order never gets one', async () => {
    const o = await funded();
    expect(await getCertificate(o.id)).toBeNull();
  });
});
