import { HUBS } from './seo/hubs';

/*
 * The categories a website listing is put in: the five template categories of the public site (their names are the options, for sellers and admins alike).
 * Listings saved before this under an older category (Restaurants, Stores...) keep working: they are still accepted and still land in the right category
 * page (lib/seo/hubs.ts `cats`), but are not offered any more.
 */
export const WEB_CATS: string[] = HUBS.map((h) => h.name);
const LEGACY = HUBS.flatMap((h) => h.cats).filter((c) => !WEB_CATS.includes(c));
export const isWebCat = (c: string) => WEB_CATS.includes(c) || LEGACY.includes(c);
/* The option a saved category is shown as: its own name, or the category an older value belongs to (Business when none claims it). */
export const webCatLabel = (c: string) => (WEB_CATS.includes(c) ? c : (HUBS.find((h) => h.cats.includes(c))?.name ?? HUBS.find((h) => h.slug === 'business')!.name));
