import { tx } from '../i18n/tx';
/*
 * Social media links (owner, 2026-11-08: Admin › Settings › Contact & social; before that Admin > Site builder). Pure, tested. Only https addresses
 * on each network's own domains are kept, at most one per network, so a saved link can never point somewhere else. The list order is the order on
 * the site. A link switched off keeps `enabled: false` and is not shown. Brand marks come from simple-icons (lib/site/socialIcons.ts).
 */
export const NETWORKS = {
  facebook: { label: 'Facebook', hosts: ['facebook.com', 'www.facebook.com', 'fb.com', 'm.facebook.com'] },
  instagram: { label: 'Instagram', hosts: ['instagram.com', 'www.instagram.com'] },
  x: { label: 'X', hosts: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'] },
  linkedin: { label: 'LinkedIn', hosts: ['linkedin.com', 'www.linkedin.com'] },
  youtube: { label: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'youtu.be'] },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com', 'www.tiktok.com'] },
  github: { label: 'GitHub', hosts: ['github.com'] },
  telegram: { label: 'Telegram', hosts: ['t.me', 'telegram.me'] },
  whatsapp: { label: 'WhatsApp', hosts: ['wa.me', 'whatsapp.com', 'www.whatsapp.com', 'chat.whatsapp.com', 'api.whatsapp.com'] },
  discord: { label: 'Discord', hosts: ['discord.gg', 'discord.com', 'www.discord.com'] },
  threads: { label: 'Threads', hosts: ['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'] },
  pinterest: { label: 'Pinterest', hosts: ['pinterest.com', 'www.pinterest.com'] },
  behance: { label: 'Behance', hosts: ['behance.net', 'www.behance.net'] },
  dribbble: { label: 'Dribbble', hosts: ['dribbble.com'] },
} as const;
export type Network = keyof typeof NETWORKS;
export type SocialLink = { network: Network; url: string; enabled?: false };

/* Is this address an https link on that network's own domain? Returns the clean address or a reason. */
export function checkSocialUrl(network: string, url: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (!Object.hasOwn(NETWORKS, network)) return { ok: false, error: tx('Unknown network.') };
  const label = NETWORKS[network as Network].label;
  let u: URL;
  try {
    u = new URL(String(url ?? '').trim());
  } catch {
    return { ok: false, error: `${label}: write the full address, starting with https://` };
  }
  if (u.protocol !== 'https:') return { ok: false, error: `${label}: the address must start with https://` };
  if (u.username || u.password) return { ok: false, error: `${label}: remove the name and password from the address.` };
  if (!(NETWORKS[network as Network].hosts as readonly string[]).includes(u.hostname.toLowerCase()))
    return { ok: false, error: `${label}: the address must be on ${NETWORKS[network as Network].hosts[0]}.` };
  if (u.href.length > 300) return { ok: false, error: `${label}: the address is too long.` };
  return { ok: true, url: u.href };
}

/* Accepts a list of {network, url, enabled} or text with one "network address" per line. Bad entries are dropped. */
export function cleanSocial(raw: unknown): SocialLink[] {
  const items: { network?: unknown; url?: unknown; enabled?: unknown }[] = Array.isArray(raw)
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
    const n = String(i?.network ?? '').toLowerCase();
    if (out.some((o) => o.network === n)) continue;
    const c = checkSocialUrl(n, i?.url);
    if (!c.ok) continue;
    out.push(i.enabled === false ? { network: n as Network, url: c.url, enabled: false } : { network: n as Network, url: c.url });
  }
  return out;
}

/* The links shown on the site, in order. */
export const shownSocial = (list: SocialLink[]) => list.filter((l) => l.enabled !== false);
