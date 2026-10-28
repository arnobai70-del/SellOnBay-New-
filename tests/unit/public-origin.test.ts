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
  it('a production build never builds a redirect to a name the visitor sent', () => {
    const p = { nextOrigin: 'http://0.0.0.0:3000', siteUrl: site, production: true };
    expect(publicOrigin({ ...p, host: 'sellonbay.com', forwardedHost: 'evil.example' })).toBe(site);
    expect(publicOrigin({ ...p, host: 'evil.example' })).toBe(site);
    expect(publicOrigin({ ...p, host: 'sellonbay.com.evil.example' })).toBe(site);
    expect(publicOrigin({ ...p, forwardedHost: 'www.sellonbay.com', forwardedProto: 'http' })).toBe('https://www.sellonbay.com');
    expect(publicOrigin({ ...p, forwardedHost: 'sellonbay.com', forwardedProto: 'http' })).toBe(site);
    expect(publicOrigin({ ...p, host: 'localhost:3005', nextOrigin: 'http://localhost:3005' })).toBe('http://localhost:3005');
    expect(publicOrigin({ ...p, siteUrl: 'https://staging.sellonbay.com', host: 'staging.sellonbay.com' })).toBe('https://staging.sellonbay.com');
    // Development keeps any public name (a quick tunnel to a phone).
    expect(publicOrigin({ host: 'abc.trycloudflare.com', nextOrigin: 'http://localhost:3000', siteUrl: 'http://localhost:3000', production: false })).toBe('https://abc.trycloudflare.com');
  });
});
