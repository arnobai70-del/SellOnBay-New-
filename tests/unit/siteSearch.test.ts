import { describe, expect, it } from 'vitest';
import { type Doc, marks, pageSections, scoreDoc, searchDocs, snippet, textFragment, words } from '@/lib/siteSearchCore';

const docs: Doc[] = [
  { kind: 'product', title: 'Sunrise Bakery', href: '/product/sunrise', sub: 'Restaurants · Websites', text: 'A warm site for a bakery with online orders.' },
  { kind: 'page', title: 'Terms of service: Refunds', href: '/terms', text: 'After you accept, the sale is final, except in a dispute about a site that is not as described.' },
  { kind: 'post', title: 'How to open an online bakery', href: '/blog/bakery', text: 'Pick a site, add your menu and take orders.' },
  { kind: 'developer', title: 'Maya Chen', href: '/developers/maya', sub: 'Shop sites', text: 'Fixes and new pages for bakeries.' },
];

describe('site search', () => {
  it('finds a word inside a page section, not only in titles', () => {
    const hits = searchDocs(docs, 'dispute');
    expect(hits.map((h) => h.href)).toEqual(['/terms']);
    expect(hits[0].snippet).toContain('dispute');
  });
  it('matches part of a word, needs every word, and puts title matches first', () => {
    expect(searchDocs(docs, 'bak').map((h) => h.href)).toEqual(['/product/sunrise', '/blog/bakery', '/developers/maya']);
    expect(searchDocs(docs, 'bakery orders').map((h) => h.href)).toEqual(['/product/sunrise', '/blog/bakery']);
    expect(searchDocs(docs, 'bakery zebra')).toEqual([]);
  });
  it('ignores case and accents, and refuses a query too short to mean anything', () => {
    expect(words('  CAFÉ  café ')).toEqual(['cafe']);
    expect(searchDocs(docs, 'a')).toEqual([]);
    expect(scoreDoc(docs[0], ['sunrise'])).toBeGreaterThan(scoreDoc(docs[2], ['menu']));
  });
  it('keeps at most a few of each kind', () => {
    const many: Doc[] = Array.from({ length: 9 }, (_, i) => ({ kind: 'product', title: `Shop ${i}`, href: `/p/${i}`, text: '' }));
    expect(searchDocs(many, 'shop', 4)).toHaveLength(4);
  });
  it('cuts a short piece of text around the words and marks them without HTML', () => {
    const long = 'word '.repeat(60) + 'escrow holds the money ' + 'word '.repeat(60);
    const s = snippet(long, ['escrow']);
    expect(s.startsWith('… ')).toBe(true);
    expect(s).toContain('escrow holds');
    expect(marks('Escrow <b>holds</b>', 'escrow')).toEqual([
      { t: 'Escrow', hit: true },
      { t: ' <b>holds</b>', hit: false },
    ]);
  });
  it('reads the sections of a built page and links to the words found', () => {
    const html = '<html><body><header>Menu</header><main><h1>Terms</h1><p>Intro &amp; more</p><script>x()</script><h2>Refunds</h2><p>Sale is <b>final</b>.</p></main></body></html>';
    expect(pageSections(html)).toEqual([
      { heading: '', text: 'Terms Intro & more' },
      { heading: 'Refunds', text: 'Sale is final .' },
    ]);
    expect(textFragment('/terms', 'After you accept, the sale is final', ['sale'])).toBe('/terms#:~:text=sale%20is%20final');
    expect(textFragment('/terms#x', 'sale', ['sale'])).toBe('/terms#x');
  });
});
