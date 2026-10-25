import { describe, expect, it } from 'vitest';
import { type Row, addHit, attraction, categoryLabel, cleanKey, hitForBuy, hitsForPage, isBot, reportCsv, sumDays, sumTop, emptyDay } from '@/lib/analyticsCore';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

describe('what a page open counts', () => {
  it('counts a visit and the page on every page', () => {
    expect(hitsForPage('/faq')).toEqual([
      { event: 'visit', key: '' },
      { event: 'page', key: '/faq' },
    ]);
    expect(hitsForPage('/')).toEqual([
      { event: 'visit', key: '' },
      { event: 'page', key: '/' },
    ]);
  });

  it('counts a product page as that product, and keeps the page list short', () => {
    expect(hitsForPage('/product/saffron-table')).toEqual([
      { event: 'visit', key: '' },
      { event: 'page', key: '/product/*' },
      { event: 'product', key: 'saffron-table' },
    ]);
    expect(hitsForPage('/orders/abc-123').map((h) => h.key)).toEqual(['', '/orders/*']);
  });

  it('reads the category from every kind of shelf address', () => {
    const cat = (p: string, q = '') =>
      hitsForPage(p, q)
        .filter((h) => h.event === 'category')
        .map((h) => h.key);
    expect(cat('/browse', '?cat=Restaurants')).toEqual(['websites:Restaurants']);
    expect(cat('/browse', 'cat=All')).toEqual([]);
    expect(cat('/apps/android', 'cat=Fitness')).toEqual(['android:Fitness']);
    expect(cat('/apps/digital', 'topic=fonts')).toEqual(['topic:fonts']);
    expect(cat('/websites/health')).toEqual(['websites:health']);
    expect(cat('/templates/landing-pages')).toEqual(['templates:landing-pages']);
    expect(cat('/browse', 'cat=%3Cscript%3E')).toEqual([]);
  });

  it('ignores junk', () => {
    expect(hitsForPage('https://evil.test/')).toEqual([]);
    expect(hitsForPage('/a b')).toEqual([]);
    expect(hitsForPage('/product/<x>')).toEqual([]);
    expect(hitForBuy('saffron-table')).toEqual({ event: 'buy', key: 'saffron-table' });
    expect(hitForBuy('../x')).toBeNull();
    expect(hitForBuy(5)).toBeNull();
    expect(cleanKey('%E0%A4%A')).toBeNull();
  });

  it('leaves out bots and empty browsers', () => {
    expect(isBot(CHROME)).toBe(false);
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isBot('curl/8.4.0')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot(null)).toBe(true);
  });
});

describe('the sums', () => {
  it('counts a visitor once a day, tells repeat visitors apart, and caps repeats', () => {
    const rows = new Map<string, Row>(),
      firsts = new Map<string, string>();
    addHit(rows, firsts, '2026-10-01', 'a', { event: 'visit', key: '' });
    addHit(rows, firsts, '2026-10-02', 'a', { event: 'visit', key: '' });
    addHit(rows, firsts, '2026-10-02', 'a', { event: 'visit', key: '' });
    addHit(rows, firsts, '2026-10-02', 'b', { event: 'visit', key: '' });
    for (let i = 0; i < 80; i++) addHit(rows, firsts, '2026-10-02', 'b', { event: 'product', key: 'p1' });
    addHit(rows, firsts, '2026-10-02', 'a', { event: 'product', key: 'p1' });
    const d = sumDays(rows.values(), firsts, '2026-10-02', '2026-10-02').get('2026-10-02')!;
    expect(d).toMatchObject({ visitors: 2, repeat: 1, fresh: 1, products: 51 });
    expect(sumTop(rows.values(), 'product', '2026-10-01', '2026-10-02', 5)).toEqual([{ key: 'p1', total: 51, people: 2 }]);
    // a visitor on two days is still one person in a range
    addHit(rows, firsts, '2026-10-01', 'a', { event: 'product', key: 'p1' });
    expect(sumTop(rows.values(), 'product', '2026-10-01', '2026-10-02', 5)[0].people).toBe(2);
  });

  it('judges attraction only with enough people', () => {
    const rules = { minViewers: 10, strongPct: 10, fairPct: 3 };
    const views = [
      { key: 'busy', total: 300, people: 200 },
      { key: 'liked', total: 40, people: 20 },
      { key: 'quiet', total: 5, people: 4 },
    ];
    const buys = [
      { key: 'busy', total: 4, people: 4 },
      { key: 'liked', total: 5, people: 3 },
      { key: 'quiet', total: 2, people: 2 },
    ];
    expect(attraction(views, buys, rules).map((a) => [a.key, a.pct, a.level])).toEqual([
      ['busy', 2, 'weak'],
      ['liked', 15, 'strong'],
      ['quiet', 50, 'few'],
    ]);
  });

  it('names categories for people', () => {
    expect(categoryLabel('websites:Restaurants')).toBe('Restaurants (Websites)');
    expect(categoryLabel('topic:fonts')).toBe('fonts (Digital topic)');
  });
});

describe('the report spreadsheet', () => {
  it('has every section and never lets a cell run as a formula', () => {
    const csv = reportCsv(
      {
        day: '2026-10-20',
        totals: { ...emptyDay('2026-10-20'), visitors: 12, repeat: 3, fresh: 9 },
        dayBefore: emptyDay('2026-10-19'),
        activity: { orders: 2 },
        pages: [{ key: '/', total: 20, people: 12 }],
        products: [{ key: 'x', name: '=HYPERLINK("http://evil")', total: 4, people: 3 }],
        categories: [{ key: 'websites:Health', name: 'Health (Websites)', total: 2, people: 2 }],
        attraction: [],
      },
      { orders: 'Orders' },
    );
    expect(csv).toContain('Visitors,12,0');
    expect(csv).toContain('Repeat visitors,3,0');
    expect(csv).toContain('Orders,2');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")",4,3`);
    expect(csv).toContain('Health (Websites),2,2');
  });
});
