import { describe, expect, it } from 'vitest';
import { hubByEnding, hubPublicPath, setHubSlug, allocation } from '@/lib/seo/hubStore';
import { HUBS } from '@/lib/seo/hubs';
import { listRedirects } from '@/lib/seo/redirectStore';
import { BASE_DISALLOW, cleanRobotsExtra, robotsDisallow, robotsPathProblem } from '@/lib/seo/robotsRules';
import { robotsExtra, setRobotsExtra } from '@/lib/seo/robotsStore';
import { pageWords, setPageWords } from '@/lib/seo/pageWords';

describe('a template category’s own address ending (SEO slug)', () => {
  it('moves the page, sends the old address to the new one, refuses clashes and goes back cleanly', async () => {
    const eco = HUBS[1];
    expect(await setHubSlug('admin-1', 'saas', 'online-saas-templates')).toEqual({ ok: true });
    expect((await hubByEnding('online-saas-templates'))?.slug).toBe('saas');
    expect(await hubByEnding('saas')).toBeNull(); // the built-in ending now only redirects
    expect(hubPublicPath(eco, await allocation())).toBe('/templates/online-saas-templates');
    expect((await listRedirects()).find((r) => r.from === '/templates/saas')).toMatchObject({ to: '/templates/online-saas-templates', code: 301 });

    expect(await setHubSlug('admin-1', 'saas', 'online-saas-templates')).toMatchObject({ ok: false, status: 409 });
    expect(await setHubSlug('admin-1', 'business', 'online-saas-templates')).toMatchObject({ ok: false, status: 409 }); // another category’s ending
    expect(await setHubSlug('admin-1', 'business', 'portfolio')).toMatchObject({ ok: false, status: 409 }); // a built-in ending
    expect(await setHubSlug('admin-1', 'business', 'figma-ui-kits')).toMatchObject({ ok: false, status: 409 }); // a digital category
    expect(await setHubSlug('admin-1', 'business', 'Bad Slug!')).toMatchObject({ ok: false, status: 400 });
    expect(await setHubSlug('admin-1', 'nope', 'fine-slug')).toMatchObject({ ok: false, status: 404 });

    expect(await setHubSlug('admin-1', 'saas', '')).toEqual({ ok: true }); // back to the built-in ending
    expect((await hubByEnding('saas'))?.slug).toBe('saas');
    expect((await listRedirects()).some((r) => r.from === '/templates/saas')).toBe(false);
    expect((await listRedirects()).find((r) => r.from === '/templates/online-saas-templates')).toMatchObject({ to: '/templates/saas', code: 301 }); // the earlier address still lands on the page
  });
});

describe('robots.txt', () => {
  it('always keeps the private parts out and lets an admin add paths, but never pages crawlers must read', async () => {
    expect(robotsDisallow([])).toEqual(BASE_DISALLOW);
    for (const p of ['/dashboard', '/checkout', '/orders', '/api/']) expect(BASE_DISALLOW).toContain(p);
    for (const bad of ['/', '/*', '/sitemap.xml', '/robots.txt', '/_next/static', '/blog/post', '/templates/saas', '/product/x', 'no-slash', '/<script>'])
      expect(robotsPathProblem(bad), bad).toBeTruthy();
    expect(robotsPathProblem('/internal-tools/')).toBeNull();
    expect(cleanRobotsExtra(['/internal-tools/', '/dashboard', '/', '/internal-tools/', 5])).toEqual(['/internal-tools/']);
    expect(await setRobotsExtra('admin-1', ['/internal-tools/', ' ', '/old-area/'])).toEqual({ ok: true });
    expect(await robotsExtra()).toEqual(['/internal-tools/', '/old-area/']);
    expect(await setRobotsExtra('admin-1', ['/internal-tools/', '/old-area/'])).toMatchObject({ ok: false, status: 409 });
    expect(await setRobotsExtra('admin-1', ['/'])).toMatchObject({ ok: false, status: 400 });
    expect(await setRobotsExtra('admin-1', [])).toEqual({ ok: true });
  });
});

describe('the five categories’ heading and intro', () => {
  it('start from the built-in words and take the admin’s once saved', async () => {
    const path = '/templates/business';
    expect((await pageWords(path)).heading).toBe('Business and corporate website templates');
    expect(await setPageWords('admin-1', path, { heading: 'Websites for firms', intro: 'Short and clear.', body: '' })).toEqual({ ok: true });
    expect(await pageWords(path)).toMatchObject({ heading: 'Websites for firms', intro: 'Short and clear.' });
    expect(await setPageWords('admin-1', path, { heading: '', intro: '', body: '' })).toEqual({ ok: true });
    expect((await pageWords(path)).heading).toBe('Business and corporate website templates');
  });
});
