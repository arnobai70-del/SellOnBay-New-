import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FOOTER_COLUMNS } from '@/lib/glass/nav';
import { localizeFooter } from '@/lib/i18n/ui';
import bn from '@/lib/i18n/messages/bn';

/* The footer (owner, 2026-11-14): a Blog link under Help, the social icons in the bottom bar, and a credit line without an email address. */
describe('footer: blog, social icons, credit', () => {
  it('Help has a Blog link to /guides, where the posts from Admin › SEO › Blog are published, with its own word in each language', () => {
    const help = FOOTER_COLUMNS.find((c) => c.title === 'Help')!;
    expect(help.links.at(-1)).toMatchObject({ label: 'Blog', href: '/guides' });
    const t = (k: string) => (bn as Record<string, string>)[k] ?? k;
    const foot = localizeFooter(FOOTER_COLUMNS, t, 'bn');
    expect(foot.find((c) => c.links.some((l) => l.label === 'ব্লগ'))?.links.at(-1)).toEqual({ href: '/bn/guides', label: 'ব্লগ' });
    expect(foot[0].links.find((l) => l.href === '/bn/guides')?.label).toBe('গাইড'); // Guides keeps its own word
  });
  it('the bottom bar credits the site, never an email, and holds the social icons', () => {
    const s = readFileSync('components/glass/PublicFooter.tsx', 'utf8');
    expect(s).not.toMatch(/EMAIL_ROUTES\.dev/);
    const bar = s.slice(s.indexOf('The bottom bar'));
    expect(bar).toMatch(/\{BRAND_DOMAIN\}/);
    expect(bar).toMatch(/<SocialRow links=\{social\}/);
    expect((s.match(/<SocialRow /g) ?? []).length).toBe(1);
  });
});
