import { describe, expect, it } from 'vitest';
import { crossSiteWrite } from '@/lib/sameOrigin';

const hosts = ['sellonbay.com', null, 'https://sellonbay.com'];

describe('crossSiteWrite', () => {
  it('lets our own pages write', () => {
    expect(crossSiteWrite('POST', '/api/orders/1/messages', 'https://sellonbay.com', hosts)).toBe(false);
    expect(crossSiteWrite('POST', '/api/orders/1/messages', 'http://localhost:3000', ['localhost:3000'])).toBe(false);
  });
  it('refuses another site and a sandboxed seller demo', () => {
    expect(crossSiteWrite('POST', '/api/orders/1/messages', 'https://evil.example', hosts)).toBe(true);
    expect(crossSiteWrite('DELETE', '/api/listings', 'https://sellonbay.com.evil.example', hosts)).toBe(true);
    expect(crossSiteWrite('POST', '/api/orders/1/accept', 'null', hosts)).toBe(true);
    expect(crossSiteWrite('PATCH', '/api/account', 'not a url', hosts)).toBe(true);
  });
  it('leaves reads, non-API paths and callers without a browser alone', () => {
    expect(crossSiteWrite('GET', '/api/orders/1', 'https://evil.example', hosts)).toBe(false);
    expect(crossSiteWrite('POST', '/login', 'https://evil.example', hosts)).toBe(false);
    expect(crossSiteWrite('POST', '/api/webhooks/payment', null, hosts)).toBe(false);
  });
  it('treats www and the bare domain as one site, and trusts the site address when a proxy rewrites Host', () => {
    expect(crossSiteWrite('POST', '/api/hire', 'https://www.sellonbay.com', ['sellonbay.com'])).toBe(false);
    expect(crossSiteWrite('POST', '/api/hire', 'https://sellonbay.com', ['127.0.0.1:3000', null, 'https://sellonbay.com'])).toBe(false);
  });
  it('accepts the forwarded host of a proxy in front of the app', () => {
    expect(crossSiteWrite('POST', '/api/hire', 'https://www.sellonbay.com', ['127.0.0.1:3000', 'www.sellonbay.com, proxy.internal'])).toBe(false);
  });
});
