import { expect, test, type APIRequestContext } from '@playwright/test';

/* Disputes, the admin pages and their guards. Demo mode (orders in memory, no accounts) for the flow; the real server for "who may call what". */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const REAL = process.env.REAL_URL ?? 'http://localhost:3000';
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };
const SITE = { productId: 'saffron-table', pkg: 'asis', domainMode: 'own', own: 'mybakery.com' };
const GOOD = 'The page loads blank and the contact form throws an error when I send it.';
type Ev = { event: string };

const make = async (r: APIRequestContext, body: object = SITE) => (await (await r.post(`${DEMO}/api/demo/orders`, { data: body })).json()).id as string;
const view = async (r: APIRequestContext, id: string) => (await r.get(`${DEMO}/api/demo/orders/${id}`)).json();
const post = (r: APIRequestContext, path: string, data?: object) => r.post(`${DEMO}${path}`, data ? { data } : undefined);
const delivered = async (r: APIRequestContext) => {
  const id = await make(r);
  await post(r, `/api/demo/orders/${id}/pay`, { card: CARD });
  await post(r, `/api/demo/orders/${id}/skip`);
  return id;
};

test.describe('disputes through the API', () => {
  test('the buyer reports a problem: reason and real detail needed, contact details refused, only while reviewing', async ({ request }) => {
    const early = await make(request);
    expect((await post(request, `/api/demo/orders/${early}/dispute`, { reason: 'not_working', detail: GOOD })).status()).toBe(409); // not delivered
    const id = await delivered(request);
    expect((await post(request, `/api/demo/orders/${id}/dispute`, { reason: 'banana', detail: GOOD })).status()).toBe(400);
    expect((await post(request, `/api/demo/orders/${id}/dispute`, { reason: 'not_working', detail: 'broken' })).status()).toBe(400);
    expect((await post(request, `/api/demo/orders/${id}/dispute`, { reason: 'not_working', detail: 'It is broken, mail me at buyer@example.com and I will explain.' })).status()).toBe(400);
    expect((await view(request, id)).state).toBe('delivered');
    expect((await view(request, id)).canDispute).toBe(true);
  });
  test('opening one holds the order; a second is refused; the admin refunds; everything is in the history and the audit log', async ({ request }) => {
    const id = await delivered(request);
    const open = await post(request, `/api/demo/orders/${id}/dispute`, { reason: 'not_working', detail: GOOD });
    expect(open.status()).toBe(200);
    const did = (await open.json()).id as string;
    let v = await view(request, id);
    expect(v.state).toBe('disputed');
    expect(v.canDispute).toBe(false);
    expect(v.dispute).toMatchObject({ id: did, status: 'open', reason: 'not_working' });
    expect((await post(request, `/api/demo/orders/${id}/dispute`, { reason: 'other', detail: GOOD })).status()).toBe(409);
    expect((await post(request, `/api/demo/orders/${id}/accept`)).status()).toBe(409); // held
    expect((await post(request, `/api/disputes/${did}/evidence`, { text: 'On the second screen the Send button does nothing.' })).status()).toBe(200);
    expect((await post(request, `/api/disputes/${did}/evidence`, { text: 'call 555 123 4567' })).status()).toBe(400);
    expect((await post(request, `/api/admin/disputes/${did}/decide`, { decision: 'refund_partial', refundCents: 1 })).status()).toBe(200);
    // partial refund of 1 cent released the rest: the order is accepted with a refund noted
    v = await view(request, id);
    expect(v.state).toBe('accepted');
    expect(v.dispute.status).toBe('decided');
    expect(v.events.map((e: Ev) => e.event)).toEqual(expect.arrayContaining(['dispute_opened', 'dispute_decided']));
    expect((await post(request, `/api/admin/disputes/${did}/decide`, { decision: 'refund_full' })).status()).toBe(409); // decided once
    const audit = await (await request.get(`${DEMO}/dashboard/admin/audit`)).text();
    expect(audit).toContain('dispute refund partial');
  });
  test('a full refund sends the order to refunded', async ({ request }) => {
    const id = await delivered(request);
    const did = (await (await post(request, `/api/demo/orders/${id}/dispute`, { reason: 'malware', detail: GOOD })).json()).id as string;
    expect((await post(request, `/api/admin/disputes/${did}/decide`, { decision: 'refund_full', note: 'Confirmed.' })).status()).toBe(200);
    expect((await view(request, id)).state).toBe('refunded');
  });
  test('bad input to the admin route is refused', async ({ request }) => {
    expect((await post(request, '/api/admin/disputes/not-real/decide', { decision: 'release' })).status()).toBe(404);
    expect((await post(request, '/api/admin/disputes/00000000-0000-4000-8000-000000000000/decide', { decision: 'explode' })).status()).toBe(400);
  });
});

test.describe('admin pages (demo mode)', () => {
  test('Messages opened from the admin menu keeps the admin menu', async ({ page }) => {
    await page.goto(`${DEMO}/dashboard/admin`);
    await page.locator('.side').getByRole('link', { name: 'Messages' }).click();
    await expect(page).toHaveURL(/\/messages\?view=admin/);
    await expect(page.locator('.side').getByRole('link', { name: 'Disputes' })).toBeVisible();
    await expect(page.locator('.side').getByRole('link', { name: 'Messages' })).toHaveAttribute('aria-current', 'page');
  });

  test('every admin page opens and says what it is for', async ({ page }) => {
    for (const [path, heading] of [
      ['/dashboard/admin', 'New listings'],
      ['/dashboard/admin/disputes', 'Open disputes'],
      ['/dashboard/admin/payouts', 'Weekly payouts'],
      ['/dashboard/admin/users', 'Accounts'],
      ['/dashboard/admin/abuse', 'Open reports'],
      ['/dashboard/admin/audit', 'What admins did'],
      ['/notifications', 'Notifications'],
    ] as const) {
      const r = await page.goto(`${DEMO}${path}`);
      expect(r?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first(), path).toBeVisible();
    }
  });
  test('an open dispute shows in the queue with its evidence and a decision form', async ({ page }) => {
    const id = await delivered(page.request);
    await post(page.request, `/api/demo/orders/${id}/dispute`, { reason: 'not_as_described', detail: GOOD });
    await page.goto(`${DEMO}/dashboard/admin/disputes`);
    await expect(page.getByRole('heading', { name: /Not as described/ }).first()).toBeVisible();
    await expect(page.getByText(GOOD).first()).toBeVisible();
    await page.getByRole('button', { name: 'Decide' }).first().click();
    await expect(page.getByLabel('Decision').first()).toBeVisible();
  });
  test('the order page offers "Report a problem" while reviewing and shows the dispute afterwards', async ({ page }) => {
    const id = await delivered(page.request);
    await page.goto(`${DEMO}/orders/${id}`);
    await page.getByRole('button', { name: 'Report a problem' }).click();
    await page.getByLabel('What happened (at least 20 characters)').fill(GOOD);
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText('Problem reported')).toBeVisible();
  });
  test('the payout CSV says so when there is nothing to export; a bad week is refused', async ({ request }) => {
    expect((await request.post(`${DEMO}/api/admin/payouts/csv?week=2020-01-05`)).status()).toBe(404);
    expect((await request.post(`${DEMO}/api/admin/payouts/csv?week=yesterday`)).status()).toBe(400);
    const plan = await post(request, '/api/admin/payouts/plan');
    expect(plan.status()).toBe(200);
    expect((await plan.json()).created).toBeGreaterThanOrEqual(0);
  });
});

test.describe('abuse reports (demo mode)', () => {
  test('a public report reaches the admin page, and the admin can decide it', async ({ page }) => {
    const site = `report-me-${Date.now()}.example/product/spam-${Date.now()}`;
    await page.goto(`${DEMO}/report-abuse`);
    await page.getByLabel('Site address').fill(site);
    await page.getByLabel('Details (optional)').fill('Fake login page for a bank.');
    await page
      .getByRole('button', { name: /send|report/i })
      .first()
      .click();
    await expect(page.getByText('Report received')).toBeVisible();
    await page.goto(`${DEMO}/dashboard/admin/abuse`);
    const card = page.locator('.adm-card', { hasText: site });
    await expect(card).toBeVisible();
    await expect(card.getByText('1 different reporter')).toBeVisible();
    await card.getByRole('button', { name: 'Decide' }).click();
    await card.getByLabel('Decision').selectOption('dismiss');
    await card.getByRole('button', { name: 'Save decision' }).click();
    await expect(page.locator('.adm-card', { hasText: site })).toHaveCount(0);
  });
});

test.describe('who may call what (real server)', () => {
  const admin = [
    ['POST', '/api/admin/listings/x/decide'],
    ['POST', '/api/admin/developers/x/decide'],
    ['POST', '/api/admin/disputes/00000000-0000-4000-8000-000000000000/decide'],
    ['POST', '/api/admin/payouts/plan'],
    ['POST', '/api/admin/payouts/csv'],
    ['POST', '/api/admin/payouts/00000000-0000-4000-8000-000000000000/paid'],
    ['POST', '/api/admin/payouts/00000000-0000-4000-8000-000000000000/fail'],
    ['POST', '/api/admin/users/00000000-0000-4000-8000-000000000000/action'],
    ['POST', '/api/admin/abuse/00000000-0000-4000-8000-000000000000/decide'],
  ] as const;
  test('signed out, every admin route says 401 and every scheduled job refuses without its secret', async ({ request }) => {
    for (const [m, p] of admin) {
      const r = await request.fetch(`${REAL}${p}`, { method: m, data: m === 'POST' ? {} : undefined });
      expect(r.status(), `${m} ${p}`).toBe(401);
    }
    for (const p of ['/api/cron/orders', '/api/cron/payouts']) {
      expect((await request.post(`${REAL}${p}`)).status(), p).toBe(401);
      expect((await request.post(`${REAL}${p}`, { headers: { authorization: 'Bearer wrong' } })).status(), p).toBe(401);
    }
  });
  test('the admin pages send a signed-out visitor to sign in', async ({ page }) => {
    await page.goto(`${REAL}/dashboard/admin/payouts`);
    await expect(page).toHaveURL(/\/login/);
  });
  test('a signed-out visitor cannot report a problem on, or add evidence to, somebody else', async ({ request }) => {
    expect((await request.post(`${REAL}/api/disputes/00000000-0000-4000-8000-000000000000/reply`, { data: { text: 'hello there seller' } })).status()).toBe(401);
    expect((await request.post(`${REAL}/api/disputes/00000000-0000-4000-8000-000000000000/evidence`, { data: { text: 'hello there' } })).status()).toBe(404);
    expect((await request.post(`${REAL}/api/notifications`, { data: { id: 'all' } })).status()).toBe(401);
  });
});

test.describe('settings in demo mode (no accounts, so the admin routes are open here)', () => {
  test('the early access bar shows when it is switched on and goes away when it is switched off', async ({ page, request }) => {
    const call = (data: object) => request.post(`${DEMO}/api/admin/settings`, { data });
    await call({ earlyAccessOn: 'off', reason: 'Start from a bar that is hidden.' }); // 409 when it was already off
    expect((await call({ earlyAccessOn: 'on', reason: 'Show the bar for the test.' })).status()).toBe(200);
    await page.goto(`${DEMO}/`);
    await expect(page.locator('.early-bar')).toContainText('between $5 and $70');
    await page.goto(`${DEMO}/browse`);
    await expect(page.locator('.early-bar')).toBeVisible();
    expect((await call({ earlyAccessOn: 'off', reason: 'Hide the bar again.' })).status()).toBe(200);
    await page.goto(`${DEMO}/`);
    await expect(page.locator('.early-bar')).toHaveCount(0);
    expect((await call({ priceMinCents: '5', priceMaxCents: '4', reason: 'This is wrong on purpose.' })).status()).toBe(400);
    expect((await call({ priceMaxCents: '70', reason: 'Same value again.' })).status()).toBe(409);
  });
});

test('the launch check lists what the live server still needs, without showing any key', async ({ page }) => {
  await page.goto(`${DEMO}/dashboard/admin/launch`);
  const box = page.locator('[data-launch]');
  await expect(box).toContainText('Payments');
  await expect(box).toContainText('Known gap');
  await expect(box.locator('li', { hasText: 'Database' })).toContainText('To do'); // demo mode has no database
  await expect(box.locator('li', { hasText: 'Examples cannot be bought' })).toContainText('Done');
});
