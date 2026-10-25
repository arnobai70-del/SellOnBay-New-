/* Domain search. The registrar (NameSilo or Namecheap, see CLAUDE.md step 4) is not connected yet, so availability here is a
   stable example computed from the name. Swap `lookup` for the real API call on the server; the page and the route do not change. */

/* The first eight are what checkout offers. The rest show up in the domain search. */
export const TLDS: [string, number][] = [
  ['.com', 14],
  ['.co', 29],
  ['.site', 6],
  ['.shop', 12],
  ['.online', 8],
  ['.io', 39],
  ['.app', 17],
  ['.net', 15],
];
export const MORE_TLDS: [string, number][] = [
  ['.org', 13],
  ['.store', 9],
  ['.dev', 14],
  ['.tech', 22],
  ['.studio', 19],
  ['.design', 26],
];
export const ALL_TLDS: [string, number][] = [...TLDS, ...MORE_TLDS];
export const TLD_KINDS: Record<string, string[]> = {
  '.com': ['Popular', 'Business'],
  '.co': ['Popular', 'Business'],
  '.net': ['Business'],
  '.org': ['Business'],
  '.site': ['Popular'],
  '.online': ['Popular'],
  '.shop': ['Shop'],
  '.store': ['Shop'],
  '.io': ['Tech'],
  '.app': ['Tech'],
  '.dev': ['Tech'],
  '.tech': ['Tech'],
  '.studio': ['Business'],
  '.design': ['Business'],
};

export type DomainResult = { domain: string; tld: string; price: number; available: boolean; kinds: string[] };

/* One label: letters, digits and hyphens, not starting or ending with a hyphen. */
export const cleanName = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/.?#]/)[0]
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
};

export const lookup = (name: string): DomainResult[] =>
  ALL_TLDS.map(([tld, price]) => ({
    domain: name + tld,
    tld,
    price,
    kinds: TLD_KINDS[tld] ?? [],
    // Short .com names are always gone; the rest follow the name so the same search gives the same answer.
    available: !(tld === '.com' && name.length < 5) && hash(name + tld) >= 28,
  }));

/* Legacy client-safe status: no live registrar is implemented yet. An env key is never proof of integration. */
export const registrarLive = () => false;
