import type { CategoryCopy } from './categories';

/*
 * The five template hubs the SEO plan is built around: /templates/<slug>. Each is a category page with its own words (never one template with a
 * word swapped) that lists real seller listings only. Which listings appear is decided in lib/seo/hubStore.ts: an admin's choice first, then the
 * catalogue categories named in `cats`. The number shown per hub is a setting (default HUB_LIMIT), not a limit in the code.
 */
export const HUB_LIMIT = 8;
export const HUB_LIMIT_MAX = 12;

export type HubCopy = CategoryCopy & { cats: string[] };

/* The five categories sit under the home page: no link to the retired /browse shelf. */
const shelf = { shelfHref: '/', shelfName: 'Website templates', parent: { name: 'Website templates', href: '/' } } as const;

export const HUBS: HubCopy[] = [
  {
    slug: 'ecommerce',
    name: 'E-commerce Templates',
    group: 'templates',
    cats: ['E-commerce Templates', 'Stores'],
    ...shelf,
    title: 'E-commerce website templates',
    description: 'Ready-made online store websites with product pages, cart and checkout, put live on your own domain in 1 to 7 days. Payment is held until you accept.',
    h1: 'E-commerce website templates',
    intro: [
      'A shop site has one job: get a visitor from a product to a paid order without friction. The store templates here are built around that path, with clear product pages, a cart that is easy to find and a checkout that works on a phone.',
      'Each listing shows what the store includes and what the seller sets up for you. Pick one, give us your domain, and the seller puts it live with your name, products and words. Payment is held until you accept.',
    ],
    lookFor: [
      'Product pages with several pictures and clear options',
      'A cart and checkout that work on a phone',
      'How payments, shipping and tax are set up, and who does it',
      'A way to add and edit products without a developer',
    ],
    faq: [
      ['Can I add my own products?', 'Yes. Each store template says how products are added, and the seller can show you during setup.'],
      ['Does the template take payments?', 'The listing says which payment services it supports. Connecting your own payment account is part of the setup the seller helps with.'],
      ['Will it work on my own domain?', 'Yes. You give us the domain, or buy one here, and the seller connects it for you.'],
    ],
  },
  {
    slug: 'saas',
    name: 'SaaS & Startup Templates',
    group: 'templates',
    cats: ['SaaS & Startup Templates', 'Landing pages', 'Tools'],
    ...shelf,
    title: 'SaaS and startup website templates',
    description: 'Landing pages and product sites for software, apps and new companies, with pricing, features and sign-up sections, live on your domain in 1 to 7 days.',
    h1: 'SaaS and startup website templates',
    intro: [
      'A software or startup site has to explain a product in a few seconds and then ask for one action: a sign-up, a demo request or a purchase. These templates put the headline, the proof and that action on the first screens.',
      'Look for the sections you need: features, pricing, a short demo, customer words and a clear call to action. Each listing shows what is included. Pick one, give us your domain, and the seller puts it live with your own words.',
    ],
    lookFor: [
      'A headline and call to action above the fold',
      'Pricing and feature sections you can edit',
      'A sign-up or contact form that reaches your inbox',
      'Fast loading and a layout that holds up on a phone',
    ],
    faq: [
      ['Does it include the app itself?', 'No. These are the public website for your product. A listing says if it also includes a sign-in area or other app pages.'],
      ['Can I change the pricing section?', 'Yes. The pricing blocks are text you edit, and the seller can show you how during setup.'],
      ['Can I connect a sign-up form to my email tool?', 'The listing says which form and email services it works with. Ask the seller before you buy if you need a specific one.'],
    ],
  },
  {
    slug: 'business',
    name: 'Business & Corporate Templates',
    group: 'templates',
    cats: ['Business & Corporate Templates'],
    ...shelf,
    title: 'Business and corporate website templates',
    description: 'Professional websites for companies and firms, with services, team, contact and about pages, put live on your own domain in 1 to 7 days.',
    h1: 'Business and corporate website templates',
    intro: [
      'A company site is often the first check a new client makes. It should say what you do, who you are and how to reach you, and it should look like a business that will still be there next year.',
      'These templates cover the pages most firms need: services, about, team, news and contact. Each listing shows what is included. Pick one, give us your domain, and the seller puts it live with your name and words.',
    ],
    lookFor: ['Services and about pages that read clearly', 'A contact form and map that work', 'Pages for team, news or case studies', 'A professional look that stays consistent across pages'],
    faq: [
      ['Can I add more pages later?', 'Yes. The listing says how pages are added, and a customisation can add more for you.'],
      ['Is a contact form included?', 'Most listings include one that sends to your email. The listing says which.'],
      ['Who writes the text?', 'You do, or the seller can help as a paid customisation. The template shows where each piece goes.'],
    ],
  },
  {
    slug: 'portfolio',
    name: 'Portfolio & Agency Templates',
    group: 'templates',
    cats: ['Portfolio & Agency Templates', 'Portfolios'],
    ...shelf,
    title: 'Portfolio and agency website templates',
    description: 'Portfolio sites for freelancers, studios and agencies, with project galleries, case studies and contact forms, live on your own domain in 1 to 7 days.',
    h1: 'Portfolio and agency website templates',
    intro: [
      'A portfolio is judged by its work. The best templates stay out of the way: large pictures, quick loading and a simple route from a project to a message asking you to take the job.',
      'Here you find sites for solo creatives and for small studios and agencies, with project galleries, case study pages and an about page. Pick one, give us your domain, and the seller puts it live with your projects.',
    ],
    lookFor: ['Large, fast-loading project images', 'Case study pages with room for a story', 'An about page and a clear way to get in touch', 'A layout that suits your kind of work'],
    faq: [
      ['Can I show video as well as pictures?', 'Many listings support it. The listing says which media types the gallery handles.'],
      ['Can an agency use one template for a whole team?', 'Yes, if the listing has team or multi-author sections. Check the licence on the listing for how many sites you may use it on.'],
      ['Can I move my old projects over?', 'Yes. You add them yourself, or the seller can help as a paid customisation.'],
    ],
  },
  {
    slug: 'industry',
    name: 'Industry Website Templates',
    group: 'templates',
    cats: ['Industry Website Templates', 'Restaurants', 'Health', 'Real estate'],
    ...shelf,
    title: 'Industry website templates',
    description: 'Ready-made websites for restaurants, clinics, real estate and other local businesses, with the pages that trade needs, live on your own domain in 1 to 7 days.',
    h1: 'Industry website templates',
    intro: [
      'Different trades need different pages. A restaurant needs a menu and bookings, a clinic needs services and appointments, an estate agent needs listings and enquiries. These templates start from what that trade actually uses.',
      'Each listing names the business it is made for and shows what is included. Pick one, give us your domain, and the seller puts it live with your name, photos and words.',
    ],
    lookFor: [
      'Pages and sections made for your kind of business',
      'Booking, enquiry or ordering that reaches your inbox',
      'Opening hours, location and contact on the first screen',
      'Photos and content you can change yourself',
    ],
    faq: [
      ['How do I know a template fits my trade?', 'Each listing says which business it is for and lists its pages and features.'],
      ['Can I take bookings or orders?', 'Some listings include booking or ordering. The listing says what it has, and a customisation can add more.'],
      ['Will it work on my own domain?', 'Yes. You give us the domain, or buy one here, and the seller connects it for you.'],
    ],
  },
];

export const hubFor = (slug: string) => HUBS.find((h) => h.slug === slug);
/* The E-commerce category is the home page; the other four are /templates/<ending>. */
export const hubPath = (h: { slug: string }) => (h.slug === 'ecommerce' ? '/' : `/templates/${h.slug}`);
export const isHubPath = (path: string) => HUBS.some((h) => hubPath(h) === path);

/* A hub with fewer real listings than this stays out of search and the sitemap (so no thin page is submitted), but its page and menu link still work. */
export { MIN_PRODUCTS as HUB_MIN_INDEXED } from './categories';
