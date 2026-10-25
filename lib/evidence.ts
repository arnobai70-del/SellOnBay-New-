import 'server-only';
import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { BRAND_NAME } from './brand';
import { consentsOf } from './consent';
import { ACCEPT_TEXT } from './consentText';
import { chatOpen, listMessages } from './chat';
import { downloadLog } from './delivery/service';
import { LIABILITY_LABEL, REASON_LABEL, disputesForOrder, evidenceOf } from './disputes';
import type { Order } from './orders/machine';
import { getCertificate } from './orders/certificate';
import { orderEvents } from './orders/service';

/*
 * One PDF with everything that happened on an order, to settle a dispute or answer a chargeback: the order and its timeline, every file delivery with its
 * time, address and file hash, the chat, the handover certificate, the buyer's logged acceptance, and any dispute with its evidence. It is built from the
 * records, never edited, and carries a fingerprint of its content. The admin sees the full addresses; a buyer or seller sees them with the last part
 * hidden (they are not each other's to keep). [LAWYER REVIEW] before it is sent to a court or a payment provider.
 */
export type Audience = 'admin' | 'party';

const safe = (s: string) => s.replace(/[^ -~ -ÿ]/g, '?'); // the standard PDF fonts draw Latin letters only
const utc = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
const money = (c: number) => '$' + (c / 100).toFixed(2);

/* 203.0.113.45 becomes 203.0.113.x, 2001:db8::1 becomes 2001:db8:...: enough to tell two connections apart, not enough to find a person. */
export function maskAddress(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.includes(':')) return ip.split(':').slice(0, 2).join(':') + ':...';
  const p = ip.split('.');
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : ip;
}

export type Section = { title: string; lines: string[] };

/* The facts, as plain sections. Pure data: the PDF below only draws it, and tests read it. */
export async function evidenceSections(o: Order, audience: Audience): Promise<Section[]> {
  const addr = (ip: string) => (audience === 'admin' ? ip || 'unknown' : maskAddress(ip));
  const sections: Section[] = [];

  sections.push({
    title: 'Order',
    lines: [
      `Order: ${o.id}`,
      `Title: ${o.title}`,
      `Type: ${o.kind}, ${o.pkg}, delivery by ${o.deliveryType.replace('_', ' ')}`,
      `Buyer account: ${o.buyerId ?? 'signed out'}`,
      `Seller account: ${o.sellerId ?? 'starter listing (demo seller)'}`,
      ...o.lines.map(([label, cents]) => `  ${label}: ${money(cents)}`),
      `Total paid: ${money(o.priceCents)} ${o.currency}${o.refundedCents ? `, refunded ${money(o.refundedCents)}` : ''}`,
      `State now: ${o.state.replace(/_/g, ' ')}`,
      `Created: ${utc(o.createdAt)}`,
      ...(o.fundedAt ? [`Paid into escrow: ${utc(o.fundedAt)}`] : []),
      ...(o.deliveredAt ? [`Delivered: ${utc(o.deliveredAt)}`] : []),
      ...(o.acceptedAt ? [`Accepted: ${utc(o.acceptedAt)}`] : []),
      ...(o.domain ? [`Domain: ${o.domain.name}`] : []),
      ...(o.githubUsername ? [`GitHub invite for: ${o.githubUsername}`] : []),
      ...(o.payment ? [`Payment: ${o.payment.brand} ending ${o.payment.last4}`] : []),
    ],
  });

  const events = await orderEvents(o.id);
  sections.push({ title: 'Timeline', lines: events.length ? events.map((e) => `${utc(e.at)}  ${e.event}${e.from || e.to ? ` (${e.from ?? '-'} to ${e.to ?? '-'})` : ''}`) : ['No events.'] });

  const downloads = await downloadLog(o.id);
  sections.push({
    title: 'File delivery log',
    lines: downloads.length
      ? downloads.map((d) => `${d.at ? utc(d.at) : 'time unknown'}  ${d.kind}  account ${d.userId ?? 'signed out'}  from ${addr(d.ip)}  file ${d.sha256.slice(0, 16) || 'n/a'}...  ${d.bytes} bytes`)
      : ['No file was downloaded (a live site or an invite has no file).'],
  });

  const cert = await getCertificate(o.id);
  sections.push({
    title: 'Handover certificate',
    lines: cert ? [`Issued: ${utc(cert.issuedAt)}`, `Certificate file fingerprint (SHA-256): ${cert.sha256}`] : ['No certificate yet (it is issued when the order is accepted).'],
  });

  const consents = await consentsOf(o.id);
  sections.push({
    title: 'Buyer acceptance',
    lines: consents.length
      ? [
          ...consents.flatMap((c) => [
            `${utc(c.at)}  account ${c.userId ?? 'signed out'}  from ${addr(c.ip)}  device ${c.deviceHash ? c.deviceHash.slice(0, 8) : 'none'}`,
            `  Browser: ${c.userAgent || 'unknown'}`,
            `  Words shown (${c.version}):`,
          ]),
          `  "${ACCEPT_TEXT}"`,
        ]
      : [o.acceptedAt ? 'No acceptance click was logged: the order was accepted by the timer when the review time ended.' : 'The buyer has not accepted yet.'],
  });

  const disputes = await disputesForOrder(o.id);
  if (disputes.length) {
    const lines: string[] = [];
    for (const d of disputes) {
      lines.push(`Opened ${utc(d.createdAt)} for: ${REASON_LABEL[d.reason]}. Status: ${d.status}.`);
      if (d.decision)
        lines.push(
          `Decision: ${d.decision.replace(/_/g, ' ')}${d.liability ? `. At fault: ${LIABILITY_LABEL[d.liability]}` : ''}${d.feeCents ? `. Fee: ${money(d.feeCents)}${d.feeChargedCents ? ` (charged to the seller: ${money(d.feeChargedCents)})` : ''}` : ''}${d.decidedAt ? `. Decided ${utc(d.decidedAt)}` : ''}.`,
        );
      for (const e of await evidenceOf(d.id)) lines.push(`  ${utc(e.at)}  ${e.authorId ? 'account ' + e.authorId.slice(0, 8) : 'system'}: ${e.text}`);
    }
    sections.push({ title: 'Dispute', lines });
  }

  const chat = await listMessages(o.id);
  sections.push({
    title: `Order chat (${chatOpen(o) ? 'open' : 'closed'})`,
    lines: chat.length ? chat.map((m) => `${utc(m.at)}  ${m.role}: ${m.body}`) : ['No messages. (Messages with contact details or outside payment talk are blocked and never delivered.)'],
  });
  return sections;
}

/* A short fingerprint of what is written, so a later copy can be checked against this one. */
export const fingerprint = (sections: Section[]) => createHash('sha256').update(JSON.stringify(sections)).digest('hex');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width) {
        // a very long word (a file hash) is cut so it never runs off the page
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildEvidencePdf(o: Order, audience: Audience, now = Date.now()): Promise<Uint8Array> {
  const sections = await evidenceSections(o, audience);
  const print = fingerprint(sections);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Evidence for order ${o.id}`);
  pdf.setCreator(BRAND_NAME);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595,
    H = 842,
    M = 48,
    size = 9.5,
    lead = 13;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const room = (need: number) => {
    if (y - need < M + 20) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const draw = (text: string, f: PDFFont, s: number, color = rgb(0.06, 0.07, 0.19), indent = 0) => {
    for (const l of wrap(safe(text), f, s, W - 2 * M - indent)) {
      room(lead);
      page.drawText(l, { x: M + indent, y: y - s, size: s, font: f, color });
      y -= s === size ? lead : s + 4;
    }
  };

  draw(`${BRAND_NAME}: evidence for one order`, bold, 16);
  y -= 4;
  draw(
    `Made ${utc(now)} for ${audience === 'admin' ? 'the admin team' : 'a buyer or seller of this order'}. Built from the records of the order; nothing here was edited.`,
    font,
    size,
    rgb(0.35, 0.37, 0.5),
  );
  draw(`Content fingerprint (SHA-256): ${print}`, font, 8, rgb(0.35, 0.37, 0.5));
  y -= 8;
  for (const s of sections) {
    room(40);
    y -= 6;
    draw(s.title, bold, 12);
    for (const l of s.lines) draw(l, font, size, rgb(0.06, 0.07, 0.19), l.startsWith('  ') ? 12 : 0);
  }
  pdf.getPages().forEach((p, i, all) => p.drawText(`Order ${o.id.slice(0, 8)}  page ${i + 1} of ${all.length}`, { x: M, y: 28, size: 8, font, color: rgb(0.5, 0.5, 0.6) }));
  return pdf.save();
}
