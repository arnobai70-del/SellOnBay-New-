import { describe, expect, it } from 'vitest';
import { browse, browseHref, PER_PAGE, readQuery, type BrowseItem } from '@/lib/glass/browse';
import { movedTo } from '@/lib/glass/moved';

const item = (id: string, over: Partial<BrowseItem> = {}): BrowseItem => ({ id, name: id, desc: '', cat: 'x', seller: 's', price: 30, rating: 0, reviews: 0, sold: 0, added: '2026-01-01', ...over });

describe('every old public address moves with a 301', () => {
  it('maps the old pages', () => {
    expect(movedTo('/templates/saas')).toBe('/websites/category/saas');
    expect(movedTo('/templates/ecommerce')).toBe('/websites/category/ecommerce');
    expect(movedTo('/templates/saas/my-site')).toBe('/websites/my-site');
    expect(movedTo('/templates')).toBe('/websites');
    expect(movedTo('/product/my-site')).toBe('/websites/my-site');
    expect(movedTo('/browse')).toBe('/websites');
    expect(movedTo('/websites/saas')).toBe('/websites/category/saas');
    expect(movedTo('/blog')).toBe('/guides');
    expect(movedTo('/blog/a-post')).toBe('/guides/a-post');
    expect(movedTo('/faq')).toBe('/help');
    expect(movedTo('/how-it-works')).toBe('/buyer-protection');
    for (const p of ['terms', 'privacy', 'refunds', 'seller-agreement', 'acceptable-use', 'dmca']) expect(movedTo('/' + p)).toBe('/legal/' + p);
    expect(movedTo('/faq/')).toBe('/help');
    expect(movedTo('/login')).toBe('/signin');
    expect(movedTo('/login/mfa')).toBe('/two-factor');
  });
  it('leaves working addresses alone, including the blog pictures existing posts use', () => {
    for (const p of [
      '/',
      '/websites',
      '/websites/my-site',
      '/websites/category/saas',
      '/domains',
      '/sell',
      '/sell/new',
      '/checkout',
      '/help',
      '/guides',
      '/guides/a',
      '/blog/feed.xml',
      '/blog/media/x.png',
      '/dashboard/buyer',
      '/api/search',
    ])
      expect(movedTo(p), p).toBeNull();
  });
  it('never builds an address from odd input', () => {
    expect(movedTo('/product/a b')).toBeNull();
    expect(movedTo('/templates/a/b/c')).toBeNull();
    expect(movedTo('/product/..%2f')).toBeNull();
  });
});

describe('the websites list', () => {
  const cats = ['saas', 'shop'];
  it('ignores junk in the address', () => {
    expect(readQuery({ category: 'nope', min: 'abc', max: '-1', sort: 'evil', page: '0', rated: 'x' }, cats)).toEqual({
      q: '',
      category: '',
      min: null,
      max: null,
      rated: false,
      sort: 'featured',
      page: 1,
    });
    expect(readQuery({ category: 'saas', min: '$20', max: '50', sort: 'new', page: '2', rated: '1', q: ' shop ' }, cats)).toEqual({
      q: 'shop',
      category: 'saas',
      min: 20,
      max: 50,
      rated: true,
      sort: 'new',
      page: 2,
    });
  });
  it('needs every word, and a word in the name ranks first', () => {
    const list = [item('a', { name: 'Plain', desc: 'a shop site' }), item('b', { name: 'Shop site' }), item('c', { name: 'Blog' })];
    const r = browse(list, readQuery({ q: 'shop site' }, cats), () => null);
    expect(r.items.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('filters by category, price and rating, and counts only real reviews for the rating', () => {
    const list = [item('a', { cat: 'saas', price: 20, rating: 5, reviews: 2 }), item('b', { price: 60, rating: 5, reviews: 0 }), item('c', { cat: 'saas', price: 90, rating: 3, reviews: 4 })];
    const inCat = (p: BrowseItem) => (p.cat === 'saas' ? 'saas' : null);
    expect(browse(list, readQuery({ category: 'saas' }, cats), inCat).total).toBe(2);
    expect(browse(list, readQuery({ min: '50', max: '70' }, cats), inCat).items[0].id).toBe('b');
    expect(browse(list, readQuery({ rated: '1' }, cats), inCat).items.map((x) => x.id)).toEqual(['a']);
  });
  it('sorts and pages, keeping an order that does not change between requests', () => {
    const list = Array.from({ length: PER_PAGE + 1 }, (_, i) => item(`p${String(i).padStart(2, '0')}`, { price: 100 - i }));
    const first = browse(list, readQuery({ sort: 'price-asc' }, cats), () => null);
    expect(first.items[0].price).toBe(100 - PER_PAGE);
    expect(first.pages).toBe(2);
    expect(browse(list, readQuery({ sort: 'price-asc', page: '99' }, cats), () => null).items).toHaveLength(1);
  });
  it('builds links that keep the filters and reset the page', () => {
    const q = readQuery({ q: 'a b', category: 'saas', min: '20', sort: 'new', page: '3' }, cats);
    expect(browseHref(q)).toBe('/websites?q=a+b&category=saas&min=20&sort=new');
    expect(browseHref(q, { page: 2 })).toBe('/websites?q=a+b&category=saas&min=20&sort=new&page=2');
    expect(browseHref(readQuery({}, cats))).toBe('/websites');
  });
});
