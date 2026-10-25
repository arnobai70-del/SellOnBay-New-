import { shelfHref, shelfLabel, type Platform } from './apps';
import { legacyPublic } from './legacy';

/* The shelves a search can go to: the page address and its name. */
const ORDER: Platform[] = ['web', 'android', 'ios', 'webapp', 'desktop', 'digital'];
export const SHELF_OPTIONS: [href: string, label: string][] = [['/search', 'Everything'], ...(legacyPublic() ? ORDER.map((pl) => [shelfHref(pl), shelfLabel(pl)] as [string, string]) : [])];
