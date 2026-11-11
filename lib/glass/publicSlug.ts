/*
 * The public address of a website leaves out "template" and its fragments (owner, 2026-11-11: no "template" in addresses or the sitemap).
 * The database slug is never changed: /websites/<old slug> answers 301 to the clean one, and both find the same listing. The random ending
 * (-1qib) keeps every address unique.
 */
const FRAGMENT = /^tem(p(l(a(t(es?)?)?)?)?)?$/i;

export const publicSlug = (id: string): string => {
  const parts = id.split('-');
  if (!parts.some((w) => FRAGMENT.test(w))) return id; // nothing to drop: the address stays exactly as it is
  const clean = parts
    .filter((w) => !FRAGMENT.test(w))
    .join('-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return clean || id;
};
