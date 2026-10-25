import { describe, expect, it } from 'vitest';
import { clientAddress } from '@/lib/clientIp';

const h = (o: Record<string, string>) => new Headers(o);

describe('clientAddress', () => {
  it('counts from the right when the number of proxies is set, so a written left-most value is ignored', () => {
    expect(clientAddress(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }), { TRUSTED_PROXY_HOPS: '1' })).toBe('203.0.113.9');
    expect(clientAddress(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.0.0.1' }), { TRUSTED_PROXY_HOPS: '2' })).toBe('203.0.113.9');
  });
  it('keeps the left-most value when nothing is set (the behaviour before)', () => {
    expect(clientAddress(h({ 'x-forwarded-for': '203.0.113.45, 10.0.0.1' }), {})).toBe('203.0.113.45');
  });
  it('uses a named header only when told to', () => {
    const req = h({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '6.6.6.6' });
    expect(clientAddress(req, {})).toBe('6.6.6.6');
    expect(clientAddress(req, { CLIENT_IP_HEADER: 'cf-connecting-ip' })).toBe('198.51.100.7');
  });
  it('falls back to x-real-ip, then unknown', () => {
    expect(clientAddress(h({ 'x-real-ip': '192.0.2.1' }), {})).toBe('192.0.2.1');
    expect(clientAddress(h({}), {})).toBe('unknown');
  });
});
