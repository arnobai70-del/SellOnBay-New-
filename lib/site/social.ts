/*
 * Social media links in the footer (SellOnBay 2.0 CMS, Admin > Site builder). Pure, tested. Only https addresses on each network's own
 * domains are kept, at most one per network, so a saved link can never point somewhere else. Shown as plain text links, no brand logos.
 */
export const NETWORKS = {
  facebook: { label: 'Facebook', hosts: ['facebook.com', 'www.facebook.com', 'fb.com'] },
  instagram: { label: 'Instagram', hosts: ['instagram.com', 'www.instagram.com'] },
  x: { label: 'X', hosts: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'] },
  linkedin: { label: 'LinkedIn', hosts: ['linkedin.com', 'www.linkedin.com'] },
  youtube: { label: 'YouTube', hosts: ['youtube.com', 'www.youtube.com'] },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com', 'www.tiktok.com'] },
  github: { label: 'GitHub', hosts: ['github.com'] },
} as const;
export type Network = keyof typeof NETWORKS;
export type SocialLink = { network: Network; url: string };

/* Accepts a list of {network, url} or text with one "network address" per line. */
export function cleanSocial(raw: unknown): SocialLink[] {
  const items: { network?: unknown; url?: unknown }[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw
          .split(/\r?\n/)
          .map((l) => l.trim().split(/\s+/))
          .filter((p) => p.length === 2)
          .map(([network, url]) => ({ network: network.toLowerCase(), url }))
      : [];
  const out: SocialLink[] = [];
  for (const i of items) {
    const n = String(i.network ?? '').toLowerCase();
    if (!Object.hasOwn(NETWORKS, n) || out.some((o) => o.network === n)) continue;
    let u: URL;
    try {
      u = new URL(String(i.url ?? ''));
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' || u.username || u.password || !(NETWORKS[n as Network].hosts as readonly string[]).includes(u.hostname.toLowerCase())) continue;
    if (u.href.length > 300) continue;
    out.push({ network: n as Network, url: u.href });
  }
  return out;
}
