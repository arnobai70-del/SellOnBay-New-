import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { BRAND_NAME } from '../brand';
import { latin1, money, totals, type SalesRow } from './rules';

/*
 * The sales report and receipt PDFs (pdf-lib, already used for certificates). Every page says who exported it and when (Blueprint 8.2).
 * Landscape A4, Helvetica; text outside Latin-1 is drawn as "?" (lib/reports/rules.ts latin1).
 */
const W = 842;
const H = 595;
const M = 36;
const ROW = 14;
const ink = rgb(0.06, 0.07, 0.19);
const mute = rgb(0.4, 0.42, 0.5);

const COLS: { label: string; w: number; get: (r: SalesRow) => string; right?: boolean }[] = [
  { label: 'Paid on', w: 62, get: (r) => r.date },
  { label: 'Order', w: 62, get: (r) => r.order },
  { label: 'Product', w: 230, get: (r) => r.product },
  { label: 'Status', w: 78, get: (r) => r.status },
  { label: 'Plan', w: 70, get: (r) => r.plan },
  { label: 'Quoted', w: 64, get: (r) => money(r.quotedCents), right: true },
  { label: 'Commission', w: 64, get: (r) => money(r.commissionCents), right: true },
  { label: 'Net to seller', w: 70, get: (r) => money(r.netCents), right: true },
  { label: 'Refunded', w: 70, get: (r) => money(r.refundedCents), right: true },
];

function fit(font: PDFFont, text: string, size: number, width: number) {
  let t = latin1(text);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > width - 4) t = t.slice(0, -2) + '.'; // "…" is not in the standard fonts
  return t;
}

export type SalesPdfInput = { title: string; exportedBy: string; exportedAt: number; part: number; parts: number; filterText: string; rows: SalesRow[] };

export async function salesPdf(i: SalesPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin1(`${i.title} (part ${i.part} of ${i.parts})`));
  pdf.setProducer(BRAND_NAME);
  pdf.setCreator(BRAND_NAME);
  // A fixed creation date keeps two exports of the same records byte-comparable apart from the stamp text.
  pdf.setCreationDate(new Date(i.exportedAt));
  pdf.setModificationDate(new Date(i.exportedAt));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const stamp = latin1(`Exported by ${i.exportedBy} on ${new Date(i.exportedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · part ${i.part} of ${i.parts}`);
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  let pageNo = 0;
  const head = () => {
    pageNo += 1;
    page.drawText(latin1(`${BRAND_NAME} · ${i.title}`), { x: M, y, size: 13, font: bold, color: ink });
    page.drawText(stamp, { x: M, y: y - 16, size: 8, font, color: mute });
    page.drawText(fit(font, `Filters: ${i.filterText}`, 8, W - 2 * M), { x: M, y: y - 28, size: 8, font, color: mute });
    page.drawText(`Page ${pageNo}`, { x: W - M - 40, y: M - 16, size: 8, font, color: mute });
    page.drawText(stamp, { x: M, y: M - 16, size: 7, font, color: mute });
    y -= 50;
    let x = M;
    for (const c of COLS) {
      page.drawText(c.label, { x: c.right ? x + c.w - bold.widthOfTextAtSize(c.label, 8) - 4 : x, y, size: 8, font: bold, color: ink });
      x += c.w;
    }
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: mute });
    y -= ROW - 2;
  };
  head();
  if (!i.rows.length) page.drawText('No sales match these filters.', { x: M, y, size: 9, font, color: ink });
  for (const r of i.rows) {
    if (y < M + ROW) {
      page = pdf.addPage([W, H]);
      y = H - M;
      head();
    }
    let x = M;
    for (const c of COLS) {
      const t = fit(font, c.get(r), 8, c.w);
      page.drawText(t, { x: c.right ? x + c.w - font.widthOfTextAtSize(t, 8) - 4 : x, y, size: 8, font, color: ink });
      x += c.w;
    }
    y -= ROW;
  }
  const t = totals(i.rows);
  if (y < M + 3 * ROW) {
    page = pdf.addPage([W, H]);
    y = H - M;
    head();
  }
  y -= 6;
  page.drawText(
    latin1(`Totals for this part (${i.rows.length} sales): quoted ${money(t.quoted)} · commission ${money(t.commission)} · net to sellers ${money(t.net)} · refunded ${money(t.refunded)}`),
    { x: M, y, size: 9, font: bold, color: ink },
  );
  return pdf.save();
}

export type ReceiptInput = {
  exportedAt: number;
  orderCode: string;
  title: string;
  paidOn: string;
  lines: [string, number][];
  totalCents: number;
  refundedCents: number;
  licence: string;
  status: string;
};

/* A buyer's receipt for one order. Not a tax invoice. [LAWYER REVIEW] wording and any tax details before launch. */
export async function receiptPdf(i: ReceiptInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin1(`Receipt ${i.orderCode}`));
  pdf.setProducer(BRAND_NAME);
  pdf.setCreationDate(new Date(i.exportedAt));
  pdf.setModificationDate(new Date(i.exportedAt));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  let y = 842 - 56;
  const line = (t: string, f = font, size = 10, color = ink) => {
    page.drawText(latin1(t), { x: 56, y, size, font: f, color });
    y -= size + 8;
  };
  line(`${BRAND_NAME} receipt`, bold, 16);
  line(`Order ${i.orderCode} · paid on ${i.paidOn} · ${i.status}`, font, 10, mute);
  line(`Made ${new Date(i.exportedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC. This is a record of your payment, not a tax invoice.`, font, 8, mute);
  y -= 8;
  line(i.title, bold, 12);
  for (const [label, cents] of i.lines) {
    page.drawText(latin1(label).slice(0, 80), { x: 56, y, size: 10, font, color: ink });
    const m = money(cents);
    page.drawText(m, { x: 595 - 56 - font.widthOfTextAtSize(m, 10), y, size: 10, font, color: ink });
    y -= 18;
  }
  page.drawLine({ start: { x: 56, y: y + 8 }, end: { x: 595 - 56, y: y + 8 }, thickness: 0.5, color: mute });
  const tot = money(i.totalCents);
  page.drawText('Total paid', { x: 56, y: y - 6, size: 11, font: bold, color: ink });
  page.drawText(tot, { x: 595 - 56 - bold.widthOfTextAtSize(tot, 11), y: y - 6, size: 11, font: bold, color: ink });
  y -= 30;
  if (i.refundedCents > 0) line(`Refunded: ${money(i.refundedCents)}`);
  line(`Licence: ${i.licence}`);
  return pdf.save();
}
