import { expect, test, type APIRequestContext } from '@playwright/test';

/* The old order chat and the new SellOnBay conversations through the API and the pages, in demo mode. The seller side needs accounts, so it is checked against the real server for who may call what. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const REAL = process.env.REAL_URL ?? 'http://localhost:3000';
const send = (r: APIRequestContext, id: string, body: string) => r.post(`${DEMO}/api/demo/orders/${id}/messages`, { data: { body } });

/*
 * SellOnBay 2.0 (owner decision D-B): the old buyer-seller chat is read only; new messages go to SellOnBay (/api/conversations, /api/tickets).
 * Instant checkout is closed in 2.0, so demo mode cannot make a paid order any more; these checks need none. The read-only chat box on an
 * order is covered by the props in components/OrderView.tsx and the conversation rules by tests/unit/messaging.test.ts.
 */
const MADE_UP = '00000000-0000-4000-8000-000000000000';
test.describe('order chat (API)', () => {
  test('the old chat refuses every new message with 410', async ({ request }) => {
    const r = await send(request, MADE_UP, 'Can you add a gallery page?');
    expect(r.status()).toBe(410);
    expect((await r.json()).error).toContain('Messages now go through SellOnBay');
  });
  test('reading a made-up order or a bad id gives 404', async ({ request }) => {
    expect((await request.get(`${DEMO}/api/demo/orders/${MADE_UP}/messages`)).status()).toBe(404);
    expect((await request.get(`${DEMO}/api/demo/orders/nope/messages`)).status()).toBe(404);
  });
  test('the conversation and ticket APIs need an account (none in demo mode)', async ({ request }) => {
    expect((await request.get(`${DEMO}/api/conversations/order/${MADE_UP}`)).status()).toBe(404);
    expect((await request.post(`${DEMO}/api/conversations/order/${MADE_UP}`, { data: { channel: 'buyer_admin', body: 'hi' } })).status()).toBe(404);
    expect((await request.post(`${DEMO}/api/tickets`, { data: { subject: 'Help', body: 'Hello' } })).status()).toBe(404);
  });
});

test.describe('order chat (pages)', () => {
  test('the messages page opens and a made-up chat is 404', async ({ page }) => {
    expect((await page.goto(`${DEMO}/messages`))?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Your order chats' })).toBeVisible();
    expect((await page.goto(`${DEMO}/messages/${MADE_UP}`))?.status()).toBe(404);
  });
});

test.describe('who may use the seller side (real server)', () => {
  test('signed out: 401, and the seller route does not exist for a stranger', async ({ request }) => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await request.get(`${REAL}/api/orders/${id}/messages`)).status()).toBe(401);
    expect((await request.post(`${REAL}/api/orders/${id}/messages`, { data: { body: 'hello there' } })).status()).toBe(410);
    expect((await request.get(`${REAL}/api/conversations/order/${id}`)).status()).toBe(401);
    expect((await request.post(`${REAL}/api/tickets`, { data: { subject: 'Help', body: 'Hello' } })).status()).toBe(401);
  });
});
