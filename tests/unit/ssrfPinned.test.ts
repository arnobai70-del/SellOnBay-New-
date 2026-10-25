import { describe, expect, it } from 'vitest';
import { isPrivateAddress, resolvePublicDestination } from '@/lib/delivery/ssrf';

describe('SSRF protection for seller-hosted downloads and file scans', () => {
  it('rejects IPv4 private, reserved, link-local and metadata ranges', () => {
    for (const ip of ['127.0.0.1', '10.2.3.4', '100.100.100.100', '169.254.169.254', '172.16.0.1', '192.168.0.1', '192.0.2.1', '198.51.100.4', '203.0.113.2', '198.18.1.1', '240.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it('rejects IPv4-mapped IPv6 in both literal and hexadecimal forms', () => {
    for (const ip of ['::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:8.8.8.8', '::ffff:a9fe:a9fe']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it('rejects IPv6 loopback, local, documentation and tunnel prefixes', () => {
    for (const ip of ['::1', 'fc00::1', 'fe80::1', '2001:db8::1', '2001::1', '2002:a9fe:a9fe::1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });
  it('rejects invalid URL schemes, credential-bearing URLs and non-standard ports', async () => {
    const resolver = async () => [{ address: '93.184.216.34', family: 4 as const }];
    for (const url of ['http://example.com/file', 'https://user:pass@example.com/file', 'https://example.com:8443/file', 'file:///etc/passwd']) {
      await expect(resolvePublicDestination(url, resolver), url).rejects.toThrow('bad_url');
    }
  });
  it('rejects DNS answers when any record is private, even if others are public', async () => {
    const mixed = async () => [
      { address: '93.184.216.34', family: 4 as const },
      { address: '127.0.0.1', family: 4 as const },
    ];
    await expect(resolvePublicDestination('https://seller.example/file', mixed)).rejects.toThrow('private_address');
  });
  it('pins a validated public address without changing the HTTPS URL or hostname', async () => {
    let calls = 0;
    const resolver = async (host: string) => {
      calls++;
      expect(host).toBe('seller.example');
      return [
        { address: '2606:4700:4700::1111', family: 6 as const },
        { address: '93.184.216.34', family: 4 as const },
      ];
    };
    const d = await resolvePublicDestination('https://seller.example/products/file.zip', resolver);
    expect(calls).toBe(1);
    expect(d.address).toEqual({ address: '93.184.216.34', family: 4 });
    expect(d.url.hostname).toBe('seller.example');
  });
  it('refuses untrusted literal private IPv6 destinations before DNS', async () => {
    await expect(resolvePublicDestination('https://[::ffff:7f00:1]/data')).rejects.toThrow('private_address');
  });
});
