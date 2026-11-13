import { tx } from '../i18n/tx';
import { checkMessage, BLOCKED_MESSAGE } from '../chatFilter';
import { hasScope, type AdminScope } from '../admin/scopes';

/*
 * Admin-mediated communication (owner decision D-B). Pure, tested.
 *   buyer_admin   the buyer and SellOnBay        (about a request, an order or the buyer's support ticket)
 *   admin_seller  SellOnBay and the seller       (about an order, a request for the seller's product, or the seller's ticket)
 *   internal      SellOnBay admins only          (never shown to buyers or sellers)
 * A buyer and a seller can never read or write each other's channel. Contact details and outside-payment talk are refused for buyers and
 * sellers on the server (lib/chatFilter.ts); admins write freely.
 */
export type Channel = 'buyer_admin' | 'admin_seller' | 'internal';
export const CHANNELS: readonly Channel[] = ['buyer_admin', 'admin_seller', 'internal'];
export type SubjectType = 'request' | 'order' | 'ticket';
export type Viewer = { id: string; role: 'buyer' | 'seller' | 'admin'; scopes?: AdminScope[] };
/* Who is on the subject: its buyer and its seller (either may be missing: a custom request has no seller yet; a seller's ticket has no buyer). */
export type SubjectFacts = { buyerId: string | null; sellerId: string | null };

/* Admins who work on purchases may use the channels; Content-only admins may not (they have no business reading buyers' messages). */
const MESSAGING_SCOPES: AdminScope[] = ['support', 'catalog', 'finance', 'delivery'];

export const adminMayMessage = (v: Viewer) => v.role === 'admin' && hasScope(v.scopes ?? [], MESSAGING_SCOPES);

export function channelsFor(v: Viewer, s: SubjectFacts): Channel[] {
  if (v.role === 'admin') return adminMayMessage(v) ? [...CHANNELS] : [];
  if (v.role === 'buyer') return s.buyerId === v.id ? ['buyer_admin'] : [];
  if (v.role === 'seller') return s.sellerId === v.id ? ['admin_seller'] : [];
  return [];
}
export const mayUse = (v: Viewer, s: SubjectFacts, c: Channel) => channelsFor(v, s).includes(c);

export const MESSAGE_MAX = 4000;
export function checkBody(role: Viewer['role'], raw: string): { ok: true; body: string } | { ok: false; error: string; blocked?: boolean } {
  const body = raw.trim();
  if (!body) return { ok: false, error: tx('Write a message first.') };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Keep a message under ${MESSAGE_MAX} characters.` };
  if (role !== 'admin' && !checkMessage(body).ok) return { ok: false, error: BLOCKED_MESSAGE, blocked: true };
  return { ok: true, body };
}

/* A ticket subject: one line, 3 to 120 characters, and the same contact and outside-payment rules as a message (admins read it in lists). */
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;
export function checkSubject(raw: string): { ok: true; subject: string } | { ok: false; error: string; blocked?: boolean } {
  const subject = raw.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
  if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) return { ok: false, error: `Give the ticket a short subject (${SUBJECT_MIN} to ${SUBJECT_MAX} characters).` };
  if (!checkMessage(subject).ok) return { ok: false, error: BLOCKED_MESSAGE, blocked: true };
  return { ok: true, subject };
}

/* Who hears about a new message: the other side of the channel. Internal notes notify nobody outside the admins. */
export function recipients(sender: Viewer, s: SubjectFacts, c: Channel): { user: string | null; admins: boolean } {
  if (c === 'internal') return { user: null, admins: false };
  if (sender.role !== 'admin') return { user: null, admins: true };
  return { user: c === 'buyer_admin' ? s.buyerId : s.sellerId, admins: false };
}
