/*
 * The free "site ideas and domain names" tool (spec 11). This file is pure: it turns a one-line idea into five site ideas and ten domain name
 * suggestions, and finds the ready-made products that fit. It is also what the fake AI provider answers with until a real model and its key exist,
 * so the page, the caps and the cache all work and can be tested today.
 */
import type { Product } from '../data';

export type Idea = { title: string; why: string };
export type Ideas = { ideas: Idea[]; names: string[] };

const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'for',
  'of',
  'in',
  'on',
  'my',
  'our',
  'your',
  'to',
  'with',
  'i',
  'we',
  'want',
  'need',
  'make',
  'build',
  'create',
  'start',
  'open',
  'run',
  'sell',
  'selling',
  'business',
  'company',
  'shop',
  'new',
  'online',
  'small',
  'local',
  'is',
  'are',
  'at',
  'from',
  'that',
  'this',
  'it',
  'be',
  'as',
  'by',
  'like',
  'get',
]);
export const words = (idea: string) =>
  idea
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

/* Which kind of business it sounds like, from words we know. Order matters: the first group that matches wins. */
const KINDS: { kind: string; match: RegExp; ideas: [string, string][] }[] = [
  {
    kind: 'food',
    match: /(bakery|cafe|coffee|restaurant|food|catering|pizza|burger|kitchen|chef|cake|bar|tea)/,
    ideas: [
      ['A menu page with prices and photos', 'Hungry visitors decide in seconds, so the menu is the first thing they should see.'],
      ['Online table booking', 'Fewer phone calls, fewer no-shows, and bookings while you sleep.'],
      ['A catering and events page', 'Group orders are worth much more than a single meal.'],
    ],
  },
  {
    kind: 'health',
    match: /(clinic|doctor|dentist|dental|health|therapy|therapist|physio|yoga|fitness|gym|wellness|salon|spa|barber)/,
    ideas: [
      ['Appointment booking with reminders', 'The most common reason people visit a health or beauty site is to book.'],
      ['A team and services page', 'People want to see who they will meet and what it costs before they come.'],
      ['Patient or client reviews', 'Trust decides, especially for a first visit.'],
    ],
  },
  {
    kind: 'creative',
    match: /(photo|photographer|designer|design|portfolio|artist|video|film|writer|freelance|studio|music|band)/,
    ideas: [
      ['A portfolio gallery of your best 8 pieces', 'Show the best work first and nothing else.'],
      ['A simple "hire me" page with your prices', 'Clients who can see a price ask better questions.'],
      ['A short about page with your story', 'People hire people. A face and two honest paragraphs help.'],
    ],
  },
  {
    kind: 'store',
    match: /(store|boutique|clothes|clothing|fashion|jewel|handmade|craft|gift|product|ecommerce|e-commerce|merch)/,
    ideas: [
      ['A small online store with 10 products', 'Start small, learn what sells, then grow the catalogue.'],
      ['A page for each collection', 'Easy browsing turns visitors into buyers.'],
      ['A clear shipping and returns page', 'Doubts about delivery stop more sales than price does.'],
    ],
  },
  {
    kind: 'property',
    match: /(real estate|property|realtor|rental|apartment|house|homes|estate|airbnb|landlord)/,
    ideas: [
      ['A listings page with filters', 'Buyers and renters search by area, price and size.'],
      ['A "book a viewing" form', 'Every enquiry you capture is a possible deal.'],
      ['A neighbourhood guide', 'Useful local pages bring people from search.'],
    ],
  },
  {
    kind: 'tutor',
    match: /(tutor|teach|teacher|course|class|lesson|school|coach|coaching|training|learn)/,
    ideas: [
      ['A page for each course or lesson type', 'Students look for exactly what they need, with a price and a time.'],
      ['Online booking for a first session', 'A low-pressure first step brings new students.'],
      ['Student results and testimonials', 'Proof that it works is the best sales page.'],
    ],
  },
  {
    kind: 'saas',
    match: /(app|saas|software|tool|platform|startup|ai|automation|agency|consult|service)/,
    ideas: [
      ['A one-page site that says what it does and for whom', 'Visitors leave if they cannot tell in five seconds.'],
      ['A pricing section with two or three plans', 'Clear prices make it easier to say yes.'],
      ['A waiting list or free trial sign-up', 'Collect interested people from day one.'],
    ],
  },
];
const GENERIC: [string, string][] = [
  ['A clear home page: what you do, who it is for, how to reach you', 'This is the page almost everyone sees first.'],
  ['A services or products page with prices', 'People trust what they can see and compare.'],
  ['A contact form and a map or hours', 'Make the next step obvious and easy.'],
];
const EXTRA: [string, string][] = [
  ['A short "about us" page with a real photo', 'It turns a stranger into someone they can trust.'],
  ['Customer reviews on the home page', 'Other people saying it is good works better than you saying it.'],
  ['A blog or news page, once a month', 'Fresh pages help people find you through search.'],
];

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export function generateIdeas(idea: string): Ideas {
  const ws = words(idea);
  const text = idea.toLowerCase();
  const kind = KINDS.find((k) => k.match.test(text));
  const pool = [...(kind?.ideas ?? GENERIC), ...(kind ? GENERIC.slice(0, 1) : []), ...EXTRA];
  const subject = ws.length ? ws.slice(0, 3).map(cap).join(' ') : 'Your business';
  const ideas: Idea[] = pool.slice(0, 5).map(([title, why]) => ({ title, why }));
  while (ideas.length < 5) ideas.push({ title: `A page about ${subject}`, why: 'One clear page for the thing people ask about most.' });

  // Names: the main word, the main two words, with a few common friendly additions. Letters and digits only, 3 to 30 characters.
  const a = ws[0] ?? 'mybusiness',
    b = ws[1] ?? '';
  const base = [a + b, a, b ? a + '-' + b : '', 'get' + a, a + 'hq', a + 'studio', 'my' + a, 'the' + a, a + 'online', a + 'now', 'hello' + a, a + 'co', 'go' + a, a + 'place'];
  const names: string[] = [];
  for (const n of base) {
    const clean = n.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
    if (clean.length >= 3 && clean.length <= 30 && !names.includes(clean)) names.push(clean);
  }
  let i = 1;
  while (names.length < 10) names.push(`${a.replace(/[^a-z0-9]/g, '') || 'site'}${++i}`);
  return { ideas, names: names.slice(0, 10) };
}

/* The ready-made products that fit the idea best: more shared words in the name, tag and category count most. At least three, always. */
export function matchProducts(idea: string, products: Pick<Product, 'id' | 'name' | 'cat' | 'tag' | 'desc' | 'sold' | 'price'>[], count = 3) {
  const ws = new Set(words(idea).flatMap((w) => [w, w.replace(/s$/, '')]));
  const score = (p: Pick<Product, 'name' | 'cat' | 'tag' | 'desc'>) => {
    const title = words(`${p.name} ${p.cat} ${p.tag}`);
    const body = words(p.desc);
    let s = 0;
    for (const w of title) if (ws.has(w) || ws.has(w.replace(/s$/, ''))) s += 3;
    for (const w of body) if (ws.has(w) || ws.has(w.replace(/s$/, ''))) s += 1;
    return s;
  };
  return [...products]
    .map((p) => ({ p, s: score(p) }))
    .sort((x, y) => y.s - x.s || y.p.sold - x.p.sold)
    .slice(0, count)
    .map((x) => x.p);
}
