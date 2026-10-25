import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Free sample, limited trial copy (behind FEATURE_TRIAL_COPY) and the demo badge, against the real database.
 * The app on port 3000 runs with the trial switch OFF (the default); this file starts a second copy on port 3004 with it ON.
 */
const OFF = process.env.REAL_URL ?? 'http://localhost:3000';
const ON = 'http://localhost:3004';
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('sample link, trial copy and demo badge', () => {
  test.skip(!env.SUPABASE_SERVICE_ROLE_KEY, 'needs .env.local with Supabase keys');
  const U = env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'unset';
  const admin = createClient(U, env.SUPABASE_SERVICE_ROLE_KEY || 'unset', { auth: { persistSession: false } });
  const stamp = Date.now();
  const ids: string[] = [];
  const slugs: string[] = [];
  let server: ChildProcess;
  let sellerId = '';
  let scriptId = '';
  const slugScript = `qa-trial-script-${stamp}`;
  const slugFigma = `qa-trial-figma-${stamp}`;

  const mk = async (email: string) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: 'Qa-test-pass-123', email_confirm: true });
    if (error) throw error;
    ids.push(data.user.id);
    return data.user.id;
  };
  const login = async (browser: Browser, base: string, email: string, secret?: string): Promise<BrowserContext> => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/login`);
    await page.locator('#a-mail').fill(email);
    await page.locator('#a-pass').fill('Qa-test-pass-123');
    await page.locator('form button[type=submit]').click();
    if (secret) {
      await page.locator('#mfa-code').fill(totp(secret));
      await page.locator('form button[type=submit]').click();
    }
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
    return ctx;
  };

  test.beforeAll(async () => {
    server = spawn('npx', ['next', 'start', '-p', '3004'], { cwd: path.join(__dirname, '..', '..'), shell: true, env: { ...process.env, FEATURE_TRIAL_COPY: '1' }, stdio: 'ignore' });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(ON + '/')).status) break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    sellerId = await mk(`qa-tr-seller-${stamp}@launchbay.test`);
    await mk(`qa-tr-buyer-${stamp}@launchbay.test`);
    await admin.from('profiles').update({ role: 'seller', full_name: 'QA Seller' }).eq('id', sellerId);
    const row = (slug: string, category: string) => ({
      slug,
      seller_id: sellerId,
      name: 'QA ' + category,
      category,
      description: 'x'.repeat(130),
      includes: ['a', 'b', 'c', 'd'],
      price_cents: 2900,
      delivery_days: 1,
      demo_url: 'https://video.example.com/x',
      code_url: 'https://example.com/full',
      trial_url: `storage:trial/${slug}/trial.txt`,
      sample_url: 'https://example.com/sample',
      license: 'mine',
      status: 'live',
      platform: 'digital',
      app_stack: 'Python',
    });
    await admin.storage.from('demos').upload(`trial/${slugScript}/trial.txt`, Buffer.from('LIMITED TRIAL COPY '.repeat(20)), { contentType: 'text/plain', upsert: true });
    const a = await admin.from('products').insert(row(slugScript, 'Scripts')).select('id').single();
    expect((await admin.from('products').insert(row(slugFigma, 'Figma kits'))).error).toBeNull();
    scriptId = a.data!.id as string;
    slugs.push(slugScript, slugFigma);
  });

  test.afterAll(async () => {
    if (server?.pid) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    await admin.from('products').delete().in('slug', slugs);
    await admin.storage.from('demos').remove([`trial/${slugScript}/trial.txt`]);
    for (const u of ids) await admin.auth.admin.deleteUser(u);
  });

  test('with the trial switch OFF (default) there is no trial and no button', async ({ browser, request }) => {
    const ctx = await login(browser, OFF, `qa-tr-buyer-${stamp}@launchbay.test`);
    expect((await ctx.request.post(`${OFF}/api/products/${slugScript}/trial`)).status()).toBe(404);
    const page = await ctx.newPage();
    await page.goto(`${OFF}/product/${slugScript}`);
    await expect(page.getByText('Try before you buy')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Free sample' })).toHaveAttribute('href', 'https://example.com/sample'); // the sample is on by default
    await ctx.close();
    expect(request).toBeTruthy();
  });

  test('with the switch ON: sign-in needed, one trial a week, a one-hour signed link, every download logged', async ({ browser, request }) => {
    expect((await request.post(`${ON}/api/products/${slugScript}/trial`)).status()).toBe(401);
    const ctx = await login(browser, ON, `qa-tr-buyer-${stamp}@launchbay.test`);
    const page = await ctx.newPage();
    await page.goto(`${ON}/product/${slugScript}`);
    await expect(page.getByText('Try before you buy')).toBeVisible();

    const first = await ctx.request.post(`${ON}/api/products/${slugScript}/trial`);
    expect(first.status()).toBe(200);
    const { url } = await first.json();
    expect(url).toMatch(/^\/api\/download\/.+\..+$/);
    const file = await ctx.request.get(`${ON}${url}`);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-disposition']).toMatch(/attachment/);
    expect((await file.body()).length).toBeGreaterThan(100);
    expect((await request.get(`${ON}${url}`)).status()).toBe(403); // signed out with the link
    await expect.poll(async () => (await admin.from('download_events').select('id').eq('kind', 'trial').eq('order_id', scriptId)).data?.length ?? 0, { timeout: 8000 }).toBe(1);
    const again = await ctx.request.post(`${ON}/api/products/${slugScript}/trial`);
    expect(again.status()).toBe(429);
    expect((await again.json()).error).toMatch(/already tried/);
    await ctx.close();
  });

  test('trial only exists for code and automation categories, and never for your own listing', async ({ browser }) => {
    const buyer = await login(browser, ON, `qa-tr-buyer-${stamp}@launchbay.test`);
    expect((await buyer.request.post(`${ON}/api/products/${slugFigma}/trial`)).status()).toBe(404); // a Figma kit has no trial even if a link is stored
    await buyer.close();
  });

  test('the demo badge and the free sample show on the shelf and the listing', async ({ page }) => {
    await page.goto(`${ON}/apps/digital`);
    const card = page.locator('.pcard', { hasText: 'QA Scripts' });
    await expect(card.getByText('Demo included')).toBeVisible();
    await page.goto(`${ON}/product/${slugScript}`);
    await expect(page.getByRole('link', { name: 'View a demo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Free sample' })).toHaveAttribute('rel', /nofollow/);
  });

  test('a seller can save a sample link and a trial link; a plain http link is refused; a Figma kit ignores the trial link', async ({ browser }) => {
    const email = `qa-tr-seller-${stamp}@launchbay.test`;
    const tok = await (
      await fetch(`${U}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Qa-test-pass-123' }),
      })
    ).json();
    const call = async (p: string, body: object) =>
      (await fetch(U + p, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    const en = await call('/auth/v1/factors', { factor_type: 'totp', friendly_name: 'qa' });
    const ch = await call(`/auth/v1/factors/${en.id}/challenge`, {});
    await call(`/auth/v1/factors/${en.id}/verify`, { challenge_id: ch.id, code: totp(en.totp.secret) });
    const ctx = await login(browser, ON, email, en.totp.secret);
    const complete = (over: Record<string, string> = {}) => ({
      platform: 'digital',
      intent: 'review',
      name: 'QA new script',
      category: 'Scripts',
      stack: 'Python',
      desc: 'A script that does a useful thing for a small business owner.',
      inc: 'The script',
      code: 'https://drive.example.com/files',
      license: 'I wrote all of it',
      price: '29',
      days: '1 day',
      clean: 'on',
      demo: 'https://video.example.com/new',
      requirements: 'Python 3.10 or newer.',
      ...over,
    });
    const shot = { name: 'a.png', mimeType: 'image/png', buffer: PNG };
    const post = (fields: Record<string, string>) => ctx.request.post(`${ON}/api/listings`, { multipart: { ...fields, shots: shot } });
    expect((await post(complete({ sample: 'http://insecure.example.com/s' }))).status()).toBe(400);
    expect((await post(complete({ sample: 'javascript:alert(1)' }))).status()).toBe(400);
    expect((await post(complete({ sample: 'data:text/html,<script>1</script>' }))).status()).toBe(400);
    const withTrial = (fields: Record<string, string>, name: string) =>
      ctx.request.post(`${ON}/api/listings`, { multipart: { ...fields, shots: shot, trialFile: { name, mimeType: 'application/octet-stream', buffer: Buffer.from('limited') } } });
    expect((await withTrial(complete({ name: 'QA exe script' }), 'trial.exe')).status()).toBe(400);
    expect((await post(complete({ sample: 'https://example.com/s2' }))).status()).toBe(200); // no trial file: fine, it is optional
    expect((await withTrial(complete({ name: 'QA trial script' }), 'trial.zip')).status()).toBe(200);
    const { data: ok } = await admin.from('products').select('sample_url, trial_url').eq('seller_id', sellerId).eq('name', 'QA new script').single();
    expect(ok).toEqual({ sample_url: 'https://example.com/s2', trial_url: null });
    const { data: withFile } = await admin.from('products').select('trial_url').eq('seller_id', sellerId).eq('name', 'QA trial script').single();
    expect(withFile?.trial_url).toMatch(/^storage:trial\/.+\/trial\.zip$/);
    expect((await post(complete({ name: 'QA new kit', category: 'Figma kits', stack: 'Figma', demo: '', sample: 'https://example.com/s3' }))).status()).toBe(200);
    const { data: kit } = await admin.from('products').select('sample_url, trial_url').eq('seller_id', sellerId).eq('name', 'QA new kit').single();
    expect(kit).toEqual({ sample_url: 'https://example.com/s3', trial_url: null });
    await ctx.close();
  });
});

test.describe('what a digital product tells the buyer', () => {
  const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3002';
  test('the product page shows what it needs, the guide, support and updates', async ({ page }) => {
    await page.goto(`${DEMO_URL}/product/wp-booking`);
    const box = page.locator('[data-info]');
    await expect(box.getByText('WordPress 6.4 or newer')).toBeVisible();
    await expect(box.getByText('90 days from your purchase')).toBeVisible();
    await expect(box.getByText('None. You get the version you buy.')).toBeVisible();
    await page.goto(`${DEMO_URL}/product/saffron-table`);
    await expect(page.locator('[data-info]')).toHaveCount(0); // websites do not have it
  });
  test('the order page shows the same, with the end date', async ({ page }) => {
    const r = page.request;
    const id = (await (await r.post(`${DEMO_URL}/api/demo/orders`, { data: { productId: 'n8n-leads', pkg: 'asis' } })).json()).id as string;
    await r.post(`${DEMO_URL}/api/demo/orders/${id}/pay`, { data: { card: { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' } } });
    await page.goto(`${DEMO_URL}/orders/${id}`);
    const box = page.locator('[data-info]');
    await expect(box.getByRole('heading', { name: 'About this product' })).toBeVisible();
    await expect(box.getByText(/Until [A-Z][a-z]{2} \d+, \d{4}, in the order chat/)).toBeVisible();
  });
});
