import 'server-only';
import { ALL_PRODUCTS, platformOf } from '../apps';
import { getLiveDbProducts } from '../catalog';
import { showExamples } from '../examples';
import type { Product } from '../data';
import { CATEGORIES, MIN_PRODUCTS, type CategoryCopy } from './categories';

/* The real products behind a category page: the starter listings plus every live seller listing of the right kind and category. */
export async function productsIn(c: CategoryCopy): Promise<Product[]> {
  const platform = c.group === 'websites' ? 'web' : 'digital';
  const pool = [...((await showExamples()) ? ALL_PRODUCTS : []), ...(await getLiveDbProducts(platform))];
  const seen = new Set<string>();
  return pool.filter((p) => platformOf(p) === platform && p.cat === c.name && !seen.has(p.id) && !!seen.add(p.id));
}

/* Only categories with enough real products get a page (and a line in the sitemap). */
export async function categoryPages(): Promise<{ copy: CategoryCopy; count: number }[]> {
  const out: { copy: CategoryCopy; count: number }[] = [];
  for (const copy of CATEGORIES) {
    const count = (await productsIn(copy)).length;
    if (count >= MIN_PRODUCTS) out.push({ copy, count });
  }
  return out;
}
