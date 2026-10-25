import { BRAND_NAME } from '../brand';
import { DIGITAL_TOPICS } from '../apps';
import { HUBS, hubPath } from './hubs';
import { BUGFIX_DAYS, REVIEW_HOURS, SELLER_KEEP_TEXT } from '../config';

/*
 * The public pages whose title and description an admin can change at /dashboard/admin/seo/pages, with the built-in words each page uses
 * when nothing is saved. Product pages, category pages and blog posts have their own words; the home page has its own form.
 * Pages read this through pageMetadata() in lib/seo/pageMeta.ts.
 */
/*
 * `words`: the page's own heading and intro an admin can rewrite (and, with body: true, the whole text of a policy page).
 * These built-in words are what the page shows when nothing is saved; the page reads them from here through pageWords() in lib/seo/pageWords.ts.
 * An intro left out here means the page writes its own (it depends on something live, like the domain page).
 */
export type WordsSpec = { heading: string; intro?: string; body?: boolean };
export type SeoPage = { path: string; name: string; title: string; description: string; words?: WordsSpec };

/* A topic page's address: the digital shelf with ?topic= (also its canonical address). */
export const topicPath = (key: string) => `/apps/digital?topic=${key}`;

export const SEO_PAGES: SeoPage[] = [
  {
    path: '/welcome',
    name: 'About (welcome)',
    title: 'Websites and apps ready for your domain',
    description: `${BRAND_NAME} sells ready-made websites, apps and digital files. Pick one, give your domain, and the seller puts it live, paid into escrow.`,
  },
  {
    path: '/browse',
    name: 'Browse websites',
    title: 'Browse sites',
    description: 'Ready-made websites you can put on your own domain in 1 to 7 days. Filter by what you do, price, speed and rating, and compare side by side.',
  },
  { path: '/apps/android', name: 'Android apps', title: 'Android apps', description: 'Ready-made Android apps, rebranded and published to your own Google Play account in 1 to 7 days.' },
  { path: '/apps/ios', name: 'iPhone & iPad apps', title: 'iPhone & iPad apps', description: 'Ready-made iPhone and iPad apps, rebranded and sent to your own App Store account in 1 to 7 days.' },
  { path: '/apps/web', name: 'Web apps', title: 'Web apps', description: 'Ready-made web apps, rebranded and deployed on your own domain in 1 to 7 days.' },
  { path: '/apps/desktop', name: 'Desktop apps', title: 'Desktop apps', description: 'Ready-made desktop apps for Windows, Mac and Linux, rebranded and sent as installers in 1 to 7 days.' },
  {
    path: '/apps/digital',
    name: 'Digital products',
    title: 'Digital products',
    description: 'Figma kits, no-code templates, plugins, scripts, AI automations, chatbots, prompts and video templates. Files right after payment, money held in escrow until you accept.',
  },
  // One page per topic of the category bar (AI tools, Audio, Fonts...): the digital shelf narrowed to that topic.
  // The E-commerce category is the home page, which has its own settings, so it is not listed here.
  ...HUBS.filter((h) => h.slug !== 'ecommerce').map((h) => ({
    path: hubPath(h),
    name: `${h.name} (category)`,
    title: h.title,
    description: h.description,
    words: { heading: h.h1, intro: h.intro.join(' ') },
  })),
  ...DIGITAL_TOPICS.map((t) => ({ path: topicPath(t.key), name: `${t.label} (topic)`, title: t.label, description: t.lead })),
  {
    path: '/categories',
    name: 'All categories',
    title: 'All categories',
    description: 'Every shelf and category on SellOnBay: websites, apps, AI tools, video, audio, graphics, design templates, photos, 3D, fonts, developers and domains.',
  },
  {
    path: '/developers',
    name: 'Hire a developer',
    title: 'Hire a developer',
    description: 'Hire a developer to customise your template, fix a bug or build a feature. Fixed prices, payment held until you accept.',
  },
  {
    path: '/developers/join',
    name: 'Become a developer',
    title: 'Become a developer',
    description: `Make a developer profile on ${BRAND_NAME}: your languages, skills and three fixed packages, paid through escrow when buyers accept your work.`,
    words: {
      heading: 'Create your developer profile',
      intro: 'Buyers filter by language and skill, so be specific. Prices are fixed per package, and payment is held in escrow until the buyer accepts.',
    },
  },
  {
    path: '/domains',
    name: 'Domains',
    title: 'Domain name ideas',
    description: 'Explore domain name ideas. Live registrar availability, registration and purchase are not yet connected.',
    words: { heading: 'Find a domain people remember' },
  },
  {
    path: '/find',
    name: 'Find your site',
    title: 'Find your site',
    description: 'Tell us what you do and get the best matching sites straight away.',
    words: { heading: 'Tell us what you do. We pick your site.', intro: 'One click. No sign-up, no long form.' },
  },
  {
    path: '/how-it-works',
    name: 'How it works',
    title: 'How it works',
    description: 'Pick a site, add your domain, review it, then accept. Your money waits until the site works.',
    words: { heading: 'Pick a site. Add your domain. Go live.', intro: 'Here is exactly what happens, from your first click to the day the seller gets paid.' },
  },
  {
    path: '/faq',
    name: 'Questions and answers',
    title: 'Questions and answers',
    description: `Short answers about buying and selling on ${BRAND_NAME}: escrow, delivery times, refunds, disputes, domains and payouts.`,
    words: { heading: 'Questions people ask', intro: 'Short answers about buying, selling, money and safety.' },
  },
  {
    path: '/sell',
    name: 'Sell a site',
    title: `Sell on ${BRAND_NAME}`,
    description: `Upload the site you built once and sell it again and again. You keep ${SELLER_KEEP_TEXT} of every sale.`,
    words: { heading: 'Sell the site you already built.', intro: `Upload it once and deliver it to every buyer. You keep ${SELLER_KEEP_TEXT} of every sale, paid every week.` },
  },
  {
    path: '/blog',
    name: 'Blog',
    title: 'Blog',
    description: `Guides on choosing, launching and growing a website, from the ${BRAND_NAME} team.`,
    words: { heading: 'Guides and news', intro: `Guides on choosing, launching and growing a website, from the ${BRAND_NAME} team.` },
  },
  {
    path: '/tools/site-ideas',
    name: 'Free site ideas tool',
    title: 'Free website idea and domain name generator',
    description: 'Type your business in one line. Get five pages your website needs, ten domain names to try, and ready-made sites that fit. Free, no sign-up.',
    words: {
      heading: 'Website ideas and domain names, free',
      intro:
        'Tell us what your business does in one line. We give you five pages your site should have, ten domain names to try, and ready-made sites that fit. Suggestions currently come from predefined templates, not a live AI model.',
    },
  },
  {
    path: '/terms',
    name: 'Terms of service',
    title: 'Terms of service',
    description: `The terms for buying and selling on ${BRAND_NAME}: accounts, orders, escrow, delivery, reviews, disputes and what each side agrees to.`,
    words: { heading: 'Terms of service', body: true },
  },
  {
    path: '/privacy',
    name: 'Privacy policy',
    title: 'Privacy policy',
    description: `What ${BRAND_NAME} stores about you and why, how long we keep it, who we share it with, and how to export or delete your data.`,
    words: { heading: 'Privacy policy', body: true },
  },
  {
    path: '/refunds',
    name: 'Refunds',
    title: 'Refunds',
    description: `When you can get your money back on ${BRAND_NAME}: the ${REVIEW_HOURS}-hour check, the ${BUGFIX_DAYS}-day bug-fix guarantee and disputes with evidence.`,
    words: { heading: 'Refunds', body: true },
  },
  {
    path: '/acceptable-use',
    name: 'Acceptable use',
    title: 'Acceptable use',
    description: `What you may and may not sell or do on ${BRAND_NAME}: banned content, harmful code, copied work, spam, and how the rules are enforced.`,
    words: { heading: 'Acceptable use', body: true },
  },
  {
    path: '/seller-agreement',
    name: 'Seller agreement',
    title: 'Seller agreement',
    description: `The agreement for selling on ${BRAND_NAME}: what you promise, licences, stock media releases, fees, payouts and what happens after a sale.`,
    words: { heading: 'Seller agreement', body: true },
  },
  {
    path: '/dmca',
    name: 'Copyright complaints',
    title: 'Copyright complaints',
    description: `How to report copied work on ${BRAND_NAME}, what a copyright complaint must include, and how a seller can answer it.`,
    words: { heading: 'Copyright complaints', body: true },
  },
  {
    path: '/report-abuse',
    name: 'Report abuse',
    title: 'Report abuse',
    description: `Report a site, listing or account on ${BRAND_NAME} that looks like phishing, fraud or stolen work. We review every report.`,
    words: { heading: 'Report abuse', intro: `Tell us about a site hosted through ${BRAND_NAME} that looks like phishing, fraud or stolen work. We review every report.` },
  },
];

export const seoPage = (path: string) => SEO_PAGES.find((p) => p.path === path);

/* Limits for what an admin saves: Google shows about 60 and 160 characters. */
export const PAGE_SEO_MAX = { title: 70, description: 170 } as const;
export const PAGE_SEO_GOOD = { title: 60, description: 160 } as const;

export type PageSeo = { title: string; description: string };
export function pageSeoProblem(v: PageSeo): string | null {
  if (typeof v.title !== 'string' || typeof v.description !== 'string') return 'Send a title and a description.';
  if (v.title.trim().length > PAGE_SEO_MAX.title) return `The title can have up to ${PAGE_SEO_MAX.title} characters.`;
  if (v.description.trim().length > PAGE_SEO_MAX.description) return `The description can have up to ${PAGE_SEO_MAX.description} characters.`;
  if (/[<>]/.test(v.title + v.description)) return 'Leave out < and >.';
  return null;
}

/* Limits for the page words an admin saves. */
export const PAGE_WORDS_MAX = { heading: 120, intro: 400, body: 30_000 } as const;

export type PageWordsInput = { heading: string; intro: string; body: string };
export function pageWordsProblem(v: PageWordsInput, spec?: WordsSpec): string | null {
  if (typeof v.heading !== 'string' || typeof v.intro !== 'string' || typeof v.body !== 'string') return 'Send a heading, an intro and a text.';
  if (!spec) return 'That page has no words to change here.';
  if (v.heading.trim().length > PAGE_WORDS_MAX.heading) return `The heading can have up to ${PAGE_WORDS_MAX.heading} characters.`;
  if (/\n/.test(v.heading.trim())) return 'Keep the heading on one line.';
  if (v.intro.trim().length > PAGE_WORDS_MAX.intro) return `The intro can have up to ${PAGE_WORDS_MAX.intro} characters.`;
  if (v.body.length > PAGE_WORDS_MAX.body) return `The page text can have up to ${PAGE_WORDS_MAX.body.toLocaleString('en-US')} characters.`;
  if (v.body.trim() && !spec.body) return 'This page has no page text to change, only its heading and intro.';
  if (/[<>]/.test(v.heading + v.intro)) return 'Leave out < and > in the heading and intro.';
  return null;
}
