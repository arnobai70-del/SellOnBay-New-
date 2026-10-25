/*
 * The visitor's address, for rate limits, quotas and the evidence log. The left-most X-Forwarded-For value is whatever reached the first proxy,
 * so a visitor can write it themselves unless the host overwrites it. Two settings make it trustworthy once the host's setup is known:
 *  - CLIENT_IP_HEADER=cf-connecting-ip behind Cloudflare (only when every request comes through Cloudflare, or a visitor could send it);
 *  - TRUSTED_PROXY_HOPS=n: we run behind n proxies that each append the address they saw, so the address is counted n from the right.
 * Neither is set by default, because guessing wrong would put every visitor on one address and share one rate limit. No imports.
 */
export function clientAddress(h: Headers, env: Record<string, string | undefined> = process.env): string {
  const named = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (named && named !== 'x-forwarded-for') return (h.get(named)?.trim() || 'unknown').slice(0, 64);
  const list = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const hops = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? '', 10);
  const ip = !list.length ? h.get('x-real-ip')?.trim() : hops >= 1 && hops <= 5 ? list[Math.max(0, list.length - hops)] : list[0];
  return (ip || 'unknown').slice(0, 64);
}
