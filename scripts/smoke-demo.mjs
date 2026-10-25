import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 3157;
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production', LAUNCHBAY_DEMO: '1', NEXT_PUBLIC_SITE_URL: 'https://example.com' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let recentErrors = '';
child.stderr.on('data', (buf) => { recentErrors = (recentErrors + buf.toString('utf8')).slice(-2000); });
let exited = false;
child.on('exit', () => { exited = true; });

async function response(path) {
  return fetch(origin + path, { signal: AbortSignal.timeout(4000), redirect: 'manual' });
}
async function waitUntilReady() {
  const until = Date.now() + 55_000;
  while (Date.now() < until && !exited) {
    try {
      const res = await response('/robots.txt');
      if (res.ok) { await res.body?.cancel(); return; }
    } catch { /* not yet listening */ }
    await sleep(450);
  }
  throw new Error('Demo Next.js server did not become ready. ' + recentErrors);
}
try {
  await waitUntilReady();
  for (const page of ['/', '/browse', '/login', '/robots.txt', '/api/health']) {
    const res = await response(page);
    if (res.status !== 200) throw new Error(`Demo smoke ${page} returned ${res.status}`);
    if (page === '/') {
      if (!res.headers.get('content-security-policy')?.includes("default-src 'self'"))
        throw new Error('Demo root missing security policy');
      if (res.headers.get('x-content-type-options') !== 'nosniff')
        throw new Error('Demo root missing nosniff header');
      if (res.headers.has('x-powered-by')) throw new Error('Unexpected powered-by header');
    }
    if (page === '/api/health') {
      if ((await res.json()).ok !== true) throw new Error('Demo health check did not answer ok');
    } else if (page !== '/robots.txt') {
      if (!(await res.text()).includes('<html'))
        throw new Error(`Demo smoke ${page} did not render HTML`);
    } else {
      await res.body?.cancel();
    }
    console.log(`Demo smoke passed: GET ${page}`);
  }
  // A route that sets no cache header of its own must still come back uncacheable.
  const api = await response('/api/demo/orders/smoke-missing');
  await api.body?.cancel();
  if (!api.headers.get('cache-control')?.includes('no-store')) throw new Error('API answers must carry Cache-Control: no-store');
  console.log('Demo smoke passed: API answers are not cached');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)]);
  if (!exited) child.kill('SIGKILL');
}
