import { BUGFIX_DAYS, CONFIG, PAYOUT_TEXT, PLAN_FEE_TEXT, PLAN_KEEP_TEXT, REVIEW_HOURS } from '../config';

/*
 * Every public page an admin can edit (owner, 2026-11-08: Admin › Content › Pages), as sections of fields with today's words as the defaults.
 * Pages read their words through lib/content/copy.ts; nothing saved means exactly these words. Numbers are never typed into copy: {keep}, {fee},
 * {reviewHours}, {minPrice}, {payout} and {bugfixDays} are filled from lib/config.ts when the page is drawn. Pure, tested.
 */
export type FieldKind = 'text' | 'long' | 'link' | 'image';
export type FieldDef = { key: string; label: string; kind: FieldKind; default: string };
export type SectionDef = { key: string; label: string; fields: FieldDef[]; locked?: boolean };
export type PageDef = { key: string; path: string; label: string; sections: SectionDef[]; reorder?: boolean; legal?: boolean; seo?: boolean };

const t = (key: string, label: string, d: string): FieldDef => ({ key, label, kind: 'text', default: d });
const long = (key: string, label: string, d: string): FieldDef => ({ key, label, kind: 'long', default: d });
const link = (key: string, label: string, d: string): FieldDef => ({ key, label, kind: 'link', default: d });
const head = (heading = '', intro = ''): SectionDef => ({ key: 'head', label: 'Top of the page', locked: true, fields: [t('heading', 'Heading', heading), long('intro', 'Intro', intro)] });

export const PLACEHOLDERS: Record<string, string> = {
  keep: PLAN_KEEP_TEXT,
  fee: PLAN_FEE_TEXT,
  reviewHours: String(REVIEW_HOURS),
  minPrice: `$${CONFIG.sale.priceMinCents / 100}`,
  payout: PAYOUT_TEXT,
  bugfixDays: String(BUGFIX_DAYS),
};
export const fill = (s: string) => s.replace(/\{(keep|fee|reviewHours|minPrice|payout|bugfixDays)\}/g, (_, k: string) => PLACEHOLDERS[k]);

const pillar = (n: string, who: string, title: string, text: string, li: string[], href: string, cta: string): FieldDef[] => [
  t(`p${n}who`, `Card ${n}: for whom`, who),
  t(`p${n}title`, `Card ${n}: title`, title),
  long(`p${n}text`, `Card ${n}: text`, text),
  long(`p${n}points`, `Card ${n}: points (one per line)`, li.join('\n')),
  t(`p${n}cta`, `Card ${n}: button`, cta),
  link(`p${n}href`, `Card ${n}: button goes to`, href),
];

export const PAGES: PageDef[] = [
  {
    key: 'home',
    path: '/',
    label: 'Home',
    reorder: true,
    seo: true,
    sections: [
      {
        key: 'hero',
        label: 'Top banner',
        locked: true,
        fields: [
          t('title', 'Heading', 'Buy a website. Get a domain. Or sell your own.'),
          long(
            'lead',
            'Text under the heading',
            'One place for your online business: ready-made full-stack websites with escrow protection, domains in your own name, and a marketplace where developers keep {keep} of every sale.',
          ),
          t('search', 'Search box hint', 'Search full-stack websites'),
        ],
      },
      {
        key: 'pillars',
        label: 'Three things, one platform',
        fields: [
          t('heading', 'Heading', 'Three things, one platform'),
          t('intro', 'Text', 'Everything a website needs, from the first idea to launch.'),
          ...pillar(
            '1',
            'For buyers',
            'Full-stack websites',
            'Pick a complete, working website with frontend, backend and database. Try the live demo and buy safely with escrow.',
            ['Live demo before you buy', 'Escrow and a {reviewHours}-hour review', 'Customization by the seller'],
            '/websites',
            'Browse websites',
          ),
          ...pillar(
            '2',
            'For everyone',
            'Domains',
            'Check a name and we register it for you, in your own name.',
            ['Registered in your own name', 'Reminders before it expires', 'Help connecting it to your site'],
            '/domains',
            'Find a domain',
          ),
          ...pillar(
            '3',
            'For developers',
            'Seller platform',
            'Upload your full-stack websites, set your price and get paid after each review.',
            ['Keep {keep} of every sale', 'Prices from {minPrice}', 'Your own seller store'],
            '/sell',
            'Start selling',
          ),
        ],
      },
      {
        key: 'featured',
        label: 'Featured websites',
        fields: [t('heading', 'Heading', 'Featured websites'), t('all', 'Link to all', 'Browse all'), t('empty', 'When there are none', 'New websites are on their way.')],
      },
      {
        key: 'domains',
        label: 'Domains',
        fields: [t('tag', 'Small label', 'Domains'), t('heading', 'Heading', 'Your name on the web, in your name.'), t('hint', 'Box hint', 'yourbrand'), t('button', 'Button', 'Check availability')],
      },
      {
        key: 'how',
        label: 'How buying works',
        fields: [
          t('heading', 'Heading', 'How buying works'),
          t('link', 'Link', 'Buyer protection'),
          t('s1t', 'Step 1', 'Try the live demo'),
          t('s1d', 'Step 1 text', 'Open the real site and test every page.'),
          t('s2t', 'Step 2', 'Pay into escrow'),
          t('s2d', 'Step 2 text', 'SellOnBay holds your payment, not the seller.'),
          t('s3t', 'Step 3', 'Review for {reviewHours} hours'),
          t('s3d', 'Step 3 text', 'Get the files, check them, ask for fixes.'),
          t('s4t', 'Step 4', 'Approve and launch'),
          t('s4d', 'Step 4 text', 'The seller is paid and the site is yours.'),
        ],
      },
      { key: 'sellers', label: 'Top sellers', fields: [t('heading', 'Heading', 'Top sellers'), t('all', 'Link to all', 'See all sellers')] },
      {
        key: 'sell',
        label: 'Sell band',
        fields: [
          t('heading', 'Heading', 'Sell your full-stack websites. Keep {keep} of every sale.'),
          long('text', 'Text', 'Upload your site with a live demo and set your price from {minPrice}. {payout}.'),
          t('button', 'Button', 'Start selling'),
        ],
      },
    ],
  },
  { key: 'websites', path: '/websites', label: 'Websites', seo: true, sections: [head()] },
  { key: 'domains', path: '/domains', label: 'Domains', seo: true, sections: [head()] },
  { key: 'sellers', path: '/sellers', label: 'Sellers', seo: true, sections: [head()] },
  {
    key: 'sell',
    path: '/sell',
    label: 'Sell',
    seo: true,
    sections: [
      head(),
      {
        key: 'cta',
        label: 'Buttons',
        fields: [
          t('start', 'Main button', 'Start selling'),
          t('agreement', 'Second button', 'Seller agreement'),
          t('ready', 'Closing line', 'Ready to open your store?'),
          t('create', 'Closing button', 'Create a seller account'),
        ],
      },
    ],
  },
  { key: 'buyer-protection', path: '/buyer-protection', label: 'Buyer protection', seo: true, sections: [head()] },
  {
    key: 'help',
    path: '/help',
    label: 'Help',
    seo: true,
    sections: [
      head(),
      {
        key: 'contact',
        label: 'Still need help?',
        fields: [t('heading', 'Heading', 'Still need help?'), long('text', 'Text', "Signed in? Open a ticket from your dashboard so it's linked to your order. Otherwise send us a message here.")],
      },
    ],
  },
  { key: 'guides', path: '/guides', label: 'Guides', seo: true, sections: [head()] },
  {
    key: 'website',
    path: '/websites/[slug]',
    label: 'Website page (every listing)',
    sections: [
      {
        key: 'labels',
        label: 'Words around each listing',
        fields: [
          t('demo', 'Demo button', 'Open live demo'),
          t('cart', 'Add button', 'Add to cart'),
          t('after', 'When not offered in the beta', 'Available after beta'),
          t('included', "Heading of what's included", "What's included"),
        ],
      },
    ],
  },
  {
    key: 'not-found',
    path: '404',
    label: 'Page not found',
    sections: [
      {
        key: 'main',
        label: 'Page not found',
        locked: true,
        fields: [t('heading', 'Heading', "This page doesn't exist"), long('text', 'Text', 'The link may be old, or the website was removed by its seller. Try searching instead.')],
      },
    ],
  },
  {
    key: 'nav',
    path: 'nav',
    label: 'Top bar',
    sections: [
      {
        key: 'links',
        label: 'Links',
        locked: true,
        fields: [t('websites', 'Websites', 'Websites'), t('domains', 'Domains', 'Domains'), t('sellers', 'Sellers', 'Sellers'), t('sell', 'Sell', 'Sell'), t('help', 'Help', 'Help')],
      },
    ],
  },
  {
    key: 'footer',
    path: 'footer',
    label: 'Footer',
    sections: [
      {
        key: 'main',
        label: 'Footer',
        locked: true,
        fields: [long('tagline', 'Line under the name', 'Full-stack websites and domains, bought safely with escrow.'), t('contact', 'Contact column title', 'Contact')],
      },
    ],
  },
  ...(
    [
      ['terms', '/legal/terms', 'Terms'],
      ['privacy', '/legal/privacy', 'Privacy'],
      ['refunds', '/legal/refunds', 'Refunds'],
      ['seller-agreement', '/legal/seller-agreement', 'Seller agreement'],
      ['acceptable-use', '/legal/acceptable-use', 'Acceptable use'],
      ['dmca', '/legal/dmca', 'Copyright (DMCA)'],
      ['licenses', '/legal/licenses', 'Licences'],
    ] as const
  ).map(([key, path, label]): PageDef => ({ key, path, label: `Legal: ${label}`, legal: true, sections: [] })),
];

export const pageByKey = (key: string) => PAGES.find((p) => p.key === key) ?? null;
export const pageByPath = (path: string) => PAGES.find((p) => p.path === path) ?? null;

/*
 * The words of one page as saved by an admin. Only known fields, plain text (no HTML), links as a path or https. Legal pages are edited in the versioned
 * legal documents (lib/legal), because the accept box records which version a person agreed to; the Pages list links there.
 */
export type PageDoc = { text: Record<string, string>; order: string[]; hidden: string[]; seo: { title: string; description: string; ogImage: string } };
export const EMPTY_DOC: PageDoc = { text: {}, order: [], hidden: [], seo: { title: '', description: '', ogImage: '' } };
const LIMIT: Record<FieldKind, number> = { text: 200, long: 1200, link: 300, image: 500 };

export function checkPageDoc(def: PageDef, raw: unknown): { ok: true; value: PageDoc } | { ok: false; error: string } {
  const r = (raw ?? {}) as Partial<PageDoc>;
  const text: Record<string, string> = {};
  for (const s of def.sections)
    for (const f of s.fields) {
      const id = `${s.key}.${f.key}`;
      const v = r.text?.[id];
      if (v === undefined || v === null || v === f.default) continue;
      const s2 = String(v).replace(/\r\n?/g, '\n').trim();
      if (s2.length > LIMIT[f.kind]) return { ok: false, error: `${s.label}, ${f.label}: at most ${LIMIT[f.kind]} characters.` };
      if (/<\s*\/?\s*[a-z][^>]*>/i.test(s2)) return { ok: false, error: `${s.label}, ${f.label}: plain words only, no HTML.` };
      if ((f.kind === 'link' || f.kind === 'image') && s2 && !/^(\/[A-Za-z0-9/_.?=&#-]*|https:\/\/\S+)$/.test(s2))
        return { ok: false, error: `${s.label}, ${f.label}: a path like /websites or an https address.` };
      text[id] = s2;
    }
  const keys = def.sections.map((s) => s.key);
  const movable = def.sections.filter((s) => !s.locked).map((s) => s.key);
  const order = def.reorder ? (r.order ?? []).filter((k, i, a) => movable.includes(k) && a.indexOf(k) === i) : [];
  const hidden = (r.hidden ?? []).filter((k, i, a) => keys.includes(k) && movable.includes(k) && a.indexOf(k) === i);
  const seo = {
    title: String(r.seo?.title ?? '')
      .trim()
      .slice(0, 70),
    description: String(r.seo?.description ?? '')
      .trim()
      .slice(0, 170),
    ogImage: String(r.seo?.ogImage ?? '').trim(),
  };
  if (seo.ogImage && !/^(\/blog\/media\/[A-Za-z0-9._-]{1,120}|https:\/\/\S{4,500})$/.test(seo.ogImage)) return { ok: false, error: 'The share picture must be uploaded here or be an https address.' };
  return { ok: true, value: { text, order, hidden, seo } };
}

/* The order to draw a page's movable sections: the saved order first, the rest in their built-in place; hidden ones left out. */
export function arrange(def: PageDef, doc: PageDoc): string[] {
  const movable = def.sections.filter((s) => !s.locked).map((s) => s.key);
  const rank = (k: string) => (doc.order.includes(k) ? doc.order.indexOf(k) : doc.order.length + movable.indexOf(k));
  return [...movable].sort((a, b) => rank(a) - rank(b)).filter((k) => !doc.hidden.includes(k));
}
