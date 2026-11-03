import { describe, expect, it } from 'vitest';
import { overallOf, toneOf } from '@/lib/admin/system';
import { errorFingerprint, errorReport } from '@/lib/monitor';

describe('server and system page: status rules (lib/admin/system.ts)', () => {
  it('a figure is healthy below the warning line, amber from it and pink from the bad line; unknown is not set up', () => {
    expect(toneOf(100, 400, 1500)).toBe('ok');
    expect(toneOf(400, 400, 1500)).toBe('warn');
    expect(toneOf(1500, 400, 1500)).toBe('bad');
    expect(toneOf(null, 400, 1500)).toBe('off');
  });
  it('the overall chip is the worst service, and a service that is not set up does not count against it', () => {
    expect(overallOf([{ tone: 'ok' }, { tone: 'off' }])).toBe('ok');
    expect(overallOf([{ tone: 'ok' }, { tone: 'warn' }])).toBe('warn');
    expect(overallOf([{ tone: 'warn' }, { tone: 'bad' }, { tone: 'off' }])).toBe('bad');
  });
});

describe('error kinds (lib/monitor.ts errorFingerprint)', () => {
  const report = (message: string, route = '/api/x') => errorReport(new Error(message), { path: '/api/x?token=abc', method: 'GET' }, { routePath: route });
  it('one kind per route, status and first line, the same every time', () => {
    const a = errorFingerprint(report('Boom\nat line 3'));
    expect(a).toMatch(/^e[0-9a-f]{16}$/);
    expect(errorFingerprint(report('Boom\nat line 9'))).toBe(a);
    expect(errorFingerprint(report('Other'))).not.toBe(a);
    expect(errorFingerprint(report('Boom'), 404)).not.toBe(a);
    expect(errorFingerprint(report('Boom', '/api/y'))).not.toBe(a);
  });
  it('what is counted is already blanked: no e-mail address, key or query string reaches the store', () => {
    const r = report('Failed for someone@example.com with key sk_live_abcdefghijklmnop');
    expect(r.message).not.toMatch(/someone@example\.com|sk_live_abcdefghijklmnop/);
    expect(r.path).toBe('/api/x');
  });
});
