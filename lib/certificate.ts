import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { LICENCES, copyleftNote, type LicenceType, type ThirdParty } from './licences';

/*
 * Handover certificate: a plain PDF record of an accepted order. [LAWYER REVIEW] It is a record of what was delivered and when. It is not a
 * transfer of rights: the licence terms in the seller agreement decide what rights pass to the buyer. No blockchain, no claims about ownership.
 */
export type CertificateData = {
  orderId: string;
  productName: string;
  version: string;
  seller: string;
  buyer: string;
  licence: LicenceType;
  thirdParty: ThirdParty;
  acceptedAt: number;
  files: { sha256: string; bytes: number; at: number }[];
  events: { event: string; at: number }[];
  deliveryNote?: string; // for orders with no file (a live site or a repository invite)
};

/* The standard PDF fonts only draw Latin letters; anything else becomes a question mark instead of breaking the file. */
const safe = (s: string) => s.replace(/[^ -~ -ÿ]/g, '?');
const utc = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildCertificate(d: CertificateData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Handover certificate ${d.orderId}`);
  pdf.setCreator('SellOnBay');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const W = 595,
    H = 842,
    M = 48,
    TW = W - 2 * M;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.06, 0.07, 0.19);
  const ensure = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (s: string, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = o.size ?? 10,
      f = o.f ?? font;
    for (const line of wrap(safe(s), f, size, TW)) {
      ensure(size + 4);
      page.drawText(safe(line), { x: M, y: y - size, size, font: f, color: o.color ?? ink });
      y -= size + 4;
    }
    y -= o.gap ?? 0;
  };
  const row = (label: string, value: string) => {
    ensure(16);
    page.drawText(safe(label), { x: M, y: y - 10, size: 9, font: bold, color: rgb(0.35, 0.38, 0.5) });
    const lines = wrap(safe(value), font, 10, TW - 120);
    lines.forEach((l, i) => page.drawText(l, { x: M + 120, y: y - 10 - i * 14, size: 10, font, color: ink }));
    y -= Math.max(1, lines.length) * 14 + 4;
  };

  text('[LAWYER REVIEW] Draft wording. This is a record of a delivery, not legal advice and not a transfer of rights.', { size: 8, color: rgb(0.7, 0.2, 0.2), gap: 10 });
  text('Handover certificate', { size: 22, f: bold, gap: 4 });
  text(`Order ${d.orderId}`, { size: 10, f: mono, gap: 14 });

  row('Product', `${d.productName} (version ${d.version})`);
  row('Seller', d.seller);
  row('Buyer', d.buyer);
  row('Accepted', utc(d.acceptedAt));
  row('Licence', `${LICENCES[d.licence].label}. ${LICENCES[d.licence].terms}`);
  if (d.thirdParty.length) row('Third-party code', d.thirdParty.map((t) => `${t.name} (${t.licence})`).join(', '));
  const note = copyleftNote(d.thirdParty);
  if (note) row('Note', note);
  y -= 8;

  text('Delivered files (SHA-256)', { size: 13, f: bold, gap: 4 });
  if (d.files.length) {
    for (const f of d.files) {
      text(f.sha256, { size: 8, f: mono });
      text(`${f.bytes} bytes, first delivered ${utc(f.at)}`, { size: 8, gap: 4 });
    }
  } else text(d.deliveryNote ?? 'No files were transferred through the platform for this order.', { gap: 4 });
  y -= 6;

  text('History of the order', { size: 13, f: bold, gap: 4 });
  for (const e of d.events) text(`${utc(e.at)}   ${e.event.replace(/_/g, ' ')}`, { size: 9 });
  y -= 10;
  text('The licence terms in the seller agreement decide what rights actually pass to the buyer. This certificate only records what was delivered, to whom and when.', {
    size: 8,
    color: rgb(0.35, 0.38, 0.5),
  });

  return pdf.save();
}
