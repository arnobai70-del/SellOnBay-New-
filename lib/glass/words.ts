/*
 * The word the owner removed from visible text (2026-11-07) is still in many listing names and descriptions, and those rows are the owner's and sellers' own, so they are
 * not edited. Public pages show them through this instead: the stored text stays as it is, and sellers and admins still see and edit what they wrote. Pure and tested.
 */
type Listing = { name: string; desc: string; inc: string[]; tag: string };

const CAP = (s: string) => /^[A-Z]/.test(s);
export function plainWords(text: string): string {
  return text
    .replace(/\b(website|site)\s+(template)(s?)\b/gi, (_m, w: string, t: string, s: string) => (CAP(t) || CAP(w) ? 'Website' : 'website') + s)
    .replace(/\btemplate(s?)\b/gi, (m, s: string) => (CAP(m) ? 'Website' : 'website') + s)
    .replace(/\b(website)\s+\1\b/gi, '$1');
}

/* A copy of a listing with its public words cleaned. Everything else, the address included, is untouched. */
export const publicListing = <T extends Listing>(p: T): T => ({ ...p, name: plainWords(p.name), desc: plainWords(p.desc), inc: p.inc.map(plainWords), tag: plainWords(p.tag) });
