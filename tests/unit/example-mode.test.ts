import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const allowed = async () => (await import('@/lib/exampleMode')).examplesAllowed();

describe('made-up example listings', () => {
  it('exist only in demo mode (no database) or on the test server', async () => {
    expect(await allowed()).toBe(true); // no database in the unit tests
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.resetModules();
    expect(await allowed()).toBe(false); // a live site with a database: gone, whatever Settings says
    vi.stubEnv('EXAMPLE_ORDERS', '1');
    vi.resetModules();
    expect(await allowed()).toBe(true); // the test server keeps them for its tests
  });
});
