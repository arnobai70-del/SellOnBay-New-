import { isHubPath } from './hubs';

/*
 * Publishing and search settings an admin keeps for one public page, on top of its title and description (lib/seo/pageMeta.ts).
 * Pure rules only, so they are tested without a database; the store is lib/seo/controlStore.ts.
 * Publishing (can a visitor open the page) and indexing (may search engines list it) are separate switches.
 */
export type PageStatus = 'published' | 'draft' | 'archived';
export type Faq = { q: string; a: string; draft?: boolean };

export type PageControls = {
  status: PageStatus;
  index: boolean; // false = robots "noindex"
  follow: boolean; // false = robots "nofollow"
  sitemap: boolean; // listed in sitemap.xml (only when also published and indexable)
  canonical: string; // empty = the page's own address
  ogTitle: string;
  ogDescription: string;
  ogImage: string; // https address or a path on this site
  ogImageAlt: string; // describes the featured image for screen readers and share cards
  focusKeyword: string; // an editor's note, never written into the page as a meta keywords tag
  keywords: string; // secondary keywords, also an editor's note
  content: string; // extra text for the page in Markdown (never HTML), shown under the page's own content
  related: string[]; // listing ids shown as related products
  schema: boolean; // write WebPage structured data for the page
  faqSchema: boolean; // write FAQPage structured data from the published questions
  faqs: Faq[];
};

export const DEFAULT_CONTROLS: PageControls = {
  status: 'published',
  index: true,
  follow: true,
  sitemap: true,
  canonical: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  ogImageAlt: '',
  focusKeyword: '',
  keywords: '',
  content: '',
  related: [],
  schema: true,
  faqSchema: true,
  faqs: [],
};

export const CONTROL_MAX = {
  ogTitle: 90,
  ogDescription: 200,
  focusKeyword: 80,
  keywords: 300,
  imageAlt: 140,
  content: 20000,
  related: 8,
  canonical: 300,
  ogImage: 400,
  question: 200,
  answer: 1500,
  faqs: 20,
} as const;

/* Legal and support pages: they stay public whatever is saved (they may still be kept out of the sitemap or search). */
export const LOCKED_PATHS: readonly string[] = ['/', '/terms', '/privacy', '/refunds', '/acceptable-use', '/seller-agreement', '/dmca', '/report-abuse'];
export const isLocked = (path: string) => LOCKED_PATHS.includes(path);

/* Every public page shows what an admin saves for it (extra text, related listings, questions): PageExtras is on each page, and a test keeps that true. */
export const showsFaq = (_path: string) => true;

const okAddress = (v: string) => v === '' || /^https:\/\/[^\s<>"]+$/.test(v) || /^\/[^\s<>"]*$/.test(v);

export function controlsProblem(v: PageControls): string | null {
  if (!['published', 'draft', 'archived'].includes(v.status)) return 'Pick published, draft or archived.';
  for (const k of ['index', 'follow', 'sitemap'] as const) if (typeof v[k] !== 'boolean') return 'Switches must be on or off.';
  if (v.canonical.length > CONTROL_MAX.canonical || !okAddress(v.canonical)) return 'The canonical address must be an https address or a path starting with /.';
  if (v.ogImage.length > CONTROL_MAX.ogImage || !okAddress(v.ogImage)) return 'The share image must be an https address or a path starting with /.';
  if (v.ogTitle.length > CONTROL_MAX.ogTitle) return `The share title can have up to ${CONTROL_MAX.ogTitle} characters.`;
  if (v.ogDescription.length > CONTROL_MAX.ogDescription) return `The share description can have up to ${CONTROL_MAX.ogDescription} characters.`;
  if (v.focusKeyword.length > CONTROL_MAX.focusKeyword) return `The focus keyword can have up to ${CONTROL_MAX.focusKeyword} characters.`;
  if (v.faqs.length > CONTROL_MAX.faqs) return `At most ${CONTROL_MAX.faqs} questions.`;
  for (const f of v.faqs) {
    if (!f.q.trim() || !f.a.trim()) return 'Every question needs an answer.';
    if (f.q.length > CONTROL_MAX.question) return `A question can have up to ${CONTROL_MAX.question} characters.`;
    if (f.a.length > CONTROL_MAX.answer) return `An answer can have up to ${CONTROL_MAX.answer} characters.`;
  }
  if (v.ogImageAlt.length > CONTROL_MAX.imageAlt) return `The picture description can have up to ${CONTROL_MAX.imageAlt} characters.`;
  if (v.keywords.length > CONTROL_MAX.keywords) return `The keyword notes can have up to ${CONTROL_MAX.keywords} characters.`;
  if (v.content.length > CONTROL_MAX.content) return `The page text can have up to ${CONTROL_MAX.content} characters.`;
  if (v.related.length > CONTROL_MAX.related || v.related.some((id) => !/^[A-Za-z0-9_-]{1,80}$/.test(id))) return `Pick up to ${CONTROL_MAX.related} related listings.`;
  for (const k of ['schema', 'faqSchema'] as const) if (typeof v[k] !== 'boolean') return 'Switches must be on or off.';
  if (/[<>]/.test([v.ogTitle, v.ogImageAlt, v.keywords, v.ogDescription, v.focusKeyword, ...v.faqs.flatMap((f) => [f.q, f.a])].join(''))) return 'Leave out < and >.';
  return null;
}

/* Reads whatever is stored and returns a safe value: a bad or old record never breaks a page. */
export function cleanControls(raw: unknown): PageControls {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const b = (k: string, d: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d);
  const faqs = Array.isArray(o.faqs)
    ? o.faqs.flatMap((f): Faq[] =>
        f && typeof f === 'object' && typeof (f as Faq).q === 'string' && typeof (f as Faq).a === 'string'
          ? [{ q: (f as Faq).q.trim(), a: (f as Faq).a.trim(), ...((f as Faq).draft ? { draft: true } : {}) }]
          : [],
      )
    : [];
  const status = o.status === 'draft' || o.status === 'archived' ? o.status : 'published';
  const out: PageControls = {
    status,
    index: b('index', true),
    follow: b('follow', true),
    sitemap: b('sitemap', true),
    canonical: s('canonical'),
    ogTitle: s('ogTitle'),
    ogDescription: s('ogDescription'),
    ogImage: s('ogImage'),
    ogImageAlt: s('ogImageAlt'),
    focusKeyword: s('focusKeyword'),
    keywords: s('keywords'),
    content: typeof o.content === 'string' ? o.content.replace(/\r\n?/g, '\n').trim() : '',
    related: Array.isArray(o.related) ? o.related.filter((x): x is string => typeof x === 'string') : [],
    schema: b('schema', true),
    faqSchema: b('faqSchema', true),
    faqs,
  };
  return controlsProblem(out) ? DEFAULT_CONTROLS : out;
}

/* Can a visitor open this page? Legal and support pages always can. */
export const isPublic = (path: string, c: PageControls) => isLocked(path) || c.status === 'published';

/* Is it listed in sitemap.xml? Published, allowed to be indexed, and switched on. */
export const inSitemap = (path: string, c: PageControls) => isPublic(path, c) && c.index && c.sitemap;

/* The robots meta for a page, or undefined when the defaults (index, follow) apply. */
export const robotsFor = (path: string, c: PageControls) => (c.index && c.follow && isPublic(path, c) ? undefined : { index: c.index && isPublic(path, c), follow: c.follow });

/* The questions visitors see, and the only ones that go into structured data. */
export const publishedFaqs = (c: PageControls) => c.faqs.filter((f) => !f.draft);

/* FAQPage structured data built from the same saved questions the page shows; null when there are none. */
export function faqJsonLd(c: PageControls) {
  const list = publishedFaqs(c);
  if (!list.length || !c.faqSchema) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}

/* WebPage structured data from the page's real address, title and description; null when an admin switched it off. */
export function pageJsonLd(c: PageControls, page: { url: string; name: string; description?: string; collection?: boolean; image?: string }) {
  if (!c.schema) return null;
  return {
    '@context': 'https://schema.org',
    '@type': page.collection ? 'CollectionPage' : 'WebPage',
    url: page.url,
    name: page.name,
    ...(page.description ? { description: page.description } : {}),
    ...(page.image ? { primaryImageOfPage: { '@type': 'ImageObject', url: page.image, ...(c.ogImageAlt ? { caption: c.ogImageAlt } : {}) } } : {}),
  };
}

/*
 * Keyword ideas from a page's own words: the most repeated two- and three-word phrases, without filler words. Suggestions only, for the editor to
 * pick from; nothing is written into the page.
 */
const STOP = new Set(
  'a an and are as at be but by for from has have how i in is it its of on or our so that the their them then there these they this to us was we what when where which who will with you your can all any not no yes more most one two three new get use used also than into over per if do does'.split(
    ' ',
  ),
);
export function keywordIdeas(text: string, max = 8): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const count = new Map<string, number>();
  for (const n of [2, 3]) {
    for (let i = 0; i + n <= words.length; i++) {
      const g = words.slice(i, i + n);
      if (STOP.has(g[0]) || STOP.has(g[n - 1]) || g.some((w) => w.length < 2)) continue;
      const k = g.join(' ');
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  return [...count.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([k]) => k)
    .filter((k, _i, all) => !all.some((o) => o !== k && o.includes(k)))
    .slice(0, max);
}
