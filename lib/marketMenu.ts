import { APP_CATS, DIGITAL_TOPICS, shelfHref, shelfLabel, type Platform } from './apps';
import { CATS } from './data';
import { REVIEW_HOURS } from './config';
import { AREAS } from './developers';
import { legacyPublic } from './legacy';
import { HUB_LINKS, hubLinkHref } from './seo/hubLinks';

/*
 * The category bar of the top bar, laid out by topic like the big asset marketplaces (owner, 2026-10-20):
 * the digital topics first (AI tools, video, audio, graphics, design templates, photos, 3D, fonts), then Web, Apps,
 * developers and help. Each entry opens a wide panel with a few groups of links and one feature card. Kept as plain data
 * so the top bar, the phone menu and the all-categories page show the same things, and so a test can check every link.
 */
export type MenuLink = [label: string, href: string];
export type MenuGroup = { title: string; all?: MenuLink; links: MenuLink[] };
export type MenuEntry = { key: string; label: string; href: string; groups: MenuGroup[]; feature?: { title: string; text: string; href: string; cta: string } };

const q = (href: string, k: string, v: string) => `${href}?${k}=${encodeURIComponent(v)}`;
const DIGITAL = shelfHref('digital');
export const topicHref = (key: string) => q(DIGITAL, 'topic', key);
const inTopic = (key: string, k: string, v: string) => `${topicHref(key)}&${k}=${encodeURIComponent(v)}`;

/* The apps a topic's files open in, sent to that topic's search. Plain names of the apps, never a logo. */
const WORKS_WITH: Record<string, string[]> = {
  ai: ['ChatGPT', 'Midjourney', 'ComfyUI', 'n8n', 'Make', 'Zapier'],
  'video-templates': ['Premiere Pro', 'After Effects', 'CapCut', 'DaVinci Resolve', 'Final Cut Pro'],
  graphics: ['Photoshop', 'Illustrator', 'Procreate', 'Canva'],
  'design-templates': ['Figma', 'Canva', 'PowerPoint', 'Keynote', 'Google Slides', 'InDesign'],
  '3d': ['Blender', 'Cinema 4D'],
};
/* What people look for in each topic. Short and plain, never a brand. */
const TOPIC_SEARCHES: Record<string, string[]> = {
  ai: ['Customer support bot', 'Lead follow-up', 'SEO writing', 'Product photos'],
  'video-templates': ['Logo reveal', 'Titles', 'Slideshow', 'YouTube intro', 'Transitions'],
  'stock-video': ['Nature', 'City', 'Business', 'Drone', 'Slow motion'],
  audio: ['Background music', 'Podcast intro', 'Cinematic', 'Whoosh', 'Lo-fi'],
  graphics: ['Icons', 'Illustrations', 'Textures', 'Brushes', 'Patterns'],
  'design-templates': ['Pitch deck', 'Flyer', 'Business card', 'Instagram post', 'UI kit'],
  photos: ['Business', 'Food', 'Travel', 'People', 'Office'],
  '3d': ['Characters', 'Rooms', 'Products', 'Low poly'],
  fonts: ['Serif', 'Sans serif', 'Script', 'Display', 'Handwritten'],
};

function topicEntry(t: (typeof DIGITAL_TOPICS)[number]): MenuEntry {
  const groups: MenuGroup[] = [
    { title: 'Kinds', all: [`All ${t.label.startsWith('AI') ? t.label : t.label.toLowerCase()}`, topicHref(t.key)], links: t.cats.map((c) => [c, inTopic(t.key, 'cat', c)]) },
  ];
  const works = WORKS_WITH[t.key];
  if (works) groups.push({ title: 'Works with', links: works.map((w) => [w, inTopic(t.key, 'q', w)]) });
  groups.push({ title: 'Popular searches', links: TOPIC_SEARCHES[t.key].map((s) => [s, inTopic(t.key, 'q', s)]) });
  return {
    key: t.key,
    label: t.label,
    href: topicHref(t.key),
    groups,
    feature: { title: 'Files the moment you pay', text: `Download through a private link with your own licence key, then check them for ${REVIEW_HOURS} hours.`, href: '/faq', cta: 'Read the FAQ' },
  };
}

const APP_SHELVES: Platform[] = ['android', 'ios', 'desktop'];

export const LEGACY_MENU: MenuEntry[] = [
  {
    key: 'templates',
    label: 'Templates',
    href: hubLinkHref(HUB_LINKS[0][0]),
    groups: [{ title: 'Website templates', all: ['Browse all sites', shelfHref('web')], links: HUB_LINKS.map(([slug, name]) => [name, hubLinkHref(slug)]) }],
    feature: { title: 'Live on your own domain', text: 'Pick a template, give your domain, and the seller puts it live with your name and words.', href: '/how-it-works', cta: 'How it works' },
  },
  ...DIGITAL_TOPICS.map(topicEntry),
  {
    key: 'web',
    label: 'Web',
    href: shelfHref('web'),
    groups: [
      {
        title: 'Websites by business',
        all: ['All websites', shelfHref('web')],
        links: CATS.filter((c) => c !== 'All').map((c) => [c, q(shelfHref('web'), 'cat', c)]),
      },
      {
        title: 'More for the web',
        links: [
          [shelfLabel('webapp'), shelfHref('webapp')],
          ['No-code templates', q(DIGITAL, 'cat', 'No-code templates')],
          ['Plugins', q(DIGITAL, 'cat', 'Plugins')],
          ['Scripts', q(DIGITAL, 'cat', 'Scripts')],
          ['Find a domain', '/domains'],
          ['Find your site', '/find'],
        ],
      },
      { title: 'Popular searches', links: ['Restaurant', 'Clinic', 'Portfolio', 'Online store', 'Booking'].map((s) => [s, q(shelfHref('web'), 'q', s)]) },
    ],
    feature: { title: 'Live on your own domain', text: 'Pick a site, give your domain, and the seller puts it live with your name and words.', href: '/how-it-works', cta: 'How it works' },
  },
  {
    key: 'apps',
    label: 'Apps',
    href: shelfHref('android'),
    groups: [
      { title: 'Shelves', links: [...APP_SHELVES, 'webapp' as Platform].map((pl) => [shelfLabel(pl), shelfHref(pl)]) },
      { title: 'Android by use', links: APP_CATS.slice(0, 6).map((c) => [c, q(shelfHref('android'), 'cat', c)]) },
      {
        title: 'Built with',
        links: [
          ['Flutter', q(shelfHref('android'), 'q', 'Flutter')],
          ['React Native', q(shelfHref('android'), 'q', 'React Native')],
          ['Kotlin', q(shelfHref('android'), 'q', 'Kotlin')],
          ['Swift', q(shelfHref('ios'), 'q', 'Swift')],
          ['Electron', q(shelfHref('desktop'), 'q', 'Electron')],
        ],
      },
    ],
    feature: { title: 'On your own store account', text: 'The seller sends a test build first, then helps you publish under your own account.', href: '/how-it-works', cta: 'How it works' },
  },
  {
    key: 'dev',
    label: 'Hire a developer',
    href: '/developers',
    groups: [
      { title: 'Kinds of work', all: ['All developers', '/developers'], links: AREAS.map((a) => [a, q('/developers', 'area', a)]) },
      {
        title: 'For developers',
        links: [
          ['Make a developer profile', '/developers/join'],
          ['How hiring works', '/how-it-works'],
        ],
      },
    ],
    feature: { title: 'Try before a big job', text: 'Every developer offers a small paid trial, held in escrow like any order.', href: '/developers', cta: 'Meet the developers' },
  },
  {
    key: 'help',
    label: 'Help',
    href: '/faq',
    groups: [
      {
        title: 'Buying',
        links: [
          ['How it works', '/how-it-works'],
          ['Questions and answers', '/faq'],
          ['Refunds', '/refunds'],
          ['All categories', '/categories'],
        ],
      },
      {
        title: 'Selling',
        links: [
          ['Sell on SellOnBay', '/sell'],
          ['Seller agreement', '/seller-agreement'],
          ['Acceptable use', '/acceptable-use'],
        ],
      },
      {
        title: 'More',
        links: [
          ['Blog', '/blog'],
          ['About SellOnBay', '/welcome'],
          ['Report abuse', '/report-abuse'],
        ],
      },
    ],
  },
];

/* Every place the menus can send someone, for the test that keeps them all inside the site. */
export const menuLinks = (m: MenuEntry[] = MARKET_MENU): MenuLink[] =>
  m.flatMap((e) => [[e.label, e.href] as MenuLink, ...e.groups.flatMap((g) => [...(g.all ? [g.all] : []), ...g.links]), ...(e.feature ? [[e.feature.cta, e.feature.href] as MenuLink] : [])]);

/* The public bar: exactly the five template categories, each a plain link (the first is the home page). The older bar stays above for a test server that keeps the old site. */
export const HUB_MENU: MenuEntry[] = HUB_LINKS.map(([slug, name]) => ({ key: slug, label: name, href: hubLinkHref(slug), groups: [] }));
export const MARKET_MENU: MenuEntry[] = legacyPublic() ? LEGACY_MENU : HUB_MENU;
