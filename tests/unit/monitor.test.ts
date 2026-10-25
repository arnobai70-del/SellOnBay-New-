import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorReport, mayPost, redact, reportError, resetMonitorForTests } from '@/lib/monitor';

const req = { path: '/orders/abc?token=secret', method: 'GET', headers: { cookie: 'sb=1' } };
const ctx = { routePath: '/(site)/orders/[id]', routeType: 'render' };

describe('server error reports', () => {
  beforeEach(() => resetMonitorForTests());
  afterEach(() => vi.unstubAllEnvs());

  it('keeps no personal data, keys, query string or headers', () => {
    expect(redact('mail ana@example.com, key re_abcdefghijkl1234, id 123456789')).toBe('mail [email], key [key], id [number]');
    const r = errorReport(Object.assign(new Error('Could not load ana@example.com'), { digest: '42' }), req, ctx, 0);
    expect(r).toEqual({
      event: 'request_error',
      at: '1970-01-01T00:00:00.000Z',
      message: 'Error: Could not load [email]',
      digest: '42',
      method: 'GET',
      path: '/orders/abc',
      route: '/(site)/orders/[id]',
      kind: 'render',
    });
    expect(JSON.stringify(r)).not.toMatch(/cookie|token=|secret/);
  });

  it('posts the same error at most once a minute, and 30 errors a minute in all', () => {
    const r = errorReport(new Error('boom'), req, ctx);
    expect(mayPost(r, 0)).toBe(true);
    expect(mayPost(r, 59_999)).toBe(false);
    expect(mayPost(r, 60_000)).toBe(true);
    resetMonitorForTests();
    const sent = Array.from({ length: 40 }, (_, i) => mayPost(errorReport(new Error(`e${i}`), req, ctx), 1_000)).filter(Boolean);
    expect(sent).toHaveLength(30);
  });

  it('logs always, posts only with an https webhook, and never throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const posted: string[] = [];
    const f = (async (_u: string, init: RequestInit) => (posted.push(String(init.body)), new Response('ok'))) as unknown as typeof fetch;
    await reportError(new Error('one'), req, ctx, f);
    expect(posted).toHaveLength(0);
    vi.stubEnv('ERROR_WEBHOOK_URL', 'http://insecure.example');
    await reportError(new Error('two'), req, ctx, f);
    expect(posted).toHaveLength(0);
    vi.stubEnv('ERROR_WEBHOOK_URL', 'https://hooks.example.com/x');
    await reportError(new Error('three'), req, ctx, f);
    expect(JSON.parse(posted[0])).toMatchObject({ text: expect.stringContaining('GET /orders/abc: Error: three'), path: '/orders/abc' });
    await expect(reportError(new Error('four'), req, ctx, (async () => Promise.reject(new Error('down'))) as typeof fetch)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(4);
    log.mockRestore();
  });
});
