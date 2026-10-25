/* How alike two texts are, 0 to 1: overlap of their three-word groups. 1 means the same words in the same order. (Used to check that category pages do not repeat each other.) */
const shingles = (t: string) => {
  const w = t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(w.slice(i, i + 3).join(' '));
  return out;
};
export function similarity(a: string, b: string): number {
  const x = shingles(a),
    y = shingles(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const s of x) if (y.has(s)) both++;
  return both / (x.size + y.size - both);
}
