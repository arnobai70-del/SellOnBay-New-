import { shelfHref, shelfLabel, type Platform } from './apps';
import { BUGFIX_DAYS, CONFIG, REVIEW_HOURS } from './config';

/*
 * The short guide under each shelf: what these products are, who buys them and what comes with an order, then searches on the other shelves.
 * Plain words for buyers and search engines; every number comes from lib/config.ts.
 */
export type ShelfGuide = { what: string; who: string; included: string[] };

const days = `${CONFIG.delivery.minDays} to ${CONFIG.delivery.maxDays} days`;
const check = `${REVIEW_HOURS} hours to check it before the seller is paid`;

export const SHELF_GUIDE: Record<Platform, ShelfGuide> = {
  web: {
    what: 'Complete websites a developer built once and sells again and again. You pick one, give your domain, and the seller puts it live with your name, words and pictures.',
    who: 'Restaurants, clinics, shops, freelancers, small companies and anyone who needs a good site this week instead of a long project.',
    included: [
      `Live on your own domain in ${days}`,
      'Your name, logo, words and pictures',
      check,
      `${BUGFIX_DAYS} days of bug fixes after you accept`,
      'Optional setup help or customisation from the seller',
    ],
  },
  android: {
    what: 'Ready-made Android apps that the seller rebrands for you and publishes on your own Google Play account.',
    who: 'Gyms, restaurants, shops, coaches and small teams that want their own app without paying for one from scratch.',
    included: [`A test build in ${days}`, 'Your app name, icon and colours', 'Published under your own developer account', check, 'Google’s store review is separate from the delivery time'],
  },
  ios: {
    what: 'Ready-made iPhone and iPad apps, rebranded for you and sent to your own App Store account.',
    who: 'Businesses and creators who want an app on the App Store with their own brand.',
    included: [`A TestFlight build in ${days}`, 'Your app name, icon and colours', 'Published under your own developer account', check, 'Apple’s store review is separate from the delivery time'],
  },
  webapp: {
    what: 'Web apps such as dashboards, booking tools and invoice apps, deployed on your own domain.',
    who: 'Small companies and teams that need a working tool in the browser without building it themselves.',
    included: [`A private test link, then live on your domain in ${days}`, 'Your name and colours', check, 'Hosting is an optional extra'],
  },
  desktop: {
    what: 'Desktop apps for Windows, Mac and Linux, rebranded and sent to you as installers.',
    who: 'Teams and makers who need a tool that runs on the computer, with no store in between.',
    included: [`Installers for the systems you pick in ${days}`, 'Your name, icon and colours', 'Code signing uses your own accounts', check],
  },
  digital: {
    what: 'AI tools, video templates, stock video, music and sound effects, graphics, design templates, photos, 3D models, fonts, plugins and scripts. Files you use, not sites to put live.',
    who: 'Designers, marketers, founders and developers who want a head start on their next piece of work.',
    included: ['The files through a private link as soon as you pay', 'Your own licence key', check, 'Optional setup help from the seller'],
  },
};

/* Searches on the other shelves, so a visitor and a search engine can move across the store. */
const SEARCHES: Record<Platform, string[]> = {
  web: ['restaurant', 'portfolio', 'booking', 'online store'],
  android: ['fitness', 'food', 'habit'],
  ios: ['travel', 'budget', 'notes'],
  webapp: ['invoice', 'dashboard', 'booking'],
  desktop: ['timer', 'notes', 'finance'],
  digital: ['figma', 'notion', 'chatbot'],
};
const ORDER: Platform[] = ['web', 'android', 'ios', 'webapp', 'desktop', 'digital'];
/* "Android apps" -> "android apps", but "iPhone & iPad apps" keeps its capitals. */
export const lowerShelf = (pl: Platform) => {
  const l = shelfLabel(pl);
  return l.startsWith('iPhone') ? l : l[0].toLowerCase() + l.slice(1);
};

export const relatedSearches = (pl: Platform): [label: string, href: string][] =>
  ORDER.filter((o) => o !== pl).flatMap((o) => SEARCHES[o].map((w) => [`${w} ${lowerShelf(o)}`, `${shelfHref(o)}?q=${encodeURIComponent(w)}`] as [string, string]));
