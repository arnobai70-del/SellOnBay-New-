import { expect, test, type APIRequestContext } from '@playwright/test';

/* Repository delivery, licences, extra work with escrow, and the handover certificate, through the API and the pages, in demo mode. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };
const SITE = { productId: 'saffron-table', pkg: 'asis', domainMode: 'own', own: 'mybakery.com' };
const REPO = 'seo-audit';
const REPO_SITE = { productId: REPO, pkg: 'asis', github: 'octocat' };
type Ev = { event: string };

const make = async (r: APIRequestContext, body: object) => {
  const res = await r.post(`${DEMO}/api/demo/orders`, { data: body });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).id as string;
};
const view = async (r: APIRequestContext, id: string) => (await r.get(`${DEMO}/api/demo/orders/${id}`)).json();
const pay = (r: APIRequestContext, id: string) => r.post(`${DEMO}/api/demo/orders/${id}/pay`, { data: { card: CARD } });
const post = (r: APIRequestContext, path: string, data?: object) => r.post(`${DEMO}/api/demo/orders/${path}`, data ? { data } : undefined);

test.describe('repository delivery', () => {
  test('a repository product needs a GitHub username', async ({ request }) => {
    const bad = await request.post(`${DEMO}/api/demo/orders`, { data: { productId: REPO, pkg: 'asis' } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toMatch(/GitHub/);
    expect((await request.post(`${DEMO}/api/demo/orders`, { data: { productId: REPO, pkg: 'asis', github: 'not a name!' } })).status()).toBe(400);
    const id = await make(request, REPO_SITE);
    expect((await view(request, id)).github).toBe('octocat');
  });
  test('the demo seller invites on its own; the review starts only after the buyer confirms access', async ({ request }) => {
    const id = await make(request, REPO_SITE);
    await pay(request, id);
    expect((await post(request, `${id}/confirm-access`)).status()).toBe(409); // no invite yet
    let v = await view(request, id);
    for (let i = 0; i < 40 && !v.events.some((e: Ev) => e.event === 'repo_invited'); i++) {
      await new Promise((r) => setTimeout(r, 500));
      v = await view(request, id);
    }
    expect(v.events.map((e: Ev) => e.event)).toContain('repo_invited');
    expect(v.state).toBe('in_delivery');
    expect((await post(request, `${id}/accept`)).status()).toBe(409); // not delivered yet
    expect((await post(request, `${id}/confirm-access`)).status()).toBe(200);
    v = await view(request, id);
    expect(v.state).toBe('delivered');
    expect(v.progress.reviewEndsAt - v.progress.deliveredAt).toBe(48 * 3_600_000);
    expect(v.events.map((e: Ev) => e.event)).toEqual(['created', 'funded', 'repo_invited', 'access_confirmed']);
  });
  test('checkout asks for a GitHub username on a repository product only', async ({ page }) => {
    await page.goto(`${DEMO}/checkout?id=${REPO}`);
    await expect(page.getByLabel('Your GitHub username')).toBeVisible();
    await page.goto(`${DEMO}/checkout?id=n8n-leads`);
    await expect(page.getByLabel('Your GitHub username')).toHaveCount(0);
  });
});

test.describe('extra work', () => {
  test('a request, approve and pay into escrow, the deadline moves out; a declined one costs nothing', async ({ request }) => {
    const id = await make(request, SITE);
    await pay(request, id);
    const before = (await view(request, id)).dueAt;
    const ask = (body: object) => post(request, `${id}/extra`, body);
    expect((await ask({ title: 'ab', priceCents: 2500, addDays: 1 })).status()).toBe(400);
    expect((await ask({ title: 'Add a gallery', priceCents: 499, addDays: 1 })).status()).toBe(400);
    expect((await ask({ title: 'Add a gallery', priceCents: 2500, addDays: 4 })).status()).toBe(400);
    expect((await ask({ title: 'x'.repeat(81), priceCents: 2500, addDays: 1 })).status()).toBe(400);
    expect((await ask({ title: 'Pay me on whatsapp', priceCents: 2500, addDays: 1 })).status()).toBe(400);
    const a = (await (await ask({ title: 'Add a gallery page', priceCents: 2500, addDays: 2 })).json()).id as string;
    const b = (await (await ask({ title: 'Add a blog', priceCents: 3000, addDays: 1 })).json()).id as string;
    let v = await view(request, id);
    expect(v.extras.map((x: { state: string }) => x.state)).toEqual(['pending', 'pending']);
    expect((await post(request, `${id}/extra/${a}/approve`)).status()).toBe(200);
    expect((await post(request, `${id}/extra/${a}/approve`)).status()).toBe(409); // already paid
    expect((await post(request, `${id}/extra/${b}/decline`)).status()).toBe(200);
    v = await view(request, id);
    expect(v.extras.map((x: { state: string }) => x.state)).toEqual(['funded', 'declined']);
    expect(v.dueAt - before).toBe(2 * 86_400_000);
    expect(v.events.map((e: Ev) => e.event)).toEqual(expect.arrayContaining(['extra_requested', 'extra_funded', 'extra_declined']));
    expect((await post(request, `${id}/extra/${b}/approve`)).status()).toBe(409); // a declined request cannot be paid
    expect((await post(request, `${id}/extra/00000000-0000-4000-8000-000000000000/approve`)).status()).toBe(404);
  });
  test('needs a funded order that is not yet accepted', async ({ request }) => {
    const id = await make(request, SITE);
    expect((await post(request, `${id}/extra`, { title: 'Too early', priceCents: 2500, addDays: 1 })).status()).toBe(409);
    await pay(request, id);
    await post(request, `${id}/skip`);
    await post(request, `${id}/accept`, { consent: true });
    expect((await post(request, `${id}/extra`, { title: 'Too late', priceCents: 2500, addDays: 1 })).status()).toBe(409);
  });
  test('the order page shows the request and its buttons', async ({ page }) => {
    const id = await make(page.request, SITE);
    await pay(page.request, id);
    await post(page.request, `${id}/extra`, { title: 'Add a gallery page', priceCents: 2500, addDays: 1 });
    await page.goto(`${DEMO}/orders/${id}`);
    await expect(page.getByText('Add a gallery page')).toBeVisible();
    await page.getByRole('button', { name: 'Approve and pay $25' }).click();
    await expect(page.locator('.ord-extra small', { hasText: 'paid into escrow' })).toBeVisible(); // the status line of the request, not the note that also says it
  });
});

test.describe('handover certificate and licences', () => {
  test('made when the order is accepted, a real PDF, once; none before', async ({ request }) => {
    const id = await make(request, SITE);
    await pay(request, id);
    expect((await request.get(`${DEMO}/api/demo/orders/${id}/certificate`)).status()).toBe(404);
    await post(request, `${id}/skip`);
    await post(request, `${id}/accept`, { consent: true });
    const v = await view(request, id);
    expect(v.certificate).toBe(true);
    expect(v.events.filter((e: Ev) => e.event === 'certificate_issued')).toHaveLength(1);
    const pdf = await request.get(`${DEMO}/api/demo/orders/${id}/certificate`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect(pdf.headers()['content-disposition']).toMatch(/attachment/);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });
  test('the certificate belongs to the buyer: a made-up order id gives 404', async ({ request }) => {
    expect((await request.get(`${DEMO}/api/demo/orders/00000000-0000-4000-8000-000000000000/certificate`)).status()).toBe(404);
  });
  test('the product page shows the licence, the third-party code and the GPL note', async ({ page }) => {
    await page.goto(`${DEMO}/product/wp-booking`);
    await expect(page.getByRole('heading', { name: 'Licence' })).toBeVisible();
    await expect(page.getByText('Single project.')).toBeVisible();
    await expect(page.getByText('Includes Chart helper (GPL-2.0)', { exact: true })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('share your own source code');
    await page.goto(`${DEMO}/product/saas-ui-kit`);
    await expect(page.getByText('Multi project.')).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
  });
  test('the order page offers the certificate once accepted', async ({ page }) => {
    const id = await make(page.request, SITE);
    await pay(page.request, id);
    await post(page.request, `${id}/skip`);
    await post(page.request, `${id}/accept`, { consent: true });
    await page.goto(`${DEMO}/orders/${id}`);
    await expect(page.getByRole('link', { name: 'Download your handover certificate' })).toBeVisible();
  });
});

test.describe('repository access: the invite time limit and the take-back', () => {
  const waitForInvite = async (r: APIRequestContext, id: string) => {
    let v = await view(r, id);
    for (let i = 0; i < 40 && v.state !== 'in_delivery'; i++) {
      await new Promise((t) => setTimeout(t, 500));
      v = await view(r, id);
    }
    return v;
  };
  test('after the invite the buyer is told the date it runs out', async ({ page }) => {
    const id = await make(page.request, REPO_SITE);
    await pay(page.request, id);
    const v = await waitForInvite(page.request, id);
    expect(v.repo.expiresAt - v.repo.invitedAt).toBe(7 * 86_400_000);
    await page.goto(`${DEMO}/orders/${id}`);
    await expect(page.locator('[data-repo]').getByText(/Accept the GitHub invite before [A-Z][a-z]{2} \d+, \d{4}/)).toBeVisible();
  });
  test('a refund after the invite shows the buyer that the seller was asked to remove the access', async ({ page }) => {
    const r = page.request;
    const id = await make(r, REPO_SITE);
    await pay(r, id);
    await waitForInvite(r, id);
    expect((await post(r, `${id}/confirm-access`)).status()).toBe(200);
    const dispute = await post(r, `${id}/dispute`, { reason: 'not_working', detail: 'On the second screen the Send button does nothing, the console shows a 500 error.' });
    expect(dispute.status()).toBe(200);
    const did = (await dispute.json()).id as string;
    expect((await r.post(`${DEMO}/api/admin/disputes/${did}/decide`, { data: { decision: 'refund_full', note: 'Confirmed.', liability: 'seller' } })).status()).toBe(200);
    const v = await view(r, id);
    expect(v.state).toBe('refunded');
    expect(v.repo.revoke).toBe('pending');
    await page.goto(`${DEMO}/orders/${id}`);
    await expect(page.locator('[data-revoke="pending"]')).toContainText('the seller was asked to remove your access');
  });
});
