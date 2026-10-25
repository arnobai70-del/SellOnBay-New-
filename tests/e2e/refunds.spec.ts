import { expect, test } from '@playwright/test';

/* The refund wording for digital products: on /refunds, with the lawyer tag, and as a short line at checkout. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';

test('/refunds explains digital products and carries the lawyer-review tag', async ({ page }) => {
  await page.goto(`${DEMO}/refunds`);
  await expect(page.getByText('[LAWYER REVIEW]')).toBeVisible();
  const h = page.getByRole('heading', { name: /Digital products/ });
  await expect(h).toHaveAttribute('id', 'digital-products');
  await expect(page.getByText('changing your mind after you have downloaded them is not a reason for a refund')).toBeVisible();
  await expect(page.getByText(/If something is wrong, tell the seller first/)).toBeVisible();
  await expect(page.getByText(/not as described, does not work, contains harmful code/)).toBeVisible();
  await expect(page.getByText(/no refunds ever/i)).toHaveCount(0); // never claim that
});

test('the checkout of a digital product has the short line, a website does not', async ({ page }) => {
  await page.goto(`${DEMO}/checkout?id=n8n-leads`);
  const line = page.locator('[data-refund]');
  await expect(line).toContainText('Changing your mind after you download is not a reason for a refund');
  await expect(line.getByRole('link', { name: 'Refunds' })).toHaveAttribute('href', '/refunds#digital-products');
  await page.goto(`${DEMO}/checkout?id=saffron-table`);
  await expect(page.locator('[data-refund]')).toHaveCount(0);
});

test('the buy box shows the sellers prices for setup help and customisation (the defaults on a starter listing)', async ({ page }) => {
  await page.goto(`${DEMO}/product/saffron-table`);
  const box = page.locator('.buybox');
  await expect(box.getByText('With setup help')).toContainText('+$30');
  await expect(box.getByText('With customisation')).toContainText('+$100');
  await page.goto(`${DEMO}/checkout?id=saffron-table&pkg=setup`);
  await expect(page.getByText(/with setup help/i).first()).toBeVisible();
});
