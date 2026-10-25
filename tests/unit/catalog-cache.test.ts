import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '@/lib/config';

/* The public list of live listings is kept for a short time per server copy; a single listing (checkout, orders) is always read fresh. */
const db = vi.hoisted(() => ({ reads: 0, single: 0, fail: false, name: 'Bakery', gate: null as Promise<void> | null }));
const row = () => ({
  id: 'p1',
  slug: 'bakery',
  seller_id: 's1',
  name: db.name,
  category: 'Food',
  tagline: 'Fresh',
  description: 'A bakery site',
  includes: ['Home'],
  theme: 'bio',
  price_cents: 4900,
  delivery_days: 3,
  demo_url: null,
  demo_path: null,
  status: 'live',
  created_at: '2026-10-01T00:00:00Z',
  platform: 'web',
  app_stack: null,
  app_shots: null,
  sample_url: null,
  trial_url: null,
  licence_type: null,
  third_party: [],
  delivery_type: null,
  express_price_cents: null,
  docs_url: null,
  requirements: null,
  support_days: 0,
  update_days: 0,
  setup_price_cents: null,
  custom_price_cents: null,
});
vi.mock('@/lib/supabase/env', () => ({ supabaseConfigured: true }));
vi.mock('@/lib/supabase/viewer', () => ({ mayViewUnreleased: async () => false }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (t: string) => ({
      select: () => {
        if (t === 'profiles') return { in: async () => ({ data: [{ id: 's1', full_name: 'Ana' }] }) };
        return {
          eq: (col: string) =>
            col === 'slug'
              ? { maybeSingle: async () => (db.single++, { data: row() }) }
              : {
                  eq: () => ({
                    order: async () => {
                      db.reads++;
                      if (db.gate) await db.gate;
                      return db.fail ? { data: null, error: { message: 'down' } } : { data: [row()], error: null };
                    },
                  }),
                },
        };
      },
    }),
  }),
}));
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
const { getLiveDbProducts, forgetLiveProducts, productRecord } = await import('@/lib/catalog');
const ttl = CONFIG.catalogCacheSeconds * 1000;

describe('public catalog cache', () => {
  beforeEach(() => {
    forgetLiveProducts();
    Object.assign(db, { reads: 0, single: 0, fail: false, name: 'Bakery', gate: null });
  });

  it('reads the live list once per cache window', async () => {
    expect((await getLiveDbProducts('web', 0))[0].name).toBe('Bakery');
    db.name = 'Renamed';
    expect((await getLiveDbProducts('web', ttl - 1))[0].name).toBe('Bakery');
    expect(db.reads).toBe(1);
    expect((await getLiveDbProducts('web', ttl))[0].name).toBe('Renamed');
    expect(db.reads).toBe(2);
  });

  it('shares one read between visitors who arrive together', async () => {
    let open!: () => void;
    db.gate = new Promise((r) => (open = r));
    const all = Promise.all([getLiveDbProducts('web', 0), getLiveDbProducts('web', 0), getLiveDbProducts('web', 0)]);
    open();
    expect((await all).map((l) => l.length)).toEqual([1, 1, 1]);
    expect(db.reads).toBe(1);
  });

  it('forgets at once when a listing changes, and does not keep a failed read', async () => {
    await getLiveDbProducts('web', 0);
    db.name = 'Renamed';
    forgetLiveProducts();
    expect((await getLiveDbProducts('web', 1))[0].name).toBe('Renamed');
    forgetLiveProducts();
    db.fail = true;
    expect(await getLiveDbProducts('web', 2)).toEqual([]);
    db.fail = false;
    expect(await getLiveDbProducts('web', 3)).toHaveLength(1);
  });

  it('never keeps a single listing, which checkout and orders read', async () => {
    await productRecord('bakery');
    await productRecord('bakery');
    expect(db.single).toBe(2);
  });
});
