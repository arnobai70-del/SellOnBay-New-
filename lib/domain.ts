/* Turns whatever a person types into a clean domain and a brand name for previews. */
export const cleanDomain = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '');

export const brandFromDomain = (d: string) => {
  const w = (d.split('.')[0] || 'your name').replace(/[-_]+/g, ' ').trim();
  return w.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Your Name';
};
