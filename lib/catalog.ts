import 'server-only';
import { closedProducts } from './seo/closed';
import { getSettings } from './settings';
import { THEMES, type Product, type ThemeKey } from './data';
import { ALL_PRODUCTS, type Platform } from './apps';
import { examplesAllowed } from './exampleMode';
import { supabaseConfigured } from './supabase/env';
import { createAdminClient } from './supabase/server';
import { mayViewUnreleased } from './supabase/viewer';
import { isLicenceType } from './licences';
import { thirdPartySchema } from './schemas';
import { CONFIG } from './config';

/* Listings that sellers created live in the database. The twelve starter listings stay in code. Both come out as the same Product shape. */
type Row = {
  id: string;
  slug: string;
  seller_id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  includes: string[] | null;
  theme: string;
  price_cents: number;
  delivery_days: number;
  demo_url: string | null;
  demo_path: string | null;
  status: string;
  created_at: string;
  platform: Platform | null;
  app_stack: string | null;
  app_shots: string[] | null;
  sample_url: string | null;
  trial_url: string | null;
  licence_type: string | null;
  third_party: unknown;
  delivery_type: string | null;
  express_price_cents: number | null;
  docs_url: string | null;
  requirements: string | null;
  support_days: number | null;
  update_days: number | null;
  setup_price_cents: number | null;
  custom_price_cents: number | null;
};
const COLS =
  'id, slug, seller_id, name, category, tagline, description, includes, theme, price_cents, delivery_days, demo_url, demo_path, status, created_at, platform, app_stack, app_shots, sample_url, trial_url, licence_type, third_party, delivery_type, express_price_cents, docs_url, requirements, support_days, update_days, setup_price_cents, custom_price_cents';

/* Colours for a seller's app when it has no drawn mock-up of its own: one calm accent per category. */
const ACCENT: Record<string, [string, string, string]> = {
  Fitness: ['#0E9F76', '#F2FBF8', '#07271E'],
  Food: ['#E4572E', '#FFF6EA', '#2B1608'],
  Productivity: ['#7A3CFF', '#F6F2FF', '#1B0B3D'],
  Travel: ['#0891B2', '#F0FBFE', '#07262E'],
  Finance: ['#2B3DFF', '#F4F6FF', '#0F1330'],
  Education: ['#F0476B', '#FFF5F7', '#2D0A14'],
  Business: ['#12B886', '#F4FCF9', '#06281E'],
  'Figma kits': ['#7A3CFF', '#F4EEFF', '#1E0F3D'],
  'No-code templates': ['#2B3DFF', '#F1F3FF', '#0F1330'],
  Plugins: ['#0E9F76', '#F2FBF8', '#07271E'],
  Scripts: ['#E23C61', '#FFF5F7', '#2D0A14'],
  'AI automations': ['#E4572E', '#FFF6EA', '#2B1608'],
  Chatbots: ['#0891B2', '#F0FBFE', '#07262E'],
  'AI prompts': ['#7A3CFF', '#F4EEFF', '#1E0F3D'],
  'Video templates': ['#E23C61', '#FFF5F7', '#2D0A14'],
  'Motion graphics': ['#E4572E', '#FFF6EA', '#2B1608'],
  'Stock video': ['#0F1330', '#F3F5FA', '#0F1330'],
  Music: ['#7A3CFF', '#F4EEFF', '#1E0F3D'],
  'Sound effects': ['#0891B2', '#F0FBFE', '#07262E'],
  Graphics: ['#F0476B', '#FFF5F7', '#2D0A14'],
  'Add-ons': ['#12B886', '#F4FCF9', '#06281E'],
  'Presentation templates': ['#2B3DFF', '#F1F3FF', '#0F1330'],
  'Print templates': ['#E4572E', '#FFF6EA', '#2B1608'],
  Mockups: ['#0E9F76', '#F2FBF8', '#07271E'],
  'Social media templates': ['#E23C61', '#FFF5F7', '#2D0A14'],
  'Logo templates': ['#7A3CFF', '#F4EEFF', '#1E0F3D'],
  Photos: ['#0891B2', '#F0FBFE', '#07262E'],
  '3D models': ['#2B3DFF', '#F1F3FF', '#0F1330'],
  Fonts: ['#0F1330', '#F3F5FA', '#0F1330'],
};

function toProduct(r: Row, seller: string): Product {
  const platform = (r.platform ?? 'web') as Platform;
  const app: Product['app'] =
    platform === 'web'
      ? undefined
      : (() => {
          const [accent, bg, ink] = ACCENT[r.category] ?? ACCENT.Productivity;
          const inc = r.includes?.length ? r.includes : ['Home screen', 'Details', 'Settings'];
          return {
            accent,
            bg,
            ink,
            glyph: r.name[0]?.toUpperCase() ?? 'A',
            headline: r.name.slice(0, 14),
            metric: { label: r.category, value: '24', pct: 0.65 },
            rows: inc.slice(0, 3).map((t) => [t.slice(0, 20), 'New'] as [string, string]),
            bars: [40, 60, 50, 78, 66, 90, 58],
            cta: 'Get started',
            tabs: ['Home', 'Browse', 'Stats', 'You'],
          };
        })();
  return {
    platform,
    stack: r.app_stack ?? undefined,
    app,
    shots: r.app_shots?.length ? r.app_shots.map((n) => `/demo/${r.slug}/${n}`) : undefined,
    sample: r.sample_url && /^https:\/\//.test(r.sample_url) ? r.sample_url : undefined,
    trial: !!r.trial_url,
    licence: isLicenceType(r.licence_type) ? r.licence_type : undefined,
    thirdParty: thirdPartySchema.catch([]).parse(r.third_party),
    repo: r.delivery_type === 'repo_access',
    express: r.express_price_cents ? Math.round(r.express_price_cents / 100) : undefined,
    dbId: r.id,
    sellerId: r.seller_id,
    docsUrl: r.docs_url && /^https:\/\//.test(r.docs_url) ? r.docs_url : undefined,
    requirements: r.requirements ?? undefined,
    supportDays: r.support_days ?? 0,
    updateDays: r.update_days ?? 0,
    setupPrice: r.setup_price_cents === null || r.setup_price_cents === undefined ? undefined : Math.round(r.setup_price_cents / 100),
    customPrice: r.custom_price_cents === null || r.custom_price_cents === undefined ? undefined : Math.round(r.custom_price_cents / 100),
    does: platform === 'web' ? undefined : [],
    id: r.slug,
    name: r.name,
    theme: (r.theme in THEMES ? r.theme : 'bio') as ThemeKey,
    cat: r.category,
    price: Math.round(r.price_cents / 100),
    seller,
    rating: 0,
    reviews: 0,
    sold: 0,
    days: r.delivery_days,
    tag: r.tagline || r.category,
    desc: r.description,
    inc: r.includes?.length ? r.includes : [r.tagline || (platform === 'web' ? 'A ready-made site' : 'A ready-made app')],
    added: r.created_at.slice(0, 10),
    demo: platform === 'web' && r.demo_path ? { type: 'upload', src: `/demo/${r.slug}/` } : r.demo_url ? { type: 'url', src: r.demo_url } : undefined,
  };
}

async function names(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const { data } = ids.length ? await admin.from('profiles').select('id, full_name').in('id', ids) : { data: [] as { id: string; full_name: string }[] };
  return new Map((data ?? []).map((p) => [p.id, p.full_name || 'Seller']));
}

async function readLive(platform: Platform): Promise<Product[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('products').select(COLS).eq('status', 'live').eq('platform', platform).order('created_at', { ascending: false });
  if (error) throw new Error('Could not read the live listings.');
  const rows = (data ?? []) as Row[];
  const who = await names(admin, [...new Set(rows.map((r) => r.seller_id))]);
  return rows.map((r) => toProduct(r, who.get(r.seller_id) ?? 'Seller'));
}

/*
 * The public shelf lists (home, shelves, categories, finder) are the same for every visitor, so each copy of the server keeps them for
 * CONFIG.catalogCacheSeconds instead of reading every live listing on every page view. Only this list is kept: a single listing, checkout,
 * orders and anything about the visitor are always read fresh (productRecord, visibleProduct). A failed read is not kept.
 */
type Kept = { at: number; list: Product[] };
const g = globalThis as { __liveProducts?: { kept: Map<Platform, Kept>; reading: Map<Platform, Promise<Product[]>>; gen: number } };
const cache = () => (g.__liveProducts ??= { kept: new Map(), reading: new Map(), gen: 0 });

/* Forget the kept lists on this copy, after a listing goes live, is paused or changes. Other copies catch up within the cache time. */
export function forgetLiveProducts(): void {
  const c = cache();
  c.kept.clear();
  c.reading.clear();
  c.gen++;
}

export async function getLiveDbProducts(platform: Platform = 'web', nowMs = Date.now()): Promise<Product[]> {
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const c = cache();
  const k = c.kept.get(platform);
  if (k && nowMs - k.at < CONFIG.catalogCacheSeconds * 1000) return withoutClosed(k.list);
  // Visitors who arrive while the list is being read share that one read.
  let reading = c.reading.get(platform);
  if (!reading) {
    const gen = c.gen;
    reading = readLive(platform);
    c.reading.set(platform, reading);
    reading.then(
      (list: Product[]) => {
        if (c.gen !== gen) return; // forgotten while reading: do not keep the older list
        c.reading.delete(platform);
        c.kept.set(platform, { at: nowMs, list });
      },
      () => {
        if (c.gen === gen) c.reading.delete(platform);
      },
    );
  }
  try {
    return await withoutClosed(await reading);
  } catch {
    return [];
  }
}

/* Listings an admin unpublished (lib/seo/closed.ts) are left out of every public list. */
async function withoutClosed(list: Product[]): Promise<Product[]> {
  const closed = await closedProducts();
  return closed.size ? list.filter((p) => !closed.has(p.id)) : list;
}

/* Next signals things like "this page is dynamic" by throwing. A catch block must never swallow those. */
const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e;

/*
 * The listing behind an order or a purchase, by its key (the URL name): a starter, or a seller's listing in the database, in ANY state. Callers decide
 * whether the state matters (buying needs 'live'). Never reads the visitor's cookies, so it works in jobs too.
 */
export async function productRecord(key: string | null | undefined): Promise<{ product: Product; status: string } | null> {
  if (!key) return null;
  const starter = ALL_PRODUCTS.find((p) => p.id === key);
  if (starter && examplesAllowed()) return { product: starter, status: 'live' };
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from('products').select(COLS).eq('slug', key).maybeSingle();
    const r = data as Row | null;
    if (!r) return null;
    const who = await names(admin, [r.seller_id]);
    return { product: toProduct(r, who.get(r.seller_id) ?? 'Seller'), status: r.status };
  } catch (e) {
    if (isNextSignal(e)) throw e;
    return null;
  }
}
export const productByKey = async (key: string | null | undefined) => (await productRecord(key))?.product;

/* A listing by its URL name. Starter listings are public. A seller's own listing is public once live, and before that only its owner and admins can open it. */
export async function visibleProduct(slug: string): Promise<{ product: Product; status: string } | null> {
  const starter = ALL_PRODUCTS.find((p) => p.id === slug);
  if (starter) return (await getSettings()).showExamples ? { product: starter, status: 'live' } : null;
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from('products').select(COLS).eq('slug', slug).maybeSingle();
    const r = data as Row | null;
    if (!r) return null;
    if (r.status !== 'live' && !(await mayViewUnreleased(r.seller_id as string))) return null;
    // A listing whose page an admin unpublished is gone for visitors (page, preview and checkout); past orders read it by order instead.
    if (r.status === 'live' && (await closedProducts()).has(slug)) return null;
    const who = await names(admin, [r.seller_id]);
    return { product: toProduct(r, who.get(r.seller_id) ?? 'Seller'), status: r.status };
  } catch (e) {
    if (isNextSignal(e)) throw e;
    return null;
  }
}
