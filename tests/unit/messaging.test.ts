import { describe, expect, it } from 'vitest';
import { channelsFor, checkBody, checkSubject, recipients, type Viewer } from '@/lib/messaging/rules';
import { closeTicket, openTicket, postMessage, readConversation, ticketsOf } from '@/lib/messaging/service';
import { createOrder } from '@/lib/orders/service';

const buyer: Viewer = { id: 'b-1', role: 'buyer' };
const seller: Viewer = { id: 's-1', role: 'seller' };
const support: Viewer = { id: 'a-1', role: 'admin', scopes: ['support'] };
const content: Viewer = { id: 'a-2', role: 'admin', scopes: ['content'] };
const facts = { buyerId: 'b-1', sellerId: 's-1' };

describe('who may use which channel (D-B)', () => {
  it('a buyer only buyer_admin, a seller only admin_seller, admins all three; strangers nothing', () => {
    expect(channelsFor(buyer, facts)).toEqual(['buyer_admin']);
    expect(channelsFor(seller, facts)).toEqual(['admin_seller']);
    expect(channelsFor(support, facts)).toEqual(['buyer_admin', 'admin_seller', 'internal']);
    expect(channelsFor({ id: 'b-2', role: 'buyer' }, facts)).toEqual([]);
    expect(channelsFor({ id: 's-2', role: 'seller' }, facts)).toEqual([]);
  });
  it('a Content-only admin does not read buyer or seller messages', () => {
    expect(channelsFor(content, facts)).toEqual([]);
  });
  it('buyers and sellers cannot send contact details or outside-payment talk; admins can write freely', () => {
    expect(checkBody('buyer', 'mail me at me@example.com')).toMatchObject({ ok: false, blocked: true });
    expect(checkBody('seller', 'pay me on PayPal directly please')).toMatchObject({ ok: false });
    expect(checkBody('admin', 'Please send the logo to SellOnBay support.').ok).toBe(true);
    expect(checkBody('buyer', '  ')).toMatchObject({ ok: false });
  });
  it('a ticket subject is one line and follows the same contact rules as a message', () => {
    expect(checkSubject('  Download\n\tlink  ')).toEqual({ ok: true, subject: 'Download link' });
    expect(checkSubject('ab')).toMatchObject({ ok: false });
    expect(checkSubject('x'.repeat(121))).toMatchObject({ ok: false });
    expect(checkSubject('Call me on 555 123 4567')).toMatchObject({ ok: false, blocked: true });
    expect(checkSubject('mail jo@gmail.com')).toMatchObject({ ok: false, blocked: true });
    expect(checkSubject('Pay outside the platform?')).toMatchObject({ ok: false, blocked: true });
  });
  it('a message reaches the other side of its channel only; internal notes reach nobody outside', () => {
    expect(recipients(buyer, facts, 'buyer_admin')).toEqual({ user: null, admins: true });
    expect(recipients(support, facts, 'buyer_admin')).toEqual({ user: 'b-1', admins: false });
    expect(recipients(support, facts, 'admin_seller')).toEqual({ user: 's-1', admins: false });
    expect(recipients(support, facts, 'internal')).toEqual({ user: null, admins: false });
  });
});

describe('conversations on an order', () => {
  it('each side sees only its own channel; internal notes are never shown to them', async () => {
    const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'download', title: 'Kit', lines: [['Kit', 1000]], days: 1, buyerId: 'b-1', sellerId: 's-1', demo: false });
    expect((await postMessage(buyer, 'order', o.id, 'buyer_admin', 'When will the files be ready?')).ok).toBe(true);
    expect(await postMessage(buyer, 'order', o.id, 'admin_seller', 'Hi seller')).toMatchObject({ ok: false, status: 404 });
    expect(await postMessage(seller, 'order', o.id, 'buyer_admin', 'Hi buyer')).toMatchObject({ ok: false, status: 404 });
    expect((await postMessage(support, 'order', o.id, 'admin_seller', 'The buyer asks about timing.')).ok).toBe(true);
    expect((await postMessage(seller, 'order', o.id, 'admin_seller', 'Tomorrow morning.')).ok).toBe(true);
    expect((await postMessage(support, 'order', o.id, 'internal', 'Seller usually on time.')).ok).toBe(true);
    const b = await readConversation(buyer, 'order', o.id);
    expect(b.ok && b.value.messages.map((m) => m.channel)).toEqual(['buyer_admin']);
    const s = await readConversation(seller, 'order', o.id);
    expect(s.ok && s.value.messages.map((m) => m.body)).toEqual(['The buyer asks about timing.', 'Tomorrow morning.']);
    const a = await readConversation(support, 'order', o.id);
    expect(a.ok && a.value.messages).toHaveLength(4);
    expect(await readConversation({ id: 'stranger', role: 'buyer' }, 'order', o.id)).toMatchObject({ ok: false, status: 404 });
  });
});

describe('support tickets', () => {
  it('a buyer opens one; only they and Support see it; the buyer may close it', async () => {
    const t = await openTicket(buyer, { subject: 'Download link', body: 'My link expired, how do I get a new one?' });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect((await ticketsOf(buyer)).some((x) => x.id === t.value.id)).toBe(true);
    expect((await ticketsOf({ id: 'b-9', role: 'buyer' })).some((x) => x.id === t.value.id)).toBe(false);
    expect(await readConversation({ id: 'b-9', role: 'buyer' }, 'ticket', t.value.id)).toMatchObject({ ok: false });
    expect((await postMessage(support, 'ticket', t.value.id, 'buyer_admin', 'Open your order and press Get my files again.')).ok).toBe(true);
    expect(await closeTicket({ id: 'b-9', role: 'buyer' }, t.value.id, 'closed')).toMatchObject({ ok: false });
    expect(await closeTicket(content, t.value.id, 'open')).toMatchObject({ ok: false, status: 404 });
    expect((await ticketsOf(content)).length).toBe(0);
    expect((await closeTicket(buyer, t.value.id, 'closed')).ok).toBe(true);
    expect(await postMessage(buyer, 'ticket', t.value.id, 'buyer_admin', 'One more thing')).toMatchObject({ ok: false, status: 409 });
    expect((await postMessage(support, 'ticket', t.value.id, 'buyer_admin', 'Closing note.')).ok).toBe(true);
    expect(await openTicket(buyer, { subject: 'x', body: 'hi' })).toMatchObject({ ok: false });
    expect(await openTicket(buyer, { subject: 'WhatsApp me please', body: 'Where are my files?' })).toMatchObject({ ok: false, status: 422, blocked: true });
  });
});
