import { describe, expect, it } from 'vitest';
import { publicOrigin } from '@/lib/publicOrigin';

const site = 'https://sellonbay.com';

describe('the address redirects are built from', () => {
  it("the server's own bind address is replaced by the site address", () => {
    expect(publicOrigin({ host: '0.0.0.0:3000', nextOrigin: 'http://0.0.0.0:3000', siteUrl: site })).toBe(site);
    expect(publicOrigin({ host: '[::]:3000', nextOrigin: 'http://[::]:3000', siteUrl: site })).toBe(site);
    expect(publicOrigin({ host: '10.1.2.3:3000', nextOrigin: 'http://10.1.2.3:3000', siteUrl: site })).toBe(site);
    expect(publicOrigin({ host: null, nextOrigin: 'http://x', siteUrl: site })).toBe(site);
  });
  it("the proxy's forwarded name wins over the internal Host header", () => {
    expect(publicOrigin({ host: '0.0.0.0:3000', forwardedHost: 'sellonbay.com', forwardedProto: 'https', nextOrigin: 'http://0.0.0.0:3000', siteUrl: site })).toBe(site);
    expect(publicOrigin({ host: '0.0.0.0:3000', forwardedHost: 'www.sellonbay.com', forwardedProto: 'https', nextOrigin: 'http://0.0.0.0:3000', siteUrl: site })).toBe('https://www.sellonbay.com');
  });
  it('a public name is https unless it is this computer', () => {
    expect(publicOrigin({ host: 'sellonbay.com', nextOrigin: 'http://sellonbay.com', siteUrl: site })).toBe('https://sellonbay.com');
    expect(publicOrigin({ host: 'localhost:3005', nextOrigin: 'http://localhost:3005', siteUrl: site })).toBe('http://localhost:3005');
  });
});
