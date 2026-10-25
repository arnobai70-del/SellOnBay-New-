import { expect, test, type APIRequestContext } from '@playwright/test';

/* The order chat through the API and the pages, in demo mode. The seller side needs accounts, so it is checked against the real server for who may call what. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const REAL = process.env.REAL_URL ?? 'http://localhost:3000';
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };
const SITE = { productId: 'saffron-table', pkg: 'asis', domainMode: 'own', own: 'mybakery.com' };

const paid = async (r: APIRequestContext) => {
  const id = (await (await r.post(`${DEMO}/api/demo/orders`, { data: SITE })).json()).id as string;
  await r.post(`${DEMO}/api/demo/orders/${id}/pay`, { data: { card: CARD } });
  return id;
};
const send = (r: APIRequestContext, id: string, body: string) => r.post(`${DEMO}/api/demo/orders/${id}/messages`, { data: { body } });

test.describe('order chat (API)', () => {
  test('closed until the payment is held; then the buyer can write and read', async ({ request }) => {
    const unpaid = (await (await request.post(`${DEMO}/api/demo/orders`, { data: SITE })).json()).id as string;
    expect((await send(request, unpaid, 'hello')).status()).toBe(409);
    const id = await paid(request);
    expect((await send(request, id, 'Can you add a gallery page?')).status()).toBe(200);
    const list = await (await request.get(`${DEMO}/api/demo/orders/${id}/messages`)).json();
    expect(list.messages.map((m: { role: string; body: string }) => [m.role, m.body])).toEqual([['buyer', 'Can you add a gallery page?']]);
  });
  test('contact details, links and outside payment are refused with a general explanation, and nothing is delivered', async ({ request }) => {
    const id = await paid(request);
    for (const text of ['email me at jo@gmail.com', 'call 555 123 4567', 'text me on whatsapp', 'see https://evil.example', 'pay me outside the platform']) {
      const r = await send(request, id, text);
      expect(r.status(), text).toBe(422);
      const j = await r.json();
      expect(j.blocked).toBe(true);
      expect(j.error).toContain('keep contact details, links and payments on SellOnBay');
      expect(JSON.stringify(j)).not.toMatch(/phone|email address|whatsapp/i); // it does not say which rule matched
    }
    expect((await (await request.get(`${DEMO}/api/demo/orders/${id}/messages`)).json()).messages).toHaveLength(0);
  });
  test('only newer messages come back when you ask "since"', async ({ request }) => {
    const id = await paid(request);
    await send(request, id, 'first');
    const a = await (await request.get(`${DEMO}/api/demo/orders/${id}/messages`)).json();
    await new Promise((r) => setTimeout(r, 20));
    await send(request, id, 'second');
    const b = await (await request.get(`${DEMO}/api/demo/orders/${id}/messages?since=${a.messages[0].at}`)).json();
    expect(b.messages.map((m: { body: string }) => m.body)).toEqual(['second']);
  });
  test('a made-up order or a bad id gives 404', async ({ request }) => {
    expect((await send(request, '00000000-0000-4000-8000-000000000000', 'hi')).status()).toBe(404);
    expect((await request.get(`${DEMO}/api/demo/orders/nope/messages`)).status()).toBe(404);
  });
});

test.describe('order chat (pages)', () => {
  test('the chat sits on the order page: write, see it, and a blocked message shows the explanation', async ({ page }) => {
    const id = await paid(page.request);
    await page.goto(`${DEMO}/orders/${id}`);
    const chat = page.getByRole('region', { name: 'Messages about this order' });
    await expect(chat).toBeVisible();
    await expect(chat).toContainText('Emails, phone numbers, links and paying outside');
    await chat.getByLabel('Your message').fill('The logo should be blue, thanks.');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.getByText('The logo should be blue, thanks.')).toBeVisible();
    await chat.getByLabel('Your message').fill('write to me at jo@gmail.com');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.getByRole('alert')).toContainText('keep contact details, links and payments on SellOnBay');
    await expect(chat.locator('.chat2-msg', { hasText: 'jo@gmail.com' })).toHaveCount(0); // never shown as a message (it stays in the box so it can be edited)
  });
  test('the messages page and the full chat page open', async ({ page }) => {
    const id = await paid(page.request);
    expect((await page.goto(`${DEMO}/messages`))?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Your order chats' })).toBeVisible();
    expect((await page.goto(`${DEMO}/messages/${id}`))?.status()).toBe(200);
    await expect(page.getByRole('region', { name: 'Messages about this order' })).toBeVisible();
    expect((await page.goto(`${DEMO}/messages/00000000-0000-4000-8000-000000000000`))?.status()).toBe(404);
  });
});

test.describe('who may use the seller side (real server)', () => {
  test('signed out: 401, and the seller route does not exist for a stranger', async ({ request }) => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await request.get(`${REAL}/api/orders/${id}/messages`)).status()).toBe(401);
    expect((await request.post(`${REAL}/api/orders/${id}/messages`, { data: { body: 'hello there' } })).status()).toBe(401);
  });
});
