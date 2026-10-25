import type { MenuEntry } from './marketMenu';

/*
 * Which category-bar entries show, and in what order (set by an admin at /dashboard/admin/seo/navigation). Pure and small enough for the top bar.
 * An entry is only hidden, never deleted: its pages still work and it comes back when shown again. Help can never be hidden.
 */
export type NavConfig = { hidden: string[]; order: string[] };
export const NAV_DEFAULT: NavConfig = { hidden: [], order: [] };
export const NAV_LOCKED = ['ecommerce', 'help']; // the home page entry (and, on the old bar, support) always stays

export function cleanNav(raw: unknown, known: string[]): NavConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && known.includes(x)) : []);
  const uniq = (a: string[]) => a.filter((x, i) => a.indexOf(x) === i);
  return { hidden: uniq(list(o.hidden)).filter((k) => !NAV_LOCKED.includes(k)), order: uniq(list(o.order)) };
}

/* The menu to show: saved order first (keys not listed keep their place after), hidden entries left out. */
export function applyNav(menu: MenuEntry[], cfg: NavConfig): MenuEntry[] {
  const rank = (k: string) => {
    const i = cfg.order.indexOf(k);
    return i < 0 ? cfg.order.length + menu.findIndex((m) => m.key === k) : i;
  };
  return menu.filter((e) => !cfg.hidden.includes(e.key)).sort((a, b) => rank(a.key) - rank(b.key));
}
