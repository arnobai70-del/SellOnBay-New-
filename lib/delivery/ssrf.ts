import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

/*
 * Seller URLs are untrusted. Resolve once, validate *every* DNS answer, then
 * connect to the selected IP (not to the hostname again). TLS still verifies
 * the original hostname through SNI and the original Host header.
 */
type PublicAddress = { address: string; family: 4 | 6 };
type Resolver = (host: string) => Promise<PublicAddress[]>;

const defaultResolver: Resolver = async (host) => {
  const records = await lookup(host, { all: true });
  return records.map((record) => ({ address: record.address, family: record.family as 4 | 6 }));
};

function ipv6Groups(ip: string): number[] {
  // isIP() validates input before calling this parser. Reject anything
  // outside the global unicast range, including mapped and compatible IPv4.
  const [left, right] = ip.toLowerCase().split('::');
  const before = left ? left.split(':').map((x) => parseInt(x, 16)) : [];
  const after = right ? right.split(':').map((x) => parseInt(x, 16)) : [];
  return [...before, ...Array(8 - before.length - after.length).fill(0), ...after];
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (v === 6) {
    if (ip.includes('.')) return true; // ::ffff:127.0.0.1 etc.
    const g = ipv6Groups(ip);
    // Only global-unicast 2000::/3 may be used. Disallow transitional,
    // documentation and tunneled prefixes, including encoded private IPv4.
    if (g[0] < 0x2000 || g[0] > 0x3fff) return true;
    if (g[0] === 0x2002) return true; // 6to4 IPv4 tunnelling
    if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true; // Teredo / documentation
    return false;
  }
  return true;
}

export async function resolvePublicDestination(raw: string, resolver: Resolver = defaultResolver): Promise<{ url: URL; address: PublicAddress }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('bad_url');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('bad_url');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('private_address');
    return { url, address: { address: host, family: isIP(host) as 4 | 6 } };
  }
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('private_address');
  }
  const records = await resolver(host);
  if (!records.length || records.some((r) => r.family !== isIP(r.address) || isPrivateAddress(r.address))) throw new Error('private_address');
  const address = records.find((r) => r.family === 4) ?? records[0];
  return { url, address };
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  return (await resolvePublicDestination(raw)).url;
}

function pinnedHttpsGet(url: URL, address: PublicAddress, signal?: AbortSignal): Promise<Response> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise<Response>((resolve, reject) => {
    // Connect to the *validated IP*. https.request never resolves the untrusted
    // hostname again; SNI and certificate validation remain bound to host.
    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname: address.address,
        port: 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { host: url.host, 'accept-encoding': 'identity' },
        servername: isIP(host) ? undefined : host,
        agent: false,
        signal,
      },
      (upstream) => {
        // Node https does not transparently decompress like fetch(). Refuse
        // compressed transport responses rather than returning distorted files.
        const encoding = upstream.headers['content-encoding'];
        if (encoding && encoding !== 'identity') {
          upstream.destroy();
          reject(new Error('unsupported_content_encoding'));
          return;
        }
        const status = upstream.statusCode ?? 502;
        if (status < 200 || status > 599) {
          upstream.destroy();
          reject(new Error('upstream_status'));
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(upstream.headers)) {
          if (Array.isArray(value)) for (const item of value) headers.append(name, item);
          else if (value !== undefined) headers.set(name, String(value));
        }
        const noBody = status === 204 || status === 205 || status === 304;
        const body = noBody ? null : (Readable.toWeb(upstream) as ReadableStream<Uint8Array>);
        if (noBody) upstream.resume();
        resolve(new Response(body, { status, headers }));
      },
    );
    request.on('error', reject);
    request.setTimeout(20_000, () => request.destroy(new Error('upstream_timeout')));
    request.end();
  });
}

/* At most three redirects. Each hop gets a fresh validated DNS snapshot. */
export async function safeFetch(raw: string, signal?: AbortSignal): Promise<Response> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const destination = await resolvePublicDestination(url);
    const response = await pinnedHttpsGet(destination.url, destination.address, signal);
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      url = new URL(location, destination.url).toString();
      continue;
    }
    return response;
  }
  throw new Error('too_many_redirects');
}
