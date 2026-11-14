import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * SEO audit (owner, 2026-11-14): every language version of a page names its own public address. Two places were wrong: the five category
 * pages built their hreflang (and, in other languages, their canonical) from the internal key /templates/<slug>, which only redirects; and
 * the home page in Bengali or German named the English home as its canonical, with no hreflang.
 */
describe('canonical and hreflang addresses', () => {
  it('pages whose settings live under another key localise with their own public address', () => {
    const meta = readFileSync('lib/seo/pageMeta.ts', 'utf8');
    expect(meta).toMatch(/const own = extra\.alternates\?\.canonical;/);
    expect(meta).toMatch(/localizeMetadata\(path, out, address\)/);
    const seo = readFileSync('lib/i18n/seo.ts', 'utf8');
    expect(seo).toMatch(/alternateLanguages\(address, i\.languages\)/);
    expect(seo).toMatch(/localizedPath\(address, i\.lang\)/);
    // the category page passes its public address as canonical (so it is the address the links use)
    expect(readFileSync('app/(glass)/websites/category/[category]/page.tsx', 'utf8')).toMatch(/pageMetadata\(hubPath\(hub\), \{ alternates: \{ canonical: categoryPath\(/);
  });
  it('the home page is localised like every other public page', () => {
    expect(readFileSync('app/(glass)/page.tsx', 'utf8')).toMatch(/return localizeMetadata\('\/', meta\);/);
  });
});
