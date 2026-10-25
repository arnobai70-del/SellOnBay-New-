import { describe, expect, it } from 'vitest';
import { checkProductEdit, type ProductEditInput } from '@/lib/productEditRules';

const ctx = { platform: 'web', priceMinCents: 500, priceMaxCents: 7000, hasHostedDemo: false };
const ok: ProductEditInput = {
  name: 'Saffron Table',
  category: 'Restaurants',
  desc: 'A clean restaurant site with a menu, booking form and gallery.',
  includes: 'Menu page\nBooking form\nGallery',
  price: 39,
  days: 3,
  demo: 'https://demo.example.com',
  sample: '',
  docsUrl: '',
  requirements: '',
  express: '',
  setupPrice: 30,
  customPrice: 0,
  supportDays: 0,
  updateDays: 0,
};

describe('what an admin may change on a listing', () => {
  it('accepts a valid edit and builds the row the shop stores', () => {
    const c = checkProductEdit(ok, ctx);
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.row).toMatchObject({ name: 'Saffron Table', price_cents: 3900, delivery_days: 3, theme: 'restaurant', tagline: 'Restaurants', setup_price_cents: 3000, custom_price_cents: 0 });
      expect(c.row.includes).toEqual(['Menu page', 'Booking form', 'Gallery']);
      expect(c.row.express_price_cents).toBeNull();
    }
  });
  it('keeps the seller form’s limits: price range, days, name, description, links, extras', () => {
    const bad = (patch: Partial<ProductEditInput>, c = ctx) => checkProductEdit({ ...ok, ...patch }, c);
    expect(bad({ price: 4 })).toMatchObject({ ok: false });
    expect(bad({ price: 71 })).toMatchObject({ ok: false });
    expect(bad({ price: 12.5 })).toMatchObject({ ok: false });
    expect(bad({ days: 0 })).toMatchObject({ ok: false });
    expect(bad({ days: 8 })).toMatchObject({ ok: false });
    expect(bad({ name: 'ab' })).toMatchObject({ ok: false });
    expect(bad({ desc: 'too short' })).toMatchObject({ ok: false });
    expect(bad({ category: 'Fonts' })).toMatchObject({ ok: false }); // not a website category
    expect(bad({ includes: '' })).toMatchObject({ ok: false });
    expect(bad({ demo: 'http://insecure.example.com' })).toMatchObject({ ok: false });
    expect(bad({ demo: '' })).toMatchObject({ ok: false }); // a website needs a demo
    expect(bad({ demo: '' }, { ...ctx, hasHostedDemo: true })).toMatchObject({ ok: true }); // or a hosted one
    expect(bad({ express: '5' })).toMatchObject({ ok: false });
    expect(bad({ express: '15' })).toMatchObject({ ok: true });
    expect(bad({ setupPrice: 31 })).toMatchObject({ ok: false });
    expect(bad({ price: 60, customPrice: 50 })).toMatchObject({ ok: false }); // price plus extra over the top of the range
    expect(bad({ name: '<b>x</b> shop' })).toMatchObject({ ok: false });
  });
  it('only a digital product carries documentation, requirements and support periods', () => {
    const web = checkProductEdit({ ...ok, docsUrl: 'https://docs.example.com', supportDays: 90 }, ctx);
    expect(web.ok && web.row.docs_url).toBeNull();
    expect(web.ok && web.row.support_days).toBe(0);
    const dig = checkProductEdit({ ...ok, category: 'Plugins', docsUrl: 'https://docs.example.com', requirements: 'Node 20', supportDays: 90, updateDays: 180 }, { ...ctx, platform: 'digital' });
    expect(dig.ok && dig.row).toMatchObject({ docs_url: 'https://docs.example.com', requirements: 'Node 20', support_days: 90, update_days: 180, theme: 'bio' });
    expect(checkProductEdit({ ...ok, category: 'Plugins', supportDays: 45 }, { ...ctx, platform: 'digital' })).toMatchObject({ ok: false });
  });
});

describe('full edit: files link and licence', () => {
  const base = {
    name: 'Fashion Store',
    category: 'E-commerce Templates',
    desc: 'A complete online store template with a cart.',
    includes: 'Home page\nShop page',
    price: 20,
    days: 3,
    demo: 'https://demo.example.com',
    sample: '',
    docsUrl: '',
    requirements: '',
    express: '',
    setupPrice: 0,
    customPrice: 0,
    supportDays: 0,
    updateDays: 0,
  };
  it('leaves them alone when they are not sent, and checks them when they are', () => {
    const none = checkProductEdit(base, ctx);
    expect(none.ok && 'code_url' in none.row).toBe(false);
    const ok = checkProductEdit({ ...base, codeUrl: ' https://github.com/x/y ', licenceType: 'multi_project' }, ctx);
    expect(ok.ok && ok.row.code_url).toBe('https://github.com/x/y');
    expect(ok.ok && ok.row.licence_type).toBe('multi_project');
    expect(checkProductEdit({ ...base, codeUrl: 'http://x.example' }, ctx).ok).toBe(false);
    expect(checkProductEdit({ ...base, codeUrl: '' }, ctx).ok).toBe(false);
    expect(checkProductEdit({ ...base, licenceType: 'anything' }, ctx).ok).toBe(false);
  });
});
