import images from './site-images.json';
import type { LicenceType, ThirdParty } from './licences';
import { CONFIG } from './config';

/* Demo data. Replaced by Supabase queries in step 2. */

export type ThemeKey = 'restaurant' | 'clinic' | 'portfolio' | 'store' | 'saas' | 'estate' | 'gym' | 'tutor' | 'pet' | 'tool' | 'bio' | 'quote';

export type Theme = {
  a: string;
  b: string;
  bg: string;
  tx: string;
  v: 'v1' | 'v2' | 'v3' | 'v4';
  brand: string;
  h: string;
  p: string;
  cta: string;
  nav: string[];
  dark?: boolean;
  ac?: string;
};

export const THEMES: Record<ThemeKey, Theme> = {
  restaurant: {
    a: '#E4572E',
    b: '#FFD9A8',
    bg: '#FFF6EA',
    tx: '#2B1608',
    v: 'v1',
    brand: 'Saffron Table',
    h: 'Dinner worth the wait',
    p: "Book a table and see tonight's menu.",
    cta: 'Book now',
    nav: ['Menu', 'Story', 'Visit'],
  },
  clinic: {
    a: '#0E9F76',
    b: '#BFEBDD',
    bg: '#F2FBF8',
    tx: '#07271E',
    v: 'v3',
    brand: 'Clinic Desk',
    h: 'Care that fits your day',
    p: 'Pick a doctor and a time in two taps.',
    cta: 'Book visit',
    nav: ['Doctors', 'Services', 'Contact'],
  },
  portfolio: {
    a: '#111111',
    b: '#EDEDED',
    bg: '#FFFFFF',
    tx: '#111111',
    v: 'v2',
    brand: 'Folio Studio',
    h: 'Design that gets noticed',
    p: 'Selected work from the last five years.',
    cta: 'See work',
    nav: ['Work', 'About', 'Hire me'],
  },
  store: { a: '#2B3DFF', b: '#D6DCFF', bg: '#F4F6FF', tx: '#0F1330', v: 'v4', brand: 'Shopline', h: 'New this season', p: '', cta: 'Shop', nav: ['Shop', 'Sale', 'Cart'] },
  saas: {
    a: '#7A3CFF',
    b: '#E3D6FF',
    bg: '#14102B',
    tx: '#FFFFFF',
    v: 'v1',
    brand: 'Leadform',
    h: 'Turn visitors into leads',
    p: 'Forms, follow-ups and a waitlist in one page.',
    cta: 'Join waitlist',
    nav: ['Features', 'Pricing', 'Login'],
    dark: true,
  },
  estate: {
    a: '#C2410C',
    b: '#FBD9C0',
    bg: '#FFF8F2',
    tx: '#2A1305',
    v: 'v3',
    brand: 'Brickwork',
    h: 'Find a home you will love',
    p: 'Browse listings and book a viewing.',
    cta: 'View homes',
    nav: ['Buy', 'Rent', 'Agents'],
  },
  gym: {
    a: '#FFB52E',
    b: '#2B2F55',
    bg: '#0F1330',
    tx: '#FFFFFF',
    v: 'v1',
    brand: 'Ironclad Gym',
    h: 'Train hard. Join today.',
    p: 'Memberships, classes and trainers.',
    cta: 'Join now',
    nav: ['Classes', 'Trainers', 'Join'],
    dark: true,
    ac: '#0F1330',
  },
  tutor: {
    a: '#F0476B',
    b: '#FFD3DC',
    bg: '#FFF5F7',
    tx: '#2D0A14',
    v: 'v2',
    brand: 'Tutorly',
    h: 'Learn with a real tutor',
    p: 'Book a lesson, pay once, start today.',
    cta: 'Find a tutor',
    nav: ['Subjects', 'Tutors', 'Login'],
  },
  pet: {
    a: '#0891B2',
    b: '#C6EEF7',
    bg: '#F0FBFE',
    tx: '#07262E',
    v: 'v3',
    brand: 'Pawprint',
    h: 'Happy pets, happy you',
    p: 'Grooming and boarding, booked online.',
    cta: 'Book a stay',
    nav: ['Services', 'Prices', 'Book'],
  },
  tool: {
    a: '#12B886',
    b: '#CBF3E5',
    bg: '#F4FCF9',
    tx: '#06281E',
    v: 'v1',
    brand: 'Invoicer',
    h: 'Invoices in ten seconds',
    p: 'Create, send and track payment.',
    cta: 'Create invoice',
    nav: ['Features', 'Pricing', 'Login'],
  },
  bio: {
    a: '#FF5C7A',
    b: '#FFE0E6',
    bg: '#FFFFFF',
    tx: '#1A0A10',
    v: 'v2',
    brand: 'Bioboard',
    h: 'All your links, one page',
    p: 'A simple page for your profile.',
    cta: 'Create yours',
    nav: ['Home', 'Pricing', 'Login'],
  },
  quote: { a: '#2563EB', b: '#D5E3FF', bg: '#F5F8FF', tx: '#0B1B3D', v: 'v4', brand: 'QuoteBot', h: 'Quotes in minutes', p: '', cta: 'Get a quote', nav: ['How it works', 'Pricing', 'Login'] },
};

export type Product = {
  id: string;
  name: string;
  theme: ThemeKey;
  cat: string;
  price: number;
  seller: string;
  rating: number;
  reviews: number;
  sold: number;
  days: number;
  tag: string;
  desc: string;
  inc: string[];
  added: string; // ISO date the listing went live
  /* Where the full demo lives. 'upload' is a site we host from the seller's zip, 'url' is the seller's own live demo link. */
  demo?: { type: 'upload' | 'url'; src: string };
  /* What the site does, as FEATURES keys. Listings without it fall back to their category (see doesFeature). */
  does?: string[];
  /* Mobile apps. Websites leave these out (platform is then 'web'). */
  platform?: 'web' | 'android' | 'ios' | 'webapp' | 'desktop' | 'digital';
  stack?: string;
  app?: AppSpec;
  shots?: string[]; // seller-supplied screenshots, shown instead of the drawn mock-up
  sample?: string; // public link to a free sample
  trial?: boolean; // the seller offers a limited trial copy (the file itself is private)
  licence?: LicenceType;
  thirdParty?: ThirdParty;
  express?: number; // dollars, the seller offers 24-hour express delivery
  repo?: boolean; // handed over by inviting the buyer's GitHub account instead of a download
  /* Digital products: what the buyer is told up front (see lib/productInfo.ts). Days run from the purchase; 0 means none. */
  docsUrl?: string;
  /* A seller's listing in the database: its row id and its seller. Starter listings have neither. */
  dbId?: string;
  sellerId?: string;
  /* What the seller charges on top for the two paid packages, in dollars. Missing means the default; 0 means the seller does not offer it. */
  setupPrice?: number;
  customPrice?: number;
  requirements?: string;
  supportDays?: number;
  updateDays?: number;
  /* A made-up starter listing that shows how the shop works: no ratings, sales or seller of its own, and not for sale on the live site. */
  example?: boolean;
};

/* What a drawn app mock-up shows (see AppScreen). */
export type AppSpec = {
  accent: string;
  bg: string;
  ink: string;
  glyph: string;
  headline: string;
  metric: { label: string; value: string; pct: number };
  rows: [string, string][];
  bars: number[];
  cta: string;
  tabs: string[];
};

const STARTER_SITES: Product[] = [
  {
    id: 'saffron-table',
    name: 'Saffron Table',
    theme: 'restaurant',
    cat: 'Restaurants',
    price: 39,
    seller: 'Mira Chen',
    rating: 4.8,
    reviews: 112,
    sold: 214,
    days: 1,
    tag: 'Menu, bookings',
    desc: 'A warm restaurant site with a menu, photo gallery and a table booking form that emails you every request.',
    inc: [
      'Home, menu, gallery and contact pages',
      'Table booking form with email alerts',
      'Google Maps and opening hours',
      'Works on phones and tablets',
      'Basic SEO and social preview',
      'Editable from one settings file',
    ],
    added: '2026-10-02',
    does: ['book'],
  },
  {
    id: 'clinic-desk',
    name: 'Clinic Desk',
    theme: 'clinic',
    cat: 'Health',
    price: 59,
    seller: 'Arif Hossain',
    rating: 4.9,
    reviews: 87,
    sold: 141,
    days: 2,
    tag: 'Appointments',
    desc: 'A calm, trustworthy site for clinics and solo doctors with doctor profiles and online appointment requests.',
    inc: ['Doctor profiles and service pages', 'Appointment request form', 'Patient privacy page', 'Opening hours and map', 'Works on every screen size', 'Fast load, good accessibility'],
    added: '2026-09-28',
    does: ['book'],
  },
  {
    id: 'folio-studio',
    name: 'Folio Studio',
    theme: 'portfolio',
    cat: 'Portfolios',
    price: 19,
    seller: 'Noor Rahman',
    rating: 4.7,
    reviews: 203,
    sold: 530,
    days: 1,
    tag: 'Designers, writers',
    desc: 'A clean one-page portfolio for designers, photographers and writers. Add your work, change colours, publish.',
    inc: ['Project grid with detail pages', 'About and contact sections', 'Dark and light mode', 'Contact form', 'Fast, lightweight pages', 'Simple content file'],
    added: '2026-08-15',
    does: ['show'],
  },
  {
    id: 'shopline',
    name: 'Shopline',
    theme: 'store',
    cat: 'Stores',
    price: 79,
    seller: 'Tomás Rivera',
    rating: 4.6,
    reviews: 64,
    sold: 98,
    days: 3,
    tag: 'Cart, checkout',
    desc: 'A small online store with a product catalog, cart and checkout that connects to your payment account.',
    inc: ['Product catalog and categories', 'Cart and checkout', 'Payment account connection', 'Order emails', 'Discount codes', 'Admin page for products'],
    added: '2026-09-10',
    does: ['sell'],
  },
  {
    id: 'leadform',
    name: 'Leadform',
    theme: 'saas',
    cat: 'Landing pages',
    price: 29,
    seller: 'Priya Nair',
    rating: 4.8,
    reviews: 149,
    sold: 377,
    days: 1,
    tag: 'Waitlist',
    desc: 'A sharp landing page for a new product with pricing, FAQ and a waitlist that saves every signup.',
    inc: ['Hero, features, pricing and FAQ', 'Waitlist with email export', 'Analytics-ready', 'Dark theme', 'Sections you can reorder', 'Contact form'],
    added: '2026-10-05',
    does: ['leads'],
  },
  {
    id: 'brickwork',
    name: 'Brickwork',
    theme: 'estate',
    cat: 'Real estate',
    price: 69,
    seller: 'Samir Khan',
    rating: 4.5,
    reviews: 41,
    sold: 73,
    days: 3,
    tag: 'Listings',
    desc: 'Property listings with filters, photo galleries and a viewing request form for small agencies.',
    inc: ['Listing pages with galleries', 'Search and filters', 'Viewing request form', 'Agent profiles', 'Map for each listing', 'Admin page for listings'],
    added: '2026-07-30',
    does: ['book'],
  },
  {
    id: 'ironclad',
    name: 'Ironclad Gym',
    theme: 'gym',
    cat: 'Health',
    price: 45,
    seller: 'Leo Park',
    rating: 4.7,
    reviews: 58,
    sold: 120,
    days: 2,
    tag: 'Memberships',
    desc: 'A bold gym site with class timetable, trainer profiles and a membership sign-up form.',
    inc: ['Class timetable', 'Trainer profiles', 'Membership plans', 'Sign-up form', 'Photo gallery', 'Instagram feed block'],
    added: '2026-08-22',
    does: ['book'],
  },
  {
    id: 'tutorly',
    name: 'Tutorly',
    theme: 'tutor',
    cat: 'Landing pages',
    price: 35,
    seller: 'Hana Sato',
    rating: 4.8,
    reviews: 72,
    sold: 166,
    days: 2,
    tag: 'Lessons',
    desc: 'A friendly site for tutors and small schools with subject pages and lesson booking.',
    inc: ['Subject and tutor pages', 'Lesson booking form', 'Pricing table', 'Reviews section', 'Blog starter', 'Contact form'],
    added: '2026-09-25',
    does: ['book'],
  },
  {
    id: 'pawprint',
    name: 'Pawprint',
    theme: 'pet',
    cat: 'Landing pages',
    price: 25,
    seller: 'Mira Chen',
    rating: 4.6,
    reviews: 39,
    sold: 88,
    days: 1,
    tag: 'Pet care',
    desc: 'A cheerful site for groomers, sitters and vets with price list and booking requests.',
    inc: ['Service and price pages', 'Booking request form', 'Gallery', 'Opening hours and map', 'Reviews section', 'Contact page'],
    added: '2026-09-02',
    does: ['book'],
  },
  {
    id: 'invoicer',
    name: 'Invoicer',
    theme: 'tool',
    cat: 'Tools',
    price: 49,
    seller: 'Arif Hossain',
    rating: 4.9,
    reviews: 95,
    sold: 210,
    days: 3,
    tag: 'Micro-SaaS',
    desc: 'A tiny invoicing tool with client list, PDF invoices and payment status. Ready to run under your own domain.',
    inc: ['Client list and invoice builder', 'PDF download', 'Paid and unpaid status', 'Email sending', 'Account sign-in', 'Simple settings page'],
    added: '2026-10-04',
    does: ['run'],
  },
  {
    id: 'bioboard',
    name: 'Bioboard',
    theme: 'bio',
    cat: 'Tools',
    price: 9,
    seller: 'Noor Rahman',
    rating: 4.4,
    reviews: 301,
    sold: 940,
    days: 1,
    tag: 'Link in bio',
    desc: 'One page for all your links with themes, icons and click counts.',
    inc: ['Unlimited links', 'Themes and icons', 'Click counts', 'Custom domain ready', 'Fast loading', 'Social preview image'],
    added: '2026-06-18',
    does: ['show'],
  },
  {
    id: 'quotebot',
    name: 'QuoteBot',
    theme: 'quote',
    cat: 'Tools',
    price: 55,
    seller: 'Priya Nair',
    rating: 4.7,
    reviews: 33,
    sold: 61,
    days: 3,
    tag: 'AI quotes',
    desc: 'An AI quote generator for contractors. Customers describe the job and get a priced estimate you approve.',
    inc: ['Customer request form', 'AI-written estimate drafts', 'You approve before sending', 'Price list settings', 'Email to customer', 'Admin view of requests'],
    added: '2026-09-30',
    does: ['leads', 'run'],
  },
];

/*
 * The starter listings are made up to show how the shop works. They are marked "Example", carry no ratings, sales or seller name
 * of their own (made-up numbers would mislead buyers), and cannot be bought on the live site (see lib/examples.ts).
 */
export const asExample = (p: Product): Product => ({ ...p, example: true, rating: 0, reviews: 0, sold: 0, seller: 'SellOnBay example' });
export const PRODUCTS: Product[] = STARTER_SITES.map(asExample);

/* Listings added on or after this date show the New badge. A fixed date keeps server and browser output identical. */
export const NEW_SINCE = '2026-09-30';
export const isNew = (p: Product) => p.added >= NEW_SINCE;

/* What a site does, for the "What it does" filter on /browse. */
export const FEATURES: { key: string; label: string; test: RegExp }[] = [
  { key: 'book', label: 'Bookings', test: /book|appointment|lesson|member|viewing|table/i },
  { key: 'sell', label: 'Selling products', test: /cart|checkout|store|shop|catalog/i },
  { key: 'show', label: 'Showing work', test: /portfolio|work|gallery|link/i },
  { key: 'leads', label: 'Collecting leads', test: /waitlist|lead|quote|sign-?up|form/i },
  { key: 'run', label: 'Small tool', test: /invoice|tool|saas|account|pdf|ai/i },
];
const CAT_DOES: Record<string, string[]> = { Restaurants: ['book'], Health: ['book'], Portfolios: ['show'], Stores: ['sell'], 'Landing pages': ['leads'], 'Real estate': ['book'], Tools: ['run'] };
export const doesFeature = (p: Product, key: string) => (p.does ?? CAT_DOES[p.cat] ?? []).includes(key);

export const CATS = ['All', 'Restaurants', 'Health', 'Portfolios', 'Stores', 'Landing pages', 'Real estate', 'Tools'];

export const money = (n: number) => '$' + n.toLocaleString('en-US');
export const daysLabel = (d: number) => (d === 1 ? '1 day' : '1-' + d + ' days');
export const findProduct = (id?: string | null) => PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];

/* Pricing add-ons shown on the product and checkout pages */
export const PKG = { asis: 0, setup: CONFIG.packages.defaultSetupCents / 100, custom: CONFIG.packages.defaultCustomCents / 100 } as const; // the defaults
export type Pkg = keyof typeof PKG;
export const isPkg = (v: unknown): v is Pkg => typeof v === 'string' && v in PKG;
/* What a package costs on top of the price of THIS listing, in dollars; 0 for "as is" and for a package the seller does not offer. */
export const pkgCost = (p: Pick<Product, 'setupPrice' | 'customPrice'>, k: Pkg): number => (k === 'asis' ? 0 : k === 'setup' ? (p.setupPrice ?? PKG.setup) : (p.customPrice ?? PKG.custom));
export const pkgOffered = (p: Pick<Product, 'setupPrice' | 'customPrice'>, k: Pkg) => k === 'asis' || pkgCost(p, k) > 0;

export type SiteImage = { src: string; width: number; height: number };

/* AI preview image (portrait) for a site, or undefined to fall back to the drawn preview. Added with scripts/import-site-images.mjs. */
export const imageFor = (id: string): SiteImage | undefined => (images as Record<string, SiteImage>)[id];

/* A cropped photo from a listing's AI preview, used inside the drawn site mock-ups (hero, preview dialog).
   focus is how far down the portrait image the face or dish sits, as a fraction. */
const SHOWCASE: Partial<Record<ThemeKey, { id: string; focus: number }>> = {
  restaurant: { id: 'saffron-table', focus: 0.72 },
  clinic: { id: 'clinic-desk', focus: 0.42 },
  portfolio: { id: 'folio-studio', focus: 0.47 },
  store: { id: 'shopline', focus: 0.3 },
  gym: { id: 'ironclad', focus: 0.35 },
  saas: { id: 'leadform', focus: 0.42 },
  tutor: { id: 'tutorly', focus: 0.44 },
  pet: { id: 'pawprint', focus: 0.5 },
  tool: { id: 'invoicer', focus: 0.72 },
  quote: { id: 'quotebot', focus: 0.4 },
};
/* The listing whose picture stands for a demo style (used for the phone in the hero). */
export const showcaseId = (theme: ThemeKey) => SHOWCASE[theme]?.id;
export type Photo = { src: string; y: number };
export function photoFor(theme: ThemeKey): Photo | undefined {
  const c = SHOWCASE[theme];
  const img = c && imageFor(c.id);
  if (!c || !img) return undefined;
  const win = 0.24; // visible share of the image height inside the mock-up
  return { src: img.src, y: Math.min(100, Math.max(0, ((c.focus - win / 2) / (1 - win)) * 100)) };
}
