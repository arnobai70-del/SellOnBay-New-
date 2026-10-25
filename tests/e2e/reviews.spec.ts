import { expect, test, type APIRequestContext } from '@playwright/test';

/* Reviews through the API and the pages, in demo mode. Structured data only carries a rating once there is a real review. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };

const accepted = async (r: APIRequestContext, productId = 'saffron-table') => {
  const id = (await (await r.post(`${DEMO}/api/demo/orders`, { data: { productId, pkg: 'asis', domainMode: 'own', own: 'mybakery.com' } })).json()).id as string;
  await r.post(`${DEMO}/api/demo/orders/${id}/pay`, { data: { card: CARD } });
  await r.post(`${DEMO}/api/demo/orders/${id}/skip`);
  return id;
};
const ldOf = async (r: APIRequestContext, path: string) => {
  const html = await (await r.get(`${DEMO}${path}`)).text();
  const m = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]) : null;
};

test.describe('reviews', () => {
  test('a product without a real review has Product data but no rating in its structured data', async ({ request }) => {
    const ld = await ldOf(request, '/product/folio-studio');
    expect(ld['@type']).toBe('Product');
    expect(ld.offers).toMatchObject({ '@type': 'Offer', priceCurrency: 'USD' });
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.review).toBeUndefined();
  });
  test('only an accepted order can be reviewed; then one review, with the rating shown on the product page and in the structured data', async ({ request, page }) => {
    const id = await accepted(request, 'clinic-desk');
    const post = (data: object) => request.post(`${DEMO}/api/demo/orders/${id}/review`, { data });
    expect((await post({ rating: 5, body: 'too early' })).status()).toBe(409); // delivered, not accepted yet
    await request.post(`${DEMO}/api/demo/orders/${id}/accept`, { data: { consent: true } });
    expect((await post({ rating: 9, body: '' })).status()).toBe(400);
    expect((await post({ rating: 5, body: 'write to me at buyer@example.com' })).status()).toBe(400);
    expect((await post({ rating: 5, body: 'Set up fast, the seller answered every question.' })).status()).toBe(200);
    expect((await post({ rating: 1, body: 'again' })).status()).toBe(409);
    const view = await (await request.get(`${DEMO}/api/demo/orders/${id}`)).json();
    expect(view.review).toMatchObject({ rating: 5 });
    expect(view.canReview).toBe(false);
    const ld = await ldOf(request, '/product/clinic-desk');
    expect(ld.aggregateRating).toMatchObject({ '@type': 'AggregateRating', bestRating: 5 });
    expect(ld.aggregateRating.reviewCount).toBeGreaterThanOrEqual(1);
    expect(ld.review[0].reviewBody).toBeTruthy();
    await page.goto(`${DEMO}/product/clinic-desk`);
    await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible();
    await expect(page.getByText('Set up fast, the seller answered every question.').first()).toBeVisible();
  });
  test('the order page offers the review form after acceptance', async ({ page }) => {
    const id = await accepted(page.request, 'shopline');
    await page.request.post(`${DEMO}/api/demo/orders/${id}/accept`, { data: { consent: true } });
    await page.goto(`${DEMO}/orders/${id}`);
    await page.getByLabel('What was it like? (optional)').fill('Great start for my shop.');
    await page.getByRole('button', { name: 'Post review' }).click();
    await expect(page.getByText('Thanks for your review.')).toBeVisible();
  });
  test('structured data cannot be broken out of with a "<" in a listing or a review', async ({ request }) => {
    const html = await (await request.get(`${DEMO}/product/clinic-desk`)).text();
    const m = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html);
    expect(m).not.toBeNull(); // the whole script body has no "<" in it, so it ends exactly where it should
  });
});
