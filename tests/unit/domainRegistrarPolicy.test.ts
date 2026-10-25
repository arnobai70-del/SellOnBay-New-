import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDomainProvider } from '@/lib/providers/domain/demo';
import { demoRegistrarAllowed, isLiveRegistrar, mayOfferNewDomain } from '@/lib/providers/domain/policy';
import { registrarLive } from '@/lib/domains';
import { GET } from '@/app/api/domains/route';

const fake = new FakeDomainProvider();
const unconfigured = {
  name: 'unconfigured',
  async search() {
    return [];
  },
  async register() {
    throw new Error('unavailable');
  },
};
const real = {
  name: 'verified-registrar',
  async search() {
    return [];
  },
  async register() {
    return { ref: 'real', expires: '2027-01-01' };
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('truthful registrar availability and billing guardrails', () => {
  it('does not treat demo search or any credential string as proof of a live registrar', () => {
    vi.stubEnv('DOMAIN_API_KEY', 'some-value-that-does-not-connect-a-provider');
    expect(registrarLive()).toBe(false);
    expect(isLiveRegistrar(fake)).toBe(false);
    expect(isLiveRegistrar(unconfigured)).toBe(false);
    expect(isLiveRegistrar(real)).toBe(true);
  });

  it('permits invented availability only in a local or explicitly named demo prototype', () => {
    expect(demoRegistrarAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(demoRegistrarAllowed({ NODE_ENV: 'production', LAUNCHBAY_DEMO: '0' })).toBe(false);
    expect(demoRegistrarAllowed({ NODE_ENV: 'production', LAUNCHBAY_DEMO: '1' })).toBe(true);
    expect(demoRegistrarAllowed({ NODE_ENV: 'test' })).toBe(true);
    expect(mayOfferNewDomain(fake, { NODE_ENV: 'production' })).toBe(false);
    expect(mayOfferNewDomain(fake, { NODE_ENV: 'production', LAUNCHBAY_DEMO: '1' })).toBe(true);
    expect(mayOfferNewDomain(unconfigured, { NODE_ENV: 'production' })).toBe(false);
    expect(mayOfferNewDomain(unconfigured, { NODE_ENV: 'development' })).toBe(false);
    expect(mayOfferNewDomain(real, { NODE_ENV: 'production' })).toBe(true);
  });

  it('production never returns fabricated availability or prices even with a fake API key', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCHBAY_DEMO', '');
    vi.stubEnv('DOMAIN_API_KEY', 'fake-live-looking-key');
    const res = await GET(new Request('https://sellonbay.example/api/domains?name=anotherbakery'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.live).toBe(false);
    expect(body.results).toEqual([]);
    expect(body.error).toMatch(/no registrar is connected/i);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('an intentional demo returns examples marked non-live', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCHBAY_DEMO', '1');
    const res = await GET(new Request('https://sellonbay.example/api/domains?name=anotherbakery'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.live).toBe(false);
    expect(body.results.length).toBeGreaterThan(0);
  });
});
