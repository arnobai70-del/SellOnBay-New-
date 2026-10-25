import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/lib/config';
import { chatOpen, listMessages, roleIn, sendMessage } from '@/lib/chat';
import { BLOCKED_MESSAGE } from '@/lib/chatFilter';
import { notificationsFor } from '@/lib/notify';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { cancel, createOrder, getOrder } from '@/lib/orders/service';
import { blockedList } from '@/lib/presale/service';
import { actionsFor, isSuspended } from '@/lib/strikes';

let n = 0;
const order = async (fund = true) => {
  const k = ++n;
  const o = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'live_site',
    title: 'Saffron Table',
    lines: [['Site', 5000]],
    days: 1,
    buyerId: `ch-b${k}`,
    sellerId: `ch-s${k}`,
    productKey: 'saffron-table',
    demo: false,
  });
  if (fund) await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  return { o: (await getOrder(o.id))!, buyer: `ch-b${k}`, seller: `ch-s${k}` };
};
const ip = () => `7.7.${n}.1`;

describe('who is who in a chat', () => {
  it('the buyer and the seller of the order, nobody else; a signed-out buyer only on an order with no account', async () => {
    const { o, buyer, seller } = await order();
    expect(roleIn(o, buyer)).toBe('buyer');
    expect(roleIn(o, seller)).toBe('seller');
    expect(roleIn(o, 'someone-else')).toBeNull();
    expect(roleIn(o, null)).toBeNull();
    const anon = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'S', lines: [['S', 1000]], days: 1, buyerId: null, demo: true });
    expect(roleIn(anon, null)).toBe('buyer');
    expect(roleIn(anon, 'someone')).toBeNull();
  });
  it('chat opens when the money is in escrow and closes with a cancel', async () => {
    const unpaid = (await order(false)).o;
    expect(chatOpen(unpaid)).toBe(false);
    const { o } = await order();
    expect(chatOpen(o)).toBe(true);
    await cancel(o.id, null, 'test');
    expect(chatOpen((await getOrder(o.id))!)).toBe(false);
  });
});

describe('sending', () => {
  it('both sides can write; messages come back in order with their role; the other person is told', async () => {
    const { o, buyer, seller } = await order();
    expect((await sendMessage(o, 'buyer', buyer, ip(), 'Hi, can you add a contact page?')).ok).toBe(true);
    expect((await sendMessage(o, 'seller', seller, ip(), 'Yes, I will start now.')).ok).toBe(true);
    const list = await listMessages(o.id);
    expect(list.map((m) => [m.role, m.body])).toEqual([
      ['buyer', 'Hi, can you add a contact page?'],
      ['seller', 'Yes, I will start now.'],
    ]);
    expect((await listMessages(o.id, list[0].at)).length).toBeLessThanOrEqual(1); // only newer ones
    expect((await notificationsFor(seller)).map((x) => x.kind)).toContain('new_message');
    expect((await notificationsFor(buyer)).map((x) => x.kind)).toContain('new_message');
  });
  it('an unpaid or closed order cannot be chatted on; empty and over-long messages are refused', async () => {
    const unpaid = (await order(false)).o;
    expect(await sendMessage(unpaid, 'buyer', 'x', ip(), 'hello')).toMatchObject({ ok: false, status: 409 });
    const { o, buyer } = await order();
    expect((await sendMessage(o, 'buyer', buyer, ip(), '   ')).ok).toBe(false);
    expect((await sendMessage(o, 'buyer', buyer, ip(), 'x'.repeat(CONFIG.chat.maxChars + 1))).ok).toBe(false);
  });
  it('a person who sends too fast is slowed down', async () => {
    const { o, buyer } = await order();
    const [count] = CONFIG.chat.perUserBurst;
    const results = [];
    for (let i = 0; i <= count; i++) results.push(await sendMessage(o, 'buyer', buyer, ip(), `message ${i}`));
    expect(results.slice(0, count).every((r) => r.ok)).toBe(true);
    expect(results.at(-1)).toMatchObject({ ok: false, status: 429 });
  });
});

describe('the contact-details filter on the server', () => {
  it('blocks emails (also hidden ones), phone numbers, chat apps, links and outside payment, and never delivers them', async () => {
    const { o, buyer } = await order();
    const tries = [
      'write me at john@gmail.com',
      'my email is john at gmail dot com',
      'call 555 123 4567',
      'message me on whatsapp',
      'see https://evil.example/pay',
      'pay me outside the platform and skip the escrow',
    ];
    for (const t of tries) {
      const r = await sendMessage(o, 'buyer', `${buyer}-${t.length}`, ip(), t);
      expect(r, t).toMatchObject({ ok: false, status: 422, blocked: true, error: BLOCKED_MESSAGE });
    }
    expect((await listMessages(o.id)).length).toBe(0);
  });
  it('plain talk about the work goes through', async () => {
    const { o, buyer } = await order();
    for (const t of ['Does it work with Gmail forms?', 'Can you add a booking page by Friday?', 'The logo should be blue.']) expect((await sendMessage(o, 'buyer', buyer, ip(), t)).ok, t).toBe(true);
  });
  it('a blocked message is stored with its reason for the admins and counts as a strike: a warning at 3, a suspension at 5', async () => {
    const { o } = await order();
    const who = `chat-striker-${n}`;
    for (let i = 1; i <= 5; i++) await sendMessage(o, 'buyer', who, ip(), `call me on 555 123 456${i}`);
    const stored = (await blockedList(200)).filter((b) => b.sender_id === who);
    expect(stored).toHaveLength(5);
    expect(stored[0]).toMatchObject({ reason: 'phone', context: 'order', product_key: 'saffron-table' });
    expect(actionsFor(who).map((a) => a.action)).toEqual(['warning', 'suspended']);
    expect(isSuspended(who)).toBe(true);
  });
});
