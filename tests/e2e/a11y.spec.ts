import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * Accessibility (Phase 13): automated WCAG 2.1 A and AA checks with axe on the main pages, keyboard reach and visible focus, labelled form
 * fields, and no sideways scrolling at phone, tablet and desktop widths. Runs on the normal build in demo mode (NEW_URL, port 3005), where the
 * dashboards open without accounts; nothing here needs Supabase.
 * A page fails on any "serious" or "critical" violation; "moderate" and "minor" ones are printed so they can be fixed too.
 */
const BASE = process.env.NEW_URL ?? 'http://localhost:3005';

const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';

/* A product page. The normal build shows only real seller listings, and demo mode has none, so the legacy demo build's example is used. */
async function productUrl(page: Page): Promise<string | null> {
  await page.goto(BASE + '/');
  const hrefs = await page.$$eval('a[href^="/templates/"]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
  const own = hrefs.find((h) => /^\/templates\/[^/]+\/[^/?#]+$/.test(h));
  if (own) return BASE + own;
  const r = await page.request.get(DEMO + '/product/saffron-table').catch(() => null);
  return r && r.ok() ? DEMO + '/product/saffron-table' : null;
}

const PAGES: [string, string][] = [
  ['storefront', '/'],
  ['category', '/templates/saas'],
  ['login', '/login'],
  ['FAQ', '/faq'],
  ['how it works', '/how-it-works'],
  ['admin dashboard', '/dashboard/admin'],
  ['admin purchase requests', '/admin/orders/requests'],
  ['admin support', '/admin/support/tickets'],
  ['admin releases', '/admin/orders/releases'],
  ['admin CMS', '/admin/content/cms'],
  ['admin revisions', '/admin/orders/revisions'],
  ['seller dashboard', '/dashboard/seller'],
  ['seller revisions', '/dashboard/seller/revisions'],
  ['buyer dashboard', '/dashboard/buyer'],
  ['buyer requests', '/dashboard/buyer/requests'],
  ['buyer support', '/dashboard/buyer/support'],
  ['messages', '/messages'],
];

async function axe(page: Page, name: string) {
  // Sections fade in on scroll; with reduced motion they show at once, so contrast is measured on the finished page, not mid-animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  // .tp is the generated preview of the SELLER's site (TemplatePage), drawn in the listing's own brand colours; it is the product being sold,
  // not SellOnBay's interface, so its colours are the seller's choice and are left out of the check.
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.tp').analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of r.violations.filter((x) => !bad.includes(x))) console.log(`[a11y ${v.impact}] ${name}: ${v.id} (${v.nodes.length})`);
  expect(
    bad.map(
      (v) =>
        `${v.id}: ${v.help} -> ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    ),
    `${name} has serious accessibility problems`,
  ).toEqual([]);
}

test.describe('automated WCAG checks', () => {
  for (const [name, path] of PAGES)
    test(name, async ({ page }) => {
      const res = await page.goto(BASE + path);
      expect(res?.status(), path).toBeLessThan(400);
      await axe(page, name);
    });
  test('product page', async ({ page }) => {
    const url = await productUrl(page);
    test.skip(!url, 'no product page reachable');
    await page.goto(url!);
    await axe(page, 'product page');
  });
  test('request to buy (quotation workflow start)', async ({ page }) => {
    const url = await productUrl(page);
    test.skip(!url, 'no product page reachable');
    await page.goto(url!);
    const link = page.locator('a[href^="/checkout"]').first();
    test.skip((await link.count()) === 0, 'no request link on this product');
    await page.goto(new URL((await link.getAttribute('href'))!, url!).toString());
    await axe(page, 'request to buy');
  });
});

test.describe('keyboard and focus', () => {
  test('the first Tab reaches a visible, focused control on the storefront and the login page', async ({ page }) => {
    for (const path of ['/', '/login']) {
      await page.goto(BASE + path);
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, visible: r.width > 0 && r.height > 0, outline: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' };
      });
      expect(info, `${path}: Tab focused nothing`).not.toBeNull();
      expect(info!.visible, `${path}: focused element is hidden`).toBe(true);
      expect(info!.outline, `${path}: focused element shows no focus ring`).toBe(true);
    }
  });
  test('every control on the main forms has an accessible name', async ({ page }) => {
    for (const path of ['/login', '/dashboard/buyer/support', '/admin/content/cms']) {
      await page.goto(BASE + path);
      const unnamed = await page.$$eval('input:not([type=hidden]), select, textarea, button', (els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .filter((e) => {
            const id = e.getAttribute('id');
            const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
            const text = (e.getAttribute('aria-label') ?? '') + (e.getAttribute('aria-labelledby') ?? '') + (e.closest('label')?.textContent ?? '') + (label?.textContent ?? '');
            const own = e.tagName === 'BUTTON' ? (e.textContent ?? '') + (e.getAttribute('title') ?? '') : '';
            return !(text + own).trim() && !(e as HTMLInputElement).placeholder;
          })
          .map((e) => e.outerHTML.slice(0, 120)),
      );
      expect(unnamed, `${path}: controls without a name`).toEqual([]);
    }
  });
  test('the phone menu opens with the keyboard and closes with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 }); // the top bar is plain links on wide screens; phones use the menu sheet
    await page.goto(BASE + '/');
    const trigger = page.locator('.mk-hdr .mk-burger');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('responsive layout', () => {
  for (const width of [360, 390, 768, 1280])
    test(`no sideways scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/', '/login', '/faq', '/dashboard/buyer', '/dashboard/admin']) {
        await page.goto(BASE + path);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(sw, `${path} at ${width}px`).toBeLessThanOrEqual(width); // compare with the width we set (CLAUDE.md phone lessons)
      }
    });
});
