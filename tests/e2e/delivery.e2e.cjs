/*
 * End-to-end check of file delivery. Run it with the app built (npm run build) and two servers up:
 *   LAUNCHBAY_DEMO=1 npx next start -p 3002     (demo mode, no database)
 *   EXAMPLE_ORDERS=1 npx next start -p 3000      (real Supabase from .env.local)
 * Then:  node tests/e2e/delivery.e2e.cjs
 * It starts a third short-lived server on port 3003 to prove that an expired link fails.
 * Test downloads are written to download_events, which is append-only on purpose, so a few rows with user agent "sellonbay-e2e" stay behind.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const puppeteer = require('puppeteer-core');
const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DEMO = 'http://localhost:3002',
  REAL = 'http://localhost:3000',
  SHORT = 'http://localhost:3003';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bugs = [];
let pass = 0;
const ok = (c, m) => (c ? pass++ : bugs.push('FAIL ' + m));
const post = async (base, p, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };

async function demoFlow(base, label) {
  const o = await post(base, '/api/demo/orders', { kind: 'site', productId: 'n8n-leads', pkg: 'asis' });
  ok(o.s === 200, label + ': order created');
  const before = await post(base, `/api/demo/orders/${o.j.id}/download`, {});
  ok(before.s === 403, label + ': not funded gives 403 (' + before.s + ')');
  ok((await post(base, `/api/demo/orders/${o.j.id}/pay`, { card: CARD })).s === 200, label + ': order paid');
  const dl = await post(base, `/api/demo/orders/${o.j.id}/download`, {});
  ok(dl.s === 200 && /^\/api\/download\/.+\..+$/.test(dl.j.url) && /^LB(-[A-Z2-9]{4}){4}$/.test(dl.j.licenseKey), label + ': funded gives a signed link and a licence key');
  const again = await post(base, `/api/demo/orders/${o.j.id}/download`, {});
  ok(again.j.licenseKey === dl.j.licenseKey && again.j.url !== dl.j.url, label + ': same licence key, new link each time');
  return { id: o.j.id, dl };
}

(async () => {
  // ---- demo mode ----
  const { id, dl } = await demoFlow(DEMO, 'demo');
  const file = await fetch(DEMO + dl.j.url);
  const text = await file.text();
  ok(file.status === 200 && text.includes(dl.j.licenseKey), 'demo: link downloads the dummy file with the licence key inside');
  ok(
    /attachment/.test(file.headers.get('content-disposition') ?? '') && file.headers.get('content-type') === 'application/octet-stream' && /no-store/.test(file.headers.get('cache-control') ?? ''),
    'demo: served as a download, never cached',
  );
  const bad = dl.j.url.slice(0, -3) + (dl.j.url.endsWith('aaa') ? 'bbb' : 'aaa');
  ok((await fetch(DEMO + bad)).status === 403, 'demo: a changed link is refused');
  ok((await fetch(DEMO + '/api/download/not-a-token')).status === 403, 'demo: garbage is refused');
  ok((await post(DEMO, '/api/demo/orders/00000000-0000-4000-8000-000000000000/download', {})).s === 404, 'demo: unknown order is 404');
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await post(DEMO, `/api/demo/orders/${id}/download`, {})).s;
  ok(last === 429, 'demo: asking for links too often is stopped (' + last + ')');

  // ---- expired link (a short-lived server with a 2 second link life) ----
  const child = spawn('npx', ['next', 'start', '-p', '3003'], { cwd: ROOT, shell: true, env: { ...process.env, LAUNCHBAY_DEMO: '1', DELIVERY_TTL_SECONDS: '2' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(SHORT + '/')).status) break;
      } catch {
        await sleep(500);
      }
    }
    const s = await demoFlow(SHORT, 'short');
    ok((await fetch(SHORT + s.dl.j.url)).status === 200, 'short: link works while fresh');
    await sleep(3200);
    const late = await fetch(SHORT + s.dl.j.url);
    ok(late.status === 410, 'short: expired link fails with 410 (' + late.status + ')');
    const fresh = await post(SHORT, `/api/demo/orders/${s.id}/download`, {});
    ok(fresh.s === 200 && (await fetch(SHORT + fresh.j.url)).status === 200, 'short: a new link works again');
  } finally {
    child.kill();
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  }

  // ---- real database ----
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ids = [];
  const made = { products: [], orders: [] };
  const mk = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: 'Qa-test-pass-123', email_confirm: true });
    if (error) throw error;
    ids.push(data.user.id);
    return data.user.id;
  };
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] });
  const signIn = async (email) => {
    const ctx = await browser.createBrowserContext();
    const pg = await ctx.newPage();
    await pg.goto(REAL + '/login', { waitUntil: 'networkidle2' });
    await pg.type('#a-mail', email);
    await pg.type('#a-pass', 'Qa-test-pass-123');
    await Promise.all([pg.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), pg.click('form button[type=submit]')]);
    await sleep(1500);
    return pg;
  };
  const call = (pg, p) =>
    pg.evaluate(async (p) => {
      const r = await fetch(p);
      return {
        s: r.status,
        j: await r
          .clone()
          .json()
          .catch(() => ({})),
        len: (await r.arrayBuffer()).byteLength,
      };
    }, p);
  try {
    const sellerId = await mk('qa-del-seller@launchbay.test'),
      buyerId = await mk('qa-del-buyer@launchbay.test');
    await mk('qa-del-other@launchbay.test');
    const product = async (slug, code_url) => {
      const { data, error } = await admin
        .from('products')
        .insert({
          slug,
          seller_id: sellerId,
          name: 'QA Script',
          category: 'Scripts',
          description: 'x'.repeat(40),
          price_cents: 2900,
          delivery_days: 1,
          demo_url: 'about:blank',
          code_url,
          license: 'mine',
          status: 'live',
          platform: 'digital',
          app_stack: 'Python',
        })
        .select('id')
        .single();
      if (error) throw error;
      made.products.push(data.id);
      return data.id;
    };
    const order = async (product_id) => {
      const { data, error } = await admin.from('orders').insert({ product_id, buyer_id: buyerId, seller_id: sellerId, price_cents: 2900, fee_cents: 435 }).select('id').single();
      if (error) throw error;
      made.orders.push(data.id);
      return data.id;
    };
    const pid = await product('qa-del-' + Date.now(), 'https://example.com/');
    const oid = await order(pid);
    const buyer = await signIn('qa-del-buyer@launchbay.test'),
      other = await signIn('qa-del-other@launchbay.test');

    let r = await call(buyer, `/api/orders/${oid}/source?json=1`);
    ok(r.s === 403, 'real: not funded gives 403 (' + r.s + ')');
    await admin.from('orders').update({ status: 'funded' }).eq('id', oid);
    r = await call(buyer, `/api/orders/${oid}/source?json=1`);
    ok(r.s === 200 && /^\/api\/download\/.+/.test(r.j.url) && /^LB(-[A-Z2-9]{4}){4}$/.test(r.j.licenseKey), 'real: funded (in escrow, not yet accepted) gives a signed link and a licence key');
    const key = r.j.licenseKey;
    const url = r.j.url;
    const { data: lic } = await admin.from('licenses').select('key').eq('order_id', oid).single();
    ok(lic?.key === key, 'real: the licence key is stored');
    r = await call(buyer, `/api/orders/${oid}/source?json=1`);
    ok(r.j.licenseKey === key && r.j.url !== url, 'real: a new link keeps the same licence key');
    ok((await call(other, `/api/orders/${oid}/source?json=1`)).s === 404, 'real: another person cannot ask for this order');

    const got = await buyer.evaluate(async (u) => {
      const r = await fetch(u);
      const b = await r.arrayBuffer();
      const h = await crypto.subtle.digest('SHA-256', b);
      return {
        s: r.status,
        bytes: b.byteLength,
        hash: [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join(''),
        type: r.headers.get('content-type'),
        cd: r.headers.get('content-disposition'),
      };
    }, url);
    ok(
      got.s === 200 && got.bytes > 100 && got.type === 'application/octet-stream' && /attachment/.test(got.cd),
      'real: the link serves the seller file as a download (' + got.s + ', ' + got.bytes + ' bytes)',
    );
    await sleep(800);
    const { data: ev } = await admin.from('download_events').select('*').eq('order_id', oid);
    ok(
      ev?.length === 1 && ev[0].user_id === buyerId && ev[0].file_hash === got.hash && ev[0].bytes === got.bytes && ev[0].kind === 'real' && !!ev[0].ip,
      'real: the download is logged with user, time, IP and file hash',
    );
    const upd = await admin.from('download_events').update({ bytes: 1 }).eq('order_id', oid);
    ok(!!upd.error && /append-only|permission denied/.test(upd.error.message), 'real: the log cannot be changed (' + upd.error?.message + ')');
    const del = await admin.from('download_events').delete().eq('order_id', oid);
    ok(!!del.error && /append-only|permission denied/.test(del.error.message), 'real: the log cannot be deleted (' + del.error?.message + ')');
    ok((await other.evaluate(async (u) => (await fetch(u)).status, url)) === 403, 'real: someone else with the link is refused');
    ok((await fetch(REAL + url)).status === 403, 'real: signed out with the link is refused');

    for (let i = 0; i < 4; i++) await call(buyer, `/api/orders/${oid}/source?json=1`);
    ok((await call(buyer, `/api/orders/${oid}/source?json=1`)).s === 429, 'real: more than 5 link requests an hour are stopped');

    await admin.from('orders').update({ status: 'refunded' }).eq('id', oid);
    ok((await buyer.evaluate(async (u) => (await fetch(u)).status, url)) === 403, 'real: after a refund an old link stops working');
    await admin.from('orders').update({ status: 'accepted' }).eq('id', oid);
    ok((await buyer.evaluate(async (u) => (await fetch(u)).status, url)) === 200, 'real: and after accept it still works');

    const pid2 = await product('qa-del2-' + Date.now(), 'https://localhost/secret');
    const oid2 = await order(pid2);
    await admin.from('orders').update({ status: 'funded' }).eq('id', oid2);
    const l2 = await call(buyer, `/api/orders/${oid2}/source?json=1`);
    ok((await buyer.evaluate(async (u) => (await fetch(u)).status, l2.j.url)) === 502, 'real: a seller link that points at our own network is not fetched (SSRF guard)');
  } catch (e) {
    bugs.push('CRASH ' + e.message);
  } finally {
    await browser.close();
    await admin.from('licenses').delete().in('order_id', made.orders);
    await admin.from('order_events').delete().in('order_id', made.orders);
    await admin.from('orders').delete().in('id', made.orders);
    await admin.from('products').delete().in('id', made.products);
    for (const u of ids) await admin.auth.admin.deleteUser(u);
  }
  console.log(bugs.length ? bugs.join('\n') : 'NO BUGS', 'passed', pass);
  process.exit(bugs.length ? 1 : 0);
})();
