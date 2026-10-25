import { describe, expect, it } from 'vitest';
import { cleanBlocks, cleanFooter, cleanMenu, entriesToMenu, menuToEntries, safeHref, LIMITS } from '@/lib/site/content';

describe('site builder rules', () => {
  it('accepts a path on this site or an https address and nothing else', () => {
    expect(safeHref('/faq')).toBe('/faq');
    expect(safeHref('/templates/saas#top')).toBe('/templates/saas#top');
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'http://example.com', 'faq', '/a b', '/' + String.fromCharCode(92) + 'evil', '']) expect(safeHref(bad)).toBe('');
  });

  it('keeps menu items in order, drops incomplete ones and limits the count', () => {
    const m = cleanMenu({
      items: [
        { label: 'Home', href: '/' },
        { label: '', href: '/x' },
        { label: 'Bad', href: 'javascript:1' },
        {
          label: 'Docs',
          href: '/faq',
          children: [
            { label: 'A', href: '/a' },
            { label: 'B', href: 'nope' },
          ],
        },
      ],
    });
    expect(m.map((x) => x.label)).toEqual(['Home', 'Docs']);
    expect(m[1].children).toEqual([{ label: 'A', href: '/a' }]);
    expect(cleanMenu(Array.from({ length: 40 }, (_, i) => ({ label: 'L' + i, href: '/' + i })))).toHaveLength(LIMITS.menuItems);
  });

  it('turns a menu into the top bar shape and back', () => {
    const m = cleanMenu([
      { label: 'Docs', href: '/faq', children: [{ label: 'A', href: '/a' }] },
      { label: 'Sell', href: '/sell' },
    ]);
    const e = menuToEntries(m);
    expect(e[0].groups[0].links).toEqual([['A', '/a']]);
    expect(e[1].groups).toEqual([]);
    expect(entriesToMenu(e)).toEqual(m);
  });

  it('keeps footer columns that have a title and a link', () => {
    const f = cleanFooter([
      { title: 'Help', links: [{ label: 'FAQ', href: '/faq' }] },
      { title: 'Empty', links: [] },
      { title: '', links: [{ label: 'x', href: '/x' }] },
    ]);
    expect(f).toEqual([{ title: 'Help', links: [{ label: 'FAQ', href: '/faq' }] }]);
  });

  it('cleans blocks: no scripts in addresses, no empty blocks, a position of top or bottom, unique ids', () => {
    const b = cleanBlocks([
      { id: 'a', type: 'heading', text: 'Hello', level: 3, position: 'top' },
      { id: 'a', type: 'text', text: '**Hi**' },
      { id: 'c', type: 'image', src: 'javascript:alert(1)', alt: 'x' },
      { id: 'd', type: 'button', label: 'Go', href: 'https://example.com' },
      { id: 'e', type: 'text', text: '   ' },
      {
        id: 'f',
        type: 'faq',
        items: [
          { q: 'Q?', a: 'A.' },
          { q: '', a: 'no' },
        ],
      },
      { id: 'g', type: 'listings', title: 'Pick', ids: ['one', 'bad id!'] },
      { id: 'h', type: 'script', text: '<script>' },
      { id: 'i', type: 'divider' },
    ]);
    expect(b.map((x) => x.type)).toEqual(['heading', 'text', 'button', 'faq', 'listings', 'divider']);
    expect(b[0]).toMatchObject({ position: 'top', level: 3 });
    expect(b[1].position).toBe('bottom');
    expect(new Set(b.map((x) => x.id)).size).toBe(b.length);
    expect(b[4]).toMatchObject({ ids: ['one'] });
  });
});

describe('home sections and block positions', () => {
  it('keeps the three positions and defaults to the bottom', async () => {
    const { cleanBlocks } = await import('@/lib/site/content');
    const b = cleanBlocks([
      { id: 'a', type: 'divider', position: 'top' },
      { id: 'b', type: 'divider', position: 'before' },
      { id: 'c', type: 'divider', position: 'whatever' },
    ]);
    expect(b.map((x) => x.position)).toEqual(['top', 'before', 'bottom']);
  });
  it('orders and hides sections, and never hides the top banner', async () => {
    const { arrangeSections, cleanSections } = await import('@/lib/site/content');
    const known = ['hero', 'band', 'featured', 'why', 'steps', 'sell'];
    expect(arrangeSections(known, { order: [], hidden: [] })).toEqual(known);
    expect(arrangeSections(known, { order: ['sell', 'why'], hidden: ['band'] })).toEqual(['sell', 'why', 'hero', 'featured', 'steps']);
    const c = cleanSections({ order: ['why', 'nope', 'why'], hidden: ['hero', 'steps', 'zzz'] }, known);
    expect(c).toEqual({ order: ['why'], hidden: ['steps'] });
  });
});
