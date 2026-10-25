import { expect, test, type APIRequestContext } from '@playwright/test';

/* Accepting an order needs the ticked box; the evidence file is a PDF for the buyer. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };
const delivered = async (r: APIRequestContext) => {
  const id = (await (await r.post(`${DEMO}/api/demo/orders`, { data: { productId: 'saffron-table', pkg: 'asis', domainMode: 'own', own: 'mybakery.com' } })).json()).id as string;
  await r.post(`${DEMO}/api/demo/orders/${id}/pay`, { data: { card: CARD } });
  await r.post(`${DEMO}/api/demo/orders/${id}/skip`);
  return id;
};

test.describe('accepting an order', () => {
  test('the box must be ticked: no body, false and a missing box are refused, the ticked box works once', async ({ request }) => {
    const id = await delivered(request);
    const url = `${DEMO}/api/demo/orders/${id}/accept`;
    expect((await request.post(url)).status()).toBe(400);
    expect((await request.post(url, { data: { consent: false } })).status()).toBe(400);
    expect((await request.post(url, { data: {} })).status()).toBe(400);
    expect((await (await request.get(`${DEMO}/api/demo/orders/${id}`)).json()).state).toBe('delivered');
    expect((await request.post(url, { data: { consent: true } })).status()).toBe(200);
    expect((await request.post(url, { data: { consent: true } })).status()).toBe(409);
  });

  test('on the order page the button waits for the box, then accepts', async ({ page }) => {
    const id = await delivered(page.request);
    await page.goto(`${DEMO}/orders/${id}`);
    const button = page.getByRole('button', { name: /Accept and release payment/ });
    await expect(button).toBeDisabled();
    await page.getByRole('checkbox').check();
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByText('All done.')).toBeVisible();
  });
});

test.describe('the evidence file', () => {
  test('is a PDF for the buyer of a paid order, never for an unpaid or unknown one', async ({ request }) => {
    const id = await delivered(request);
    const res = await request.get(`${DEMO}/api/demo/orders/${id}/evidence`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    expect(res.headers()['content-disposition']).toContain('evidence-');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const unpaid = (await (await request.post(`${DEMO}/api/demo/orders`, { data: { productId: 'saffron-table', pkg: 'asis', domainMode: 'own', own: 'mybakery.com' } })).json()).id as string;
    expect((await request.get(`${DEMO}/api/demo/orders/${unpaid}/evidence`)).status()).toBe(409);
    expect((await request.get(`${DEMO}/api/demo/orders/11111111-1111-4111-8111-111111111111/evidence`)).status()).toBe(404);
  });

  test('the order page links to it', async ({ page }) => {
    const id = await delivered(page.request);
    await page.goto(`${DEMO}/orders/${id}`);
    await expect(page.getByRole('link', { name: /Download the full record of this order/ })).toHaveAttribute('href', `/api/demo/orders/${id}/evidence`);
  });
});
