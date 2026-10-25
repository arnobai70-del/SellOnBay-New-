import type { PageControls } from './controls';
import type { PageSeo } from './pageList';

/*
 * Problems an admin should fix, counted across the pages: the same canonical address, meta title or meta description on two pages, and pages with
 * no featured picture. Pure, so it is tested. These are plain counts of real conditions, not a ranking score.
 */
export type Warnings = {
  duplicateCanonical: { value: string; paths: string[] }[];
  duplicateTitle: { value: string; paths: string[] }[];
  duplicateDescription: { value: string; paths: string[] }[];
  noPicture: string[];
};

const dupes = (pairs: [string, string][]) => {
  const by = new Map<string, string[]>();
  for (const [path, value] of pairs) if (value) by.set(value, [...(by.get(value) ?? []), path]);
  return [...by.entries()].filter(([, p]) => p.length > 1).map(([value, paths]) => ({ value, paths }));
};

export function seoWarnings(paths: string[], controls: Record<string, PageControls>, seo: Record<string, PageSeo>): Warnings {
  return {
    duplicateCanonical: dupes(paths.map((p) => [p, controls[p]?.canonical ?? ''])),
    duplicateTitle: dupes(paths.map((p) => [p, (seo[p]?.title ?? '').trim().toLowerCase()])),
    duplicateDescription: dupes(paths.map((p) => [p, (seo[p]?.description ?? '').trim().toLowerCase()])),
    noPicture: paths.filter((p) => !controls[p]?.ogImage),
  };
}
