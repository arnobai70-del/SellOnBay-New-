import { CONFIG, FEE_CUSTOM_TEXT, REVIEW_HOURS } from './config';
/* Developers you can hire. Starter profiles are made up for the prototype; real ones come from the dev_profiles table. */

export const LANGS = ['JavaScript', 'TypeScript', 'Python', 'PHP', 'Java', 'C#', 'Go', 'Dart', 'Swift', 'Kotlin', 'Ruby', 'Rust'] as const;
export const SKILLS = [
  'React',
  'Next.js',
  'Vue',
  'Node.js',
  'Laravel',
  'WordPress',
  'Shopify',
  'Django',
  'Flutter',
  'React Native',
  'Electron',
  'Tauri',
  'Tailwind',
  'Supabase',
  'Figma to code',
  'SEO',
  'APIs',
] as const;
export const AREAS = ['Websites', 'Web apps', 'Android apps', 'iPhone & iPad apps', 'Desktop apps', 'Online stores', 'Bug fixes', 'Customise a template'] as const;
export const LEVELS = ['New', 'Rising', 'Pro', 'Top developer'] as const;
export type DevLevel = (typeof LEVELS)[number];
export type Mastery = 'Expert' | 'Advanced' | 'Intermediate';
export const AVAIL = ['Available now', 'Busy for a week', 'Booked'] as const;
export type Avail = (typeof AVAIL)[number];

export type Pack = { name: 'Basic' | 'Standard' | 'Premium' | 'Trial'; price: number; days: number; blurb: string; features: string[] };
export type Review = { by: string; country: string; rating: number; text: string; when: string };
export type Dev = {
  id: string;
  name: string;
  headline: string;
  country: string;
  since: number;
  level: DevLevel;
  rating: number;
  reviews: number;
  orders: number;
  respond: string;
  avail: Avail;
  langs: string[];
  skills: { name: string; level: Mastery }[];
  areas: string[];
  bio: string;
  gig: string;
  hue: number;
  packs: Pack[];
  feedback: Review[];
  work: string[];
  fromDb?: boolean;
  trial?: { price: number; days: number }; // the developer's own trial package (dollars, days); otherwise one is worked out from Basic
  creditTrial?: boolean; // the trial fee is credited toward a full project within the credit window
  example?: boolean; // a made-up starter profile: no ratings, orders or reviews of its own, and cannot be hired on the live site
};

/* Basic / Standard / Premium: each tier lists only what it adds and says it includes the tier below. */
const packs = (a: [number, number, string, string[]], b: [number, number, string, string[]], c: [number, number, string, string[]]): Pack[] => [
  { name: 'Basic', price: a[0], days: a[1], blurb: a[2], features: a[3] },
  { name: 'Standard', price: b[0], days: b[1], blurb: b[2], features: ['Everything in Basic', ...b[3]] },
  { name: 'Premium', price: c[0], days: c[1], blurb: c[2], features: ['Everything in Standard', ...c[3]] },
];
const rv = (by: string, country: string, text: string, when: string, rating = 5): Review => ({ by, country, rating, text, when });

const STARTER_DEVS: Dev[] = [
  {
    id: 'aisha-rahman',
    name: 'Aisha Rahman',
    headline: 'I turn your chosen template into a store that sells',
    country: 'Bangladesh',
    since: 2021,
    level: 'Top developer',
    rating: 4.9,
    reviews: 212,
    orders: 340,
    respond: '1 hour',
    avail: 'Available now',
    langs: ['JavaScript', 'TypeScript', 'PHP'],
    skills: [
      { name: 'Shopify', level: 'Expert' },
      { name: 'Next.js', level: 'Expert' },
      { name: 'Tailwind', level: 'Advanced' },
      { name: 'SEO', level: 'Advanced' },
    ],
    areas: ['Online stores', 'Websites', 'Customise a template'],
    bio: 'Seven years building online shops. I take a ready-made site from SellOnBay, connect products, payments and shipping, and make it load fast. I explain every step in plain words and send a short video of the finished store.',
    gig: 'I will set up and customise your online store',
    hue: 12,
    work: ['shopline', 'pawprint'],
    packs: packs(
      [60, 2, 'Colours, logo and 10 products added', ['Brand colours and logo', 'Up to 10 products', 'Mobile check']],
      [140, 4, 'Payments, shipping and tax set up', ['Payment gateway', 'Shipping and tax rules', 'Speed fix']],
      [320, 7, 'Full store with SEO and two weeks of support', ['Product import, any size', 'SEO basics and sitemap', '14 days of support']],
    ),
    feedback: [
      rv('Daniel K.', 'United States', 'Bought a template, Aisha had my shop taking orders in three days. Clear updates all the way.', '2 weeks ago'),
      rv('Mei L.', 'Singapore', 'Fast and careful. She even fixed our slow product pages without being asked.', '1 month ago'),
      rv('Tom R.', 'United Kingdom', 'Great communication, delivered a day early.', '2 months ago'),
    ],
  },
  {
    id: 'lucas-ferreira',
    name: 'Lucas Ferreira',
    headline: 'Flutter developer: your app on Google Play and the App Store',
    country: 'Brazil',
    since: 2020,
    level: 'Top developer',
    rating: 5,
    reviews: 148,
    orders: 201,
    respond: '2 hours',
    avail: 'Available now',
    langs: ['Dart', 'Kotlin', 'Swift'],
    skills: [
      { name: 'Flutter', level: 'Expert' },
      { name: 'APIs', level: 'Advanced' },
      { name: 'Figma to code', level: 'Advanced' },
    ],
    areas: ['Android apps', 'iPhone & iPad apps', 'Customise a template'],
    bio: 'I ship mobile apps for a living. Give me an app template and your brand, and I will rebrand it, connect it to your backend and get it through store review. I handle TestFlight and Play internal testing for you.',
    gig: 'I will rebrand your app and publish it to the stores',
    hue: 150,
    work: [],
    packs: packs(
      [90, 3, 'Rebrand: name, icon, colours, splash screen', ['App name, icon and colours', 'Splash screen', 'Test build sent to you']],
      [220, 6, 'Plus your backend and push notifications', ['Connect your API', 'Push notifications', 'Store listing text']],
      [480, 10, 'Plus store submission on your accounts', ['Google Play submission', 'App Store submission', '30 days of fixes']],
    ),
    feedback: [
      rv('Sara A.', 'Canada', 'Lucas got our app through Apple review on the first try. Worth every dollar.', '1 week ago'),
      rv('Ben T.', 'Australia', 'Quick, honest, and he told me what would get rejected before we sent it.', '3 weeks ago'),
    ],
  },
  {
    id: 'priya-nair',
    name: 'Priya Nair',
    headline: 'Laravel and PHP: bookings, admin panels, custom features',
    country: 'India',
    since: 2019,
    level: 'Pro',
    rating: 4.8,
    reviews: 96,
    orders: 133,
    respond: '3 hours',
    avail: 'Busy for a week',
    langs: ['PHP', 'JavaScript', 'Python'],
    skills: [
      { name: 'Laravel', level: 'Expert' },
      { name: 'Vue', level: 'Advanced' },
      { name: 'WordPress', level: 'Advanced' },
      { name: 'APIs', level: 'Advanced' },
    ],
    areas: ['Web apps', 'Websites', 'Customise a template', 'Bug fixes'],
    bio: 'I add the parts a template does not have: booking, login, invoices, admin screens. Clean code, comments where it matters, and a hand-over call at the end.',
    gig: 'I will add booking, login or an admin panel to your site',
    hue: 270,
    work: ['clinic-desk', 'invoicer'],
    packs: packs(
      [70, 3, 'One small feature, such as a contact or booking form', ['One feature', 'Code comments']],
      [180, 6, 'Login plus a simple admin panel', ['User login', 'Admin panel', 'Email notifications']],
      [400, 12, 'Full booking or invoicing flow', ['Payments', 'Reports and export', 'Hand-over call and docs']],
    ),
    feedback: [
      rv('Anna M.', 'Germany', 'Added booking to our clinic site exactly how we described it.', '3 weeks ago'),
      rv('Hiro S.', 'Japan', 'Reliable, and the code was easy for our team to read.', '2 months ago', 4),
    ],
  },
  {
    id: 'marco-bianchi',
    name: 'Marco Bianchi',
    headline: 'Next.js and React: fast sites that rank',
    country: 'Italy',
    since: 2018,
    level: 'Top developer',
    rating: 4.9,
    reviews: 304,
    orders: 420,
    respond: '1 hour',
    avail: 'Available now',
    langs: ['TypeScript', 'JavaScript', 'Go'],
    skills: [
      { name: 'Next.js', level: 'Expert' },
      { name: 'React', level: 'Expert' },
      { name: 'Supabase', level: 'Advanced' },
      { name: 'SEO', level: 'Advanced' },
      { name: 'Tailwind', level: 'Expert' },
    ],
    areas: ['Websites', 'Web apps', 'Customise a template', 'Bug fixes'],
    bio: 'Front-end lead for eight years. I make a template feel custom: your content, your sections, perfect scores on speed. I also fix sites that were built too fast.',
    gig: 'I will customise your site and make it load in under a second',
    hue: 222,
    work: ['folio-studio', 'brickwork', 'leadform'],
    packs: packs(
      [80, 2, 'Content and colour changes, one page', ['Swap content and images', 'Brand colours', 'One page']],
      [190, 4, 'Up to five pages, speed and SEO fixes', ['Up to 5 pages', 'Speed audit and fixes', 'Meta tags and sitemap']],
      [420, 8, 'New sections, animations and analytics', ['Custom sections', 'Animations', 'Analytics and cookie banner']],
    ),
    feedback: [
      rv('Chloe D.', 'France', 'Our site went from 54 to 98 on PageSpeed. Marco explained everything.', '5 days ago'),
      rv('Raj P.', 'India', 'The fastest freelancer I have worked with.', '1 month ago'),
      rv('Lena W.', 'Netherlands', 'Perfect result, no back and forth needed.', '2 months ago'),
    ],
  },
  {
    id: 'sofia-morales',
    name: 'Sofia Morales',
    headline: 'WordPress rescue: fix, speed up, secure',
    country: 'Spain',
    since: 2017,
    level: 'Pro',
    rating: 4.8,
    reviews: 177,
    orders: 260,
    respond: '2 hours',
    avail: 'Available now',
    langs: ['PHP', 'JavaScript'],
    skills: [
      { name: 'WordPress', level: 'Expert' },
      { name: 'SEO', level: 'Advanced' },
      { name: 'Figma to code', level: 'Intermediate' },
    ],
    areas: ['Websites', 'Bug fixes', 'Customise a template'],
    bio: 'When a WordPress site breaks, is hacked, or crawls, I fix it. I also set up clean new WordPress sites from your design.',
    gig: 'I will fix, clean and speed up your WordPress site',
    hue: 330,
    work: [],
    packs: packs(
      [45, 1, 'One bug fixed', ['One bug or error fixed', 'Backup before changes']],
      [110, 3, 'Malware clean-up and update plugins', ['Malware scan and clean-up', 'Plugin and theme updates', 'Security hardening']],
      [260, 6, 'Full speed and security overhaul', ['Speed work, caching and images', 'Daily backups set up', '30 days of monitoring']],
    ),
    feedback: [
      rv('Peter G.', 'Ireland', 'My site was hacked on Friday and clean by Saturday morning. Lifesaver.', '1 week ago'),
      rv('Nora H.', 'Norway', 'Professional and kind. Everything works again.', '3 weeks ago'),
    ],
  },
  {
    id: 'kenji-watanabe',
    name: 'Kenji Watanabe',
    headline: 'Desktop apps with Electron and Tauri, Windows and Mac installers',
    country: 'Japan',
    since: 2019,
    level: 'Pro',
    rating: 4.9,
    reviews: 64,
    orders: 88,
    respond: '4 hours',
    avail: 'Available now',
    langs: ['Rust', 'TypeScript', 'C#'],
    skills: [
      { name: 'Tauri', level: 'Expert' },
      { name: 'Electron', level: 'Advanced' },
      { name: 'React', level: 'Advanced' },
    ],
    areas: ['Desktop apps', 'Customise a template', 'Bug fixes'],
    bio: 'I rebrand and extend desktop app templates, then build signed installers for Windows, macOS and Linux with auto-update.',
    gig: 'I will rebrand your desktop app and build the installers',
    hue: 40,
    work: [],
    packs: packs(
      [85, 3, 'Rebrand and one installer', ['Name, icon and colours', 'One OS installer']],
      [200, 6, 'All three operating systems with auto-update', ['Windows, macOS and Linux installers', 'Auto-update set up']],
      [450, 10, 'Plus signing, notarisation and a new feature', ['Code signing on your accounts', 'One custom feature', '30 days of fixes']],
    ),
    feedback: [rv('Oliver B.', 'United Kingdom', 'Three installers, all working, with auto-update. Exactly what we asked.', '2 weeks ago')],
  },
  {
    id: 'fatima-zahra',
    name: 'Fatima Zahra',
    headline: 'Python and Django: data tools, APIs and dashboards',
    country: 'Morocco',
    since: 2020,
    level: 'Rising',
    rating: 4.7,
    reviews: 41,
    orders: 57,
    respond: '3 hours',
    avail: 'Available now',
    langs: ['Python', 'JavaScript', 'Java'],
    skills: [
      { name: 'Django', level: 'Expert' },
      { name: 'APIs', level: 'Expert' },
      { name: 'Supabase', level: 'Intermediate' },
    ],
    areas: ['Web apps', 'Customise a template', 'Bug fixes'],
    bio: 'I build the backend your template is missing: APIs, data import, reports and dashboards.',
    gig: 'I will build the API and dashboard behind your app',
    hue: 190,
    work: ['invoicer', 'quotebot'],
    packs: packs(
      [65, 3, 'One API endpoint set', ['Up to 3 endpoints', 'API docs']],
      [160, 6, 'Database, auth and a simple dashboard', ['Database design', 'User auth', 'Simple dashboard']],
      [360, 11, 'Reports, export and deployment', ['Reports and CSV export', 'Deployment on your server', 'Hand-over call']],
    ),
    feedback: [rv('Jonas F.', 'Sweden', 'Solid API, tidy docs. Would hire again.', '1 month ago')],
  },
  {
    id: 'david-okafor',
    name: 'David Okafor',
    headline: 'React Native: one codebase, both stores',
    country: 'Nigeria',
    since: 2021,
    level: 'Rising',
    rating: 4.8,
    reviews: 52,
    orders: 70,
    respond: '2 hours',
    avail: 'Busy for a week',
    langs: ['TypeScript', 'JavaScript', 'Kotlin'],
    skills: [
      { name: 'React Native', level: 'Expert' },
      { name: 'Node.js', level: 'Advanced' },
      { name: 'Supabase', level: 'Advanced' },
    ],
    areas: ['Android apps', 'iPhone & iPad apps', 'Web apps'],
    bio: 'I build and rebrand React Native apps for startups. Fast iterations, a test build every two days, no surprises.',
    gig: 'I will customise your React Native app and ship test builds',
    hue: 100,
    work: [],
    packs: packs(
      [75, 3, 'Rebrand and test build', ['Rebrand', 'Android test build']],
      [190, 6, 'Plus login and your backend', ['iOS test build', 'Login', 'Backend connection']],
      [420, 11, 'Plus store submission', ['Store listings', 'Submission on your accounts', '30 days of fixes']],
    ),
    feedback: [rv('Grace N.', 'Kenya', 'David delivered test builds on time every time.', '2 weeks ago')],
  },
  {
    id: 'emily-chen',
    name: 'Emily Chen',
    headline: 'Designer who codes: Figma to a live, pixel-perfect site',
    country: 'Canada',
    since: 2018,
    level: 'Pro',
    rating: 4.9,
    reviews: 129,
    orders: 175,
    respond: '1 hour',
    avail: 'Available now',
    langs: ['JavaScript', 'TypeScript'],
    skills: [
      { name: 'Figma to code', level: 'Expert' },
      { name: 'Tailwind', level: 'Expert' },
      { name: 'React', level: 'Advanced' },
      { name: 'Vue', level: 'Intermediate' },
    ],
    areas: ['Websites', 'Customise a template'],
    bio: 'I match a design to the pixel and make it work on every screen. Perfect for turning a template into something that looks like only you.',
    gig: 'I will turn your Figma design into a fast responsive site',
    hue: 300,
    work: ['folio-studio', 'bioboard'],
    packs: packs(
      [70, 2, 'One page from your design', ['One page', 'Mobile layout']],
      [170, 5, 'Up to five pages with animation', ['Up to 5 pages', 'Hover and scroll animation']],
      [380, 9, 'Full site with CMS', ['Editable content (CMS)', 'Accessibility checks', '14 days of support']],
    ),
    feedback: [rv('Isabel R.', 'Mexico', 'Looks exactly like my design, and it is fast. Emily is a pro.', '4 days ago'), rv('Mark V.', 'United States', 'Great eye for detail.', '1 month ago')],
  },
  {
    id: 'tariq-hassan',
    name: 'Tariq Hassan',
    headline: 'Java and Kotlin: Android apps that last',
    country: 'Pakistan',
    since: 2022,
    level: 'New',
    rating: 4.6,
    reviews: 9,
    orders: 12,
    respond: '5 hours',
    avail: 'Available now',
    langs: ['Kotlin', 'Java'],
    skills: [
      { name: 'APIs', level: 'Advanced' },
      { name: 'Figma to code', level: 'Intermediate' },
    ],
    areas: ['Android apps', 'Bug fixes'],
    bio: 'New on SellOnBay, with four years of Android work. Special starter prices while I build my reviews.',
    gig: 'I will fix bugs and add features to your Android app',
    hue: 70,
    work: [],
    packs: packs(
      [30, 2, 'Fix one bug', ['One bug fixed', 'Short report']],
      [80, 4, 'One new screen or feature', ['One new screen', 'Test build']],
      [180, 8, 'Several features and a Play listing', ['Up to 3 features', 'Play Store listing help']],
    ),
    feedback: [rv('Yusuf A.', 'Turkey', 'Fixed a crash that three others could not find.', '2 weeks ago')],
  },
  {
    id: 'hannah-schmidt',
    name: 'Hannah Schmidt',
    headline: 'Security-minded full-stack: login, payments, GDPR basics',
    country: 'Germany',
    since: 2016,
    level: 'Top developer',
    rating: 5,
    reviews: 188,
    orders: 230,
    respond: '1 hour',
    avail: 'Booked',
    langs: ['TypeScript', 'Go', 'Python', 'Java'],
    skills: [
      { name: 'Node.js', level: 'Expert' },
      { name: 'Supabase', level: 'Expert' },
      { name: 'APIs', level: 'Expert' },
      { name: 'Next.js', level: 'Advanced' },
    ],
    areas: ['Web apps', 'Websites', 'Bug fixes'],
    bio: 'I make small products safe to launch: proper sign-in, payments that cannot be tampered with, and a privacy page that matches what the code does.',
    gig: 'I will review and secure your site before you launch',
    hue: 5,
    work: ['ironclad'],
    packs: packs(
      [95, 2, 'Security review with a written report', ['Review of login and forms', 'Written report']],
      [240, 5, 'Fixes for everything found', ['All high-risk fixes', 'Rate limits and headers']],
      [520, 9, 'Payments and privacy set up', ['Payments set up safely', 'Cookie and privacy basics', '30 days of support']],
    ),
    feedback: [rv('Sven L.', 'Denmark', 'She found two serious holes in our site. Fixed the same week.', '3 weeks ago'), rv('Amira K.', 'Egypt', 'Thorough and clear. Worth it.', '2 months ago')],
  },
  {
    id: 'carlos-mendez',
    name: 'Carlos Mendez',
    headline: 'Landing pages and funnels that convert',
    country: 'Argentina',
    since: 2020,
    level: 'Rising',
    rating: 4.7,
    reviews: 73,
    orders: 109,
    respond: '2 hours',
    avail: 'Available now',
    langs: ['JavaScript', 'PHP'],
    skills: [
      { name: 'Tailwind', level: 'Advanced' },
      { name: 'SEO', level: 'Advanced' },
      { name: 'WordPress', level: 'Intermediate' },
    ],
    areas: ['Websites', 'Customise a template'],
    bio: 'I focus on one thing: more visitors turning into customers. Copy tweaks, faster pages, clear buttons, tracking.',
    gig: 'I will tune your landing page to get more sign-ups',
    hue: 25,
    work: ['leadform'],
    packs: packs(
      [50, 2, 'Fix the top three problems', ['Page review', 'Top three fixes']],
      [120, 4, 'New sections and form tracking', ['New hero and sections', 'Form and click tracking']],
      [280, 7, 'A/B test and monthly report', ['One A/B test', 'Monthly report']],
    ),
    feedback: [rv('Julia P.', 'Chile', 'Sign-ups went up 31% in a month.', '2 weeks ago', 4)],
  },
];

/* The starter profiles are made up to show how hiring works: marked "Example", with no ratings, orders or written reviews (those would mislead buyers). */
export const DEVS: Dev[] = STARTER_DEVS.map((d) => ({ ...d, example: true, rating: 0, reviews: 0, orders: 0, feedback: [] }));

export const findDev = (id: string) => DEVS.find((d) => d.id === id);
export const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
export const fromPrice = (d: Dev) => Math.min(...d.packs.map((p) => p.price));
/* Fee on custom work is flat (see lib/config.ts); the buyer sees one price and the fee comes out of the developer's side. */
export const FEE_NOTE = `${FEE_CUSTOM_TEXT} service fee is taken from the developer, never added to your price.`;

/* A small paid test job before a bigger project: about a third of Basic, three days, same escrow and review as everything else. */
export const trialOf = (d: Pick<Dev, 'packs' | 'trial'>): Pack => {
  const basic = d.packs[0];
  const cap = CONFIG.trial.maxPriceCents / 100; // a trial is never more than $150 (lib/config.ts)
  const derived = Math.max(15, Math.round((basic.price * 0.35) / 5) * 5);
  const price = Math.min(cap, Math.max(1, d.trial?.price ?? derived));
  const days = Math.min(CONFIG.trial.maxDays, Math.max(CONFIG.trial.minDays, d.trial?.days ?? 3));
  return {
    name: 'Trial',
    price,
    days,
    blurb: 'A small test job to see how we work together',
    features: ['One small, clearly agreed task', `Delivered in ${days} days`, `Payment held in escrow, ${REVIEW_HOURS} hours to review`],
  };
};

/* A developer's own trial settings from the form. Both blank means "work it out for me". Price in whole dollars up to the cap, days 3 to 5. */
export function parseTrialInput(price: unknown, days: unknown): { ok: true; trial: { price: number; days: number } | null } | { ok: false; error: string } {
  const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
  if (blank(price) && blank(days)) return { ok: true, trial: null };
  const p = Number(price),
    d = Number(days);
  const cap = CONFIG.trial.maxPriceCents / 100;
  if (!Number.isInteger(p) || p < 5 || p > cap) return { ok: false, error: `The trial price must be a whole number from $5 to $${cap}.` };
  if (!Number.isInteger(d) || d < CONFIG.trial.minDays || d > CONFIG.trial.maxDays) return { ok: false, error: `A trial lasts ${CONFIG.trial.minDays} to ${CONFIG.trial.maxDays} days.` };
  return { ok: true, trial: { price: p, days: d } };
}

/* Starter developers who credit the trial fee toward a full project. Real developers choose this on their own profile. */
const STARTER_CREDIT = ['aisha-rahman', 'priya-nair', 'sofia-morales', 'fatima-zahra', 'emily-chen'];
export const creditsTrial = (d: Pick<Dev, 'id' | 'creditTrial'>) => d.creditTrial ?? STARTER_CREDIT.includes(d.id);
