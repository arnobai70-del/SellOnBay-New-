import 'server-only';
import { adminOnly } from '../admin/guard';
import { draftOf, publishedOf } from '../cms/docStore';
import { arrange, EMPTY_DOC, fill, pageByKey, type PageDoc } from './registry';

/*
 * The words of a public page (owner, 2026-11-08): what an admin published at Admin › Content › Pages, else the built-in words in
 * lib/content/registry.ts. With `draft`, a Content admin sees the saved draft (the live preview in the editor). Placeholders such as {keep} are
 * filled from lib/config.ts, so numbers always match the rules. Live data (listings, prices, sellers) never comes from here.
 */
export type Copy = {
  t: (section: string, field: string, fallback?: string) => string;
  lines: (section: string, field: string) => string[];
  order: string[];
  shown: (section: string) => boolean;
  seo: PageDoc['seo'];
  preview: boolean;
};

export async function pageCopy(key: string, draft = false): Promise<Copy> {
  const def = pageByKey(key);
  let doc: PageDoc = EMPTY_DOC;
  let preview = false;
  try {
    if (draft && (await adminOnly('content')).ok) {
      const d = await draftOf<PageDoc>(`page:${key}`);
      if (d) {
        doc = d.data;
        preview = true;
      }
    }
    if (!preview) doc = (await publishedOf<PageDoc>(`page:${key}`))?.data ?? EMPTY_DOC;
  } catch {
    doc = EMPTY_DOC; // a database problem shows the built-in words
  }
  const field = (s: string, f: string) => def?.sections.find((x) => x.key === s)?.fields.find((x) => x.key === f);
  const t = (s: string, f: string, fallback = '') => fill(doc.text?.[`${s}.${f}`] || field(s, f)?.default || fallback);
  return {
    t,
    lines: (s, f) =>
      t(s, f)
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    order: def ? arrange(def, { ...EMPTY_DOC, ...doc }) : [],
    shown: (s) => !(doc.hidden ?? []).includes(s),
    seo: { ...EMPTY_DOC.seo, ...doc.seo },
    preview,
  };
}
