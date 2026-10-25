import { PAGE_SEO_GOOD } from './pageList';

/*
 * The automatic SEO check (/dashboard/admin/seo/check): for every page and listing, what Google is given and what could be better.
 * Pure, so a test can run it; lib/seo/report.ts gathers the rows.
 */
export type SeoRow = { path: string; name: string; kind: 'page' | 'topic' | 'listing'; title: string; description: string; changed: boolean };
export type SeoFinding = { level: 'fix' | 'improve'; text: string };

export function seoFindings(rows: SeoRow[]): Map<string, SeoFinding[]> {
  const count = (k: 'title' | 'description', v: string) => rows.filter((r) => r[k].trim().toLowerCase() === v.trim().toLowerCase()).length;
  const out = new Map<string, SeoFinding[]>();
  for (const r of rows) {
    const f: SeoFinding[] = [];
    const t = r.title.trim();
    const d = r.description.trim();
    if (!t) f.push({ level: 'fix', text: 'No title.' });
    else if (t.length > PAGE_SEO_GOOD.title) f.push({ level: 'improve', text: `Title is ${t.length} characters; Google shows about ${PAGE_SEO_GOOD.title}.` });
    else if (t.length < 15) f.push({ level: 'improve', text: 'Title is very short; say what the page offers.' });
    if (!d) f.push({ level: 'fix', text: 'No description: Google picks some text from the page.' });
    else if (d.length > PAGE_SEO_GOOD.description) f.push({ level: 'improve', text: `Description is ${d.length} characters; Google shows about ${PAGE_SEO_GOOD.description}.` });
    else if (d.length < 70) f.push({ level: 'improve', text: 'Description is short; 120 to 160 characters work best.' });
    if (t && count('title', t) > 1) f.push({ level: 'fix', text: 'Another page has the same title.' });
    if (d && count('description', d) > 1) f.push({ level: 'fix', text: 'Another page has the same description.' });
    out.set(r.path, f);
  }
  return out;
}
