import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const REAL = process.env.REAL_URL ?? 'http://localhost:3000';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/* ---- the form in the browser (demo mode, no backend) ---- */
test.describe('listing form: submit for review is blocked until the minimum is met', () => {
  test('empty form: clear list of what is missing, then a draft can still be saved', async ({ page }) => {
    await page.goto(`${DEMO}/sell/new`);
    await page.getByRole('button', { name: 'A digital product' }).click();
    await page.getByRole('button', { name: 'Check my listing' }).click();
    const box = page.getByRole('alert').filter({ hasText: 'Before you submit for review, add:' });
    await expect(box).toBeVisible();
    for (const line of [
      'a name of 3 to 60 characters',
      'a description of at least 20 characters',
      'at least 1 item under "What is included"',
      'at least 1 screenshot',
      'a private link to your files (https)',
      'the tick that your files are clean and yours to sell',
    ])
      await expect(box).toContainText(line);
    await expect(page.getByText('Submitted.')).toHaveCount(0);
    // drafts stay soft: only a name is needed
    await page.locator('#s-name').fill('My draft');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved')).toBeVisible();
  });

  test('a script needs a demo link, and one more thing at a time disappears from the list', async ({ page }) => {
    await page.goto(`${DEMO}/sell/new`);
    await page.getByRole('button', { name: 'A digital product' }).click();
    await page.locator('#s-cat').selectOption('Scripts');
    await page.locator('#s-name').fill('Bulk SEO script');
    await page.locator('#s-desc').fill('Crawls a whole site and writes a report of titles and broken links.');
    await page.locator('#s-inc').fill('The script');
    await page.locator('#s-shots').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
    await page.locator('#s-reqs').fill('Python 3.10 or newer');
    await page.locator('#s-code').fill('https://drive.example.com/files');
    await page.locator('input[name=clean]').check();
    await page.getByRole('button', { name: 'Check my listing' }).click();
    const box = page.getByRole('alert').filter({ hasText: 'Before you submit for review, add:' });
    await expect(box).toContainText('a demo link');
    await expect(box.locator('li')).toHaveCount(1);
  });

  test('a complete listing is accepted', async ({ page }) => {
    await page.goto(`${DEMO}/sell/new`);
    await page.getByRole('button', { name: 'A digital product' }).click();
    await page.locator('#s-cat').selectOption('Scripts');
    await page.locator('#s-name').fill('Bulk SEO script');
    await page.locator('#s-desc').fill('Crawls a whole site and writes a report of titles and broken links.');
    await page.locator('#s-inc').fill('The script\nA readme');
    await page.locator('#s-shots').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
    await page.locator('#s-demo2').fill('https://video.example.com/seo-script');
    await page.locator('#s-reqs').fill('Python 3.10 or newer');
    await page.locator('#s-code').fill('https://drive.example.com/files');
    await page.locator('input[name=clean]').check();
    // first the check step: the listing in the fixed order buyers see, with Edit to go back
    await page.getByRole('button', { name: 'Check my listing' }).click();
    const chk = page.locator('[data-check]');
    await expect(chk.getByRole('heading', { name: 'Check your listing' })).toBeVisible();
    await expect(chk).toContainText('Bulk SEO script');
    await expect(chk).toContainText('Python 3.10 or newer');
    await expect(chk).toContainText('A readme');
    await expect(page.locator('#s-name')).toBeHidden();
    await chk.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#s-name')).toHaveValue('Bulk SEO script'); // nothing typed is lost
    await page.locator('#s-name').fill('Bulk SEO checker');
    await page.getByRole('button', { name: 'Check my listing' }).click();
    await expect(chk).toContainText('Bulk SEO checker');
    await chk.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Submitted.')).toBeVisible();
  });
});

/* ---- the server enforces the same rules (real database, a seller with an authenticator) ---- */
const envFile = path.join(__dirname, '..', '..', '.env.local');
const env: Record<string, string> = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {};

const b32 = (s: string) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, '0');
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
};
const totp = (secret: string) => {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac('sha1', b32(secret)).update(c).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
};

test.describe('listing API: the server enforces the same rules', () => {
  test.skip(!env.SUPABASE_SERVICE_ROLE_KEY, 'needs .env.local with Supabase keys');
  const U = env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const admin = createClient(U, env.SUPABASE_SERVICE_ROLE_KEY || 'unset', { auth: { persistSession: false } });
  const email = `qa-listing-${Date.now()}@launchbay.test`;
  let userId = '';
  let ctx: BrowserContext;

  async function signInSeller(browser: Browser) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: 'Qa-test-pass-123', email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    await admin.from('profiles').update({ role: 'seller', full_name: 'QA Seller' }).eq('id', userId);
    // enrol an authenticator through the API so we know the secret
    const tok = await (
      await fetch(`${U}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Qa-test-pass-123' }),
      })
    ).json();
    const call = async (p: string, body: object) =>
      (
        await fetch(U + p, {
          method: 'POST',
          headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json();
    const en = await call('/auth/v1/factors', { factor_type: 'totp', friendly_name: 'qa' });
    const ch = await call(`/auth/v1/factors/${en.id}/challenge`, {});
    await call(`/auth/v1/factors/${en.id}/verify`, { challenge_id: ch.id, code: totp(en.totp.secret) });
    const c = await browser.newContext();
    const page = await c.newPage();
    await page.goto(`${REAL}/login`);
    await page.locator('#a-mail').fill(email);
    await page.locator('#a-pass').fill('Qa-test-pass-123');
    await page.locator('form button[type=submit]').click();
    await page.locator('#mfa-code').fill(totp(en.totp.secret));
    await page.locator('form button[type=submit]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
    return c;
  }
  const post = (fields: Record<string, string>, files: Record<string, { name: string; mimeType: string; buffer: Buffer }[]> = {}) => {
    const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = { ...fields };
    // Playwright sends one file per field name; the form posts one field per screenshot
    for (const [k, list] of Object.entries(files)) multipart[k] = list[0];
    return ctx.request.post(`${REAL}/api/listings`, { multipart });
  };
  const complete = (over: Record<string, string> = {}) => ({
    platform: 'digital',
    intent: 'review',
    name: 'QA Figma kit',
    category: 'Figma kits',
    stack: 'Figma',
    desc: 'A small kit of screens for a dashboard, with variables set up.',
    inc: 'Screens\nIcons',
    code: 'https://drive.example.com/files',
    license: 'I wrote all of it',
    price: '29',
    days: '1 day',
    clean: 'on',
    ...over,
  });
  const shot = { shots: [{ name: 'a.png', mimeType: 'image/png', buffer: PNG }] };

  test.beforeAll(async ({ browser }) => {
    ctx = await signInSeller(browser);
  });
  test.afterAll(async () => {
    const { data: rows } = await admin.from('products').select('id').eq('seller_id', userId);
    for (const r of rows ?? []) {
      const { data: objs } = await admin.storage.from('demos').list(r.id as string);
      for (const o of objs ?? [])
        await admin.storage
          .from('demos')
          .remove([`${r.id}/${o.name}`])
          .catch(() => {});
    }
    await admin.from('products').delete().eq('seller_id', userId);
    await ctx?.close();
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test('submit with almost nothing is refused with a list of what is missing', async () => {
    const r = await post({ platform: 'digital', intent: 'review', name: 'QA thing' });
    expect(r.status()).toBe(422);
    const b = await r.json();
    expect(b.error).toMatch(/^Before you submit for review, add: /);
    expect(b.missing).toEqual(expect.arrayContaining(['a category', 'a description of at least 20 characters', 'at least 1 item under "What is included"', 'at least 1 screenshot']));
  });

  test('the price range is enforced: too cheap, too dear, and a package that would take the total over the top', async () => {
    const base = { category: 'Scripts', stack: 'Python', demo: 'https://video.example.com/x', requirements: 'Python 3.10' };
    expect((await post(complete({ ...base, price: '3' }), shot)).status()).toBe(400);
    expect((await post(complete({ ...base, price: '71' }), shot)).status()).toBe(400);
    const tooMuch = await post(complete({ ...base, price: '60', setupPrice: '30' }), shot);
    expect(tooMuch.status()).toBe(400);
    expect((await tooMuch.json()).error).toMatch(/under \$70/);
  });
  test('a script without system requirements is refused; a plain http documentation link is refused', async () => {
    const noReq = await post(complete({ category: 'Scripts', stack: 'Python', demo: 'https://video.example.com/x' }), shot);
    expect(noReq.status()).toBe(422);
    expect((await noReq.json()).missing).toEqual(['what it needs to run (system requirements)']);
    const badDocs = await post(complete({ category: 'Scripts', stack: 'Python', demo: 'https://video.example.com/x', requirements: 'Python 3.10', docsUrl: 'http://docs.example.com' }), shot);
    expect(badDocs.status()).toBe(422);
  });

  test('a script without a demo link is refused, with a demo link it is accepted', async () => {
    const noDemo = await post(complete({ category: 'Scripts', stack: 'Python', requirements: 'Python 3.10' }), shot);
    expect(noDemo.status()).toBe(422);
    expect((await noDemo.json()).missing).toEqual(['a demo link (a short video, a view-only link or a sample result)']);
    const withDemo = await post(
      complete({ category: 'Scripts', stack: 'Python', demo: 'https://video.example.com/x', requirements: 'Python 3.10', docsUrl: 'https://docs.example.com/x', supportDays: '90', updateDays: '180' }),
      shot,
    );
    expect(withDemo.status()).toBe(200);
    const { data } = await admin.from('products').select('status, demo_url, platform').eq('seller_id', userId).eq('category', 'Scripts').single();
    expect(data).toMatchObject({ status: 'in_review', demo_url: 'https://video.example.com/x', platform: 'digital' });
    const more = await admin.from('products').select('docs_url, requirements, support_days, update_days').eq('seller_id', userId).eq('category', 'Scripts').single();
    expect(more.data).toMatchObject({ docs_url: 'https://docs.example.com/x', requirements: 'Python 3.10', support_days: 90, update_days: 180 });
    const pk = await admin.from('products').select('setup_price_cents, custom_price_cents').eq('seller_id', userId).eq('category', 'Scripts').single();
    expect(pk.data).toEqual({ setup_price_cents: 3000, custom_price_cents: 0 }); // the seller's own price, and one option not offered
  });

  test('no screenshot, no included items: refused. One screenshot is enough', async () => {
    expect((await post(complete())).status()).toBe(422);
    expect((await post(complete({ inc: '' }), shot)).status()).toBe(422);
    expect((await post(complete(), shot)).status()).toBe(200);
  });

  test('drafts are soft: a name is enough, it is saved again in place, opens back up, and is not public', async ({ request }) => {
    const r = await post({ platform: 'digital', intent: 'draft', name: 'My half done kit' });
    expect(r.status()).toBe(200);
    const { slug } = await r.json();
    const { data: row } = await admin.from('products').select('status, seller_id').eq('slug', slug).single();
    expect(row).toMatchObject({ status: 'draft', seller_id: userId });
    expect((await request.get(`${REAL}/product/${slug}`)).status()).toBe(404); // not visible to anyone else
    const again = await post({ platform: 'digital', intent: 'draft', draft: slug, name: 'My half done kit', desc: 'Added later', inc: 'One thing' });
    expect((await again.json()).slug).toBe(slug);
    const open = await ctx.request.get(`${REAL}/api/listings?draft=${slug}`);
    expect(await open.json()).toMatchObject({ name: 'My half done kit', desc: 'Added later', includes: 'One thing', platform: 'digital' });
    expect((await request.get(`${REAL}/api/listings?draft=${slug}`)).status()).toBe(401);
    // submitting from the draft removes the draft
    const sent = await post(complete({ draft: slug }), shot);
    expect(sent.status()).toBe(200);
    const { data: gone } = await admin.from('products').select('id').eq('slug', slug);
    expect(gone).toHaveLength(0);
  });

  test('a sent listing can be edited by its seller: text and prices stay live, a new link or file goes back to review, saved pictures kept; nobody else can edit it', async ({ request }) => {
    // made directly (a new seller may only send a few listings a day), live, with one saved picture
    const slug = `qa-edit-${Date.now()}`;
    const made = await admin.from('products').insert({
      slug,
      seller_id: userId,
      name: 'QA kit to edit',
      category: 'Figma kits',
      description: 'A small kit of screens for a dashboard.',
      includes: ['Screens'],
      price_cents: 2900,
      delivery_days: 1,
      demo_url: 'about:blank',
      code_url: 'https://drive.example.com/files',
      license: 'I wrote all of it',
      status: 'live',
      platform: 'digital',
      app_stack: 'Figma',
      app_shots: ['shots/1.png'],
    });
    expect(made.error).toBeNull();
    const open = await ctx.request.get(`${REAL}/api/listings?edit=${slug}`);
    expect(await open.json()).toMatchObject({ name: 'QA kit to edit', status: 'live', keptShots: 1 });
    expect((await request.get(`${REAL}/api/listings?edit=${slug}`)).status()).toBe(401);
    // no new pictures: the saved one still counts
    // text and price only: saved at once, stays live
    const ed = await post(complete({ edit: slug, name: 'QA kit edited', price: '35' }));
    expect(ed.status(), await ed.text()).toBe(200);
    expect(await ed.json()).toMatchObject({ slug, edited: true, status: 'live' });
    const { data: row } = await admin.from('products').select('name, price_cents, status, app_shots').eq('slug', slug).single();
    expect(row).toMatchObject({ name: 'QA kit edited', price_cents: 3500, status: 'live' });
    expect(row!.app_shots).toHaveLength(1);
    // a new files link: back to review
    const link = await post(complete({ edit: slug, name: 'QA kit edited', price: '35', code: 'https://drive.example.com/other-files' }));
    expect(await link.json()).toMatchObject({ edited: true, status: 'in_review' });
    await admin.from('products').update({ status: 'live' }).eq('slug', slug);
    // new pictures: back to review
    const pics = await post(complete({ edit: slug, name: 'QA kit edited', price: '35', code: 'https://drive.example.com/other-files' }), shot);
    expect(await pics.json()).toMatchObject({ status: 'in_review' });
    // a paused listing stays paused on a text change
    await admin.from('products').update({ status: 'paused' }).eq('slug', slug);
    const paused = await post(complete({ edit: slug, name: 'QA kit renamed', price: '35', code: 'https://drive.example.com/other-files' }));
    expect(await paused.json()).toMatchObject({ status: 'paused' });
    // the kind cannot change, and someone else's listing is not found
    expect((await post(complete({ edit: slug, platform: 'web' }))).status()).toBe(400);
    expect((await post(complete({ edit: 'qa-no-such-listing' }))).status()).toBe(404);
  });

  test('a draft needs at least a name', async () => {
    expect((await post({ platform: 'digital', intent: 'draft', name: 'ab' })).status()).toBe(400);
  });
});
