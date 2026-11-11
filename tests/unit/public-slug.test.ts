import { describe, expect, it } from 'vitest';
import { movedTo } from '@/lib/glass/moved';
import { publicSlug } from '@/lib/glass/publicSlug';

/* Website addresses never say "template" (owner, 2026-11-11); the database slug stays and its old address redirects. */
describe('public website slugs', () => {
  it('drops template and its fragments, keeps the unique ending', () => {
    expect(publicSlug('cognify-ai-saas-website-template-dark-1qib')).toBe('cognify-ai-saas-website-dark-1qib');
    expect(publicSlug('shop-templates-x1')).toBe('shop-x1');
    expect(publicSlug('blog-templa-x2')).toBe('blog-x2');
    expect(publicSlug('blog-tem-x3')).toBe('blog-x3');
    expect(publicSlug('aperture-wedding-photographer-portfolio--8ntv')).toBe('aperture-wedding-photographer-portfolio--8ntv');
    expect(publicSlug('temple-run-site-ab12')).toBe('temple-run-site-ab12'); // a real word is kept
    expect(publicSlug('template')).toBe('template'); // never empty
  });
  it('old product addresses land on the clean one', () => {
    expect(movedTo('/product/cognify-ai-saas-website-template-dark-1qib')).toContain('/websites/cognify-ai-saas-website-dark-1qib');
  });
});
