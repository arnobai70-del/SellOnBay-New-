import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { LanguagesForm, TranslationEditor, type Row } from '@/components/i18n/AdminForms';
import { hasScope } from '@/lib/admin/scopes';
import { publicWebsites } from '@/lib/glass/catalog';
import { bundled, englishCatalog, missingKeys } from '@/lib/i18n/catalog';
import { BUILTIN, isPublicPath, SOURCE } from '@/lib/i18n/config';
import { SEO_PAGES } from '@/lib/seo/pageList';
import { forgetLanguages, languageSettings } from '@/lib/i18n/settingsRead';
import { draftWords, publishedWords } from '@/lib/i18n/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Language Management', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['languages', 'Languages'],
  ['translations', 'Translations'],
  ['products', 'Product words'],
  ['seo', 'Page SEO'],
  ['missing', 'Missing translations'],
] as const;
const PAGE = 40;
const AREAS: [string, string][] = [
  ['', 'Everything'],
  ['nav.', 'Top bar'],
  ['footer.', 'Footer'],
  ['menu.', 'Dashboard menus'],
  ['page.home.', 'Home page'],
  ['page.', 'Other pages'],
  ['aff.', 'Affiliate page'],
  ['cookie.', 'Cookie notice'],
  ['lang.', 'Language choice'],
  ['banner.', 'Banners'],
];

/*
 * Admin › Language Management (owner, 2026-11-12): turn languages on and off, publish them, order and name them, set the default, add or remove a
 * language; edit every word with English beside it (draft, then publish); product names, descriptions and SEO words per language; and what is
 * still missing. Changes apply without a redeploy. The language list needs a Super Admin; words need Content or Super.
 */
export default async function LanguagesAdmin({ searchParams }: { searchParams: Promise<{ tab?: string; lang?: string; area?: string; filter?: string; page?: string; q?: string; slug?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/languages', roles: ['admin'], scope: ['content', 'super'] });
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'languages';
  forgetLanguages();
  const s = await languageSettings();
  const superAdmin = !viewer || hasScope(viewer.scopes ?? [], 'super');
  const others = s.languages.filter((l) => l.code !== SOURCE);
  const lang = others.find((l) => l.code === sp.lang)?.code ?? others[0]?.code ?? '';
  const en = englishCatalog();
  const link = (q: Record<string, string>) => `/admin/languages?${new URLSearchParams({ tab, lang, ...q })}`;

  let body: React.ReactNode = null;
  if (tab === 'languages') {
    body = superAdmin ? (
      <LanguagesForm initial={s.languages} defaultLang={s.defaultLang} builtin={BUILTIN.map((b) => b.code)} />
    ) : (
      <p className="muted">Only a Super Admin can change the language list. You can edit translations.</p>
    );
  } else if (tab === 'missing') {
    const rows = await Promise.all(
      others.map(async (l) => {
        const [pub, bundle] = await Promise.all([publishedWords(l.code), bundled(l.code)]);
        const missing = missingKeys(pub, bundle, en);
        return { l, total: Object.keys(en).length, edits: Object.keys(pub).filter((k) => en[k]).length, missing };
      }),
    );
    body = (
      <div className="tbl" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Language</th>
              <th>Status</th>
              <th>Words</th>
              <th>Admin edits</th>
              <th>Missing (English shown)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ l, total, edits, missing }) => (
              <tr key={l.code}>
                <td>
                  {l.name} ({l.native})
                </td>
                <td>
                  <span className={`status ${l.enabled && l.published ? 'st-ok' : 'st-draft'}`}>{!l.enabled ? 'Off' : l.published ? 'Published' : 'Draft (hidden)'}</span>
                </td>
                <td>{total}</td>
                <td>{edits}</td>
                <td>{missing.length}</td>
                <td>
                  <Link className="btn sm ghost" href={`/admin/languages?${new URLSearchParams({ tab: 'translations', lang: l.code, filter: 'missing' })}`} prefetch={false}>
                    Translate
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (lang) {
    const [pub, draft, bundle] = await Promise.all([publishedWords(lang), draftWords(lang), bundled(lang)]);
    const current = (k: string): Row => {
      const v = draft[k] ?? pub[k] ?? bundle[k] ?? '';
      const source: Row['source'] = draft[k] !== undefined ? 'draft' : pub[k] !== undefined ? 'published' : bundle[k] ? 'bundled' : 'missing';
      return { key: k, english: en[k] ?? '', value: v, source };
    };
    let rows: Row[];
    let slugs: { id: string; name: string }[] = [];
    if (tab === 'seo') {
      // the search-engine title and description of each public page, per language (the English ones are edited at Admin › SEO)
      rows = SEO_PAGES.filter((pg) => isPublicPath(pg.path)).flatMap((pg) =>
        (['title', 'description'] as const).map((f): Row => {
          const k = `seo.${pg.path}.${f}`;
          return {
            key: k,
            english: f === 'title' ? pg.title : pg.description,
            value: draft[k] ?? pub[k] ?? '',
            source: draft[k] !== undefined ? 'draft' : pub[k] !== undefined ? 'published' : 'missing',
          };
        }),
      );
    } else if (tab === 'products') {
      slugs = (await publicWebsites().catch(() => [])).map((w) => ({ id: w.id, name: w.name }));
      const slug = slugs.find((x) => x.id === sp.slug)?.id ?? slugs[0]?.id ?? '';
      const p = (await publicWebsites().catch(() => [])).find((w) => w.id === slug);
      rows = slug
        ? (['name', 'description', 'seoTitle', 'seoDescription'] as const).map((f) => {
            const k = `product.${slug}.${f}`;
            const v = draft[k] ?? pub[k] ?? '';
            const english = f === 'name' ? (p?.name ?? '') : f === 'description' ? (p?.desc ?? '') : f === 'seoTitle' ? `${p?.name ?? ''} · SellOnBay` : (p?.desc ?? '').slice(0, 160);
            return { key: k, english, value: v, source: draft[k] !== undefined ? 'draft' : pub[k] !== undefined ? 'published' : 'missing' };
          })
        : [];
    } else {
      const area = AREAS.find(([k]) => k === sp.area)?.[0] ?? '';
      const q = (sp.q ?? '').toLowerCase().slice(0, 80);
      rows = Object.keys(en)
        .filter((k) => k.startsWith(area) && (area !== 'page.' || !k.startsWith('page.home.')))
        .map(current)
        .filter((r) => (sp.filter === 'missing' ? r.source === 'missing' : sp.filter === 'draft' ? r.source === 'bundled' || r.source === 'draft' : true))
        .filter((r) => !q || r.key.toLowerCase().includes(q) || r.english.toLowerCase().includes(q) || r.value.toLowerCase().includes(q));
    }
    const page = Math.max(1, Number(sp.page) || 1);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    const shown = rows.slice((page - 1) * PAGE, page * PAGE);
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <form method="get" action="/admin/languages" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input type="hidden" name="tab" value={tab} />
          <label className="field">
            Language
            <select className="input" name="lang" defaultValue={lang}>
              {others.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.native}){l.enabled && l.published ? '' : ' · draft'}
                </option>
              ))}
            </select>
          </label>
          {tab === 'seo' ? null : tab === 'products' ? (
            <label className="field">
              Website
              <select className="input" name="slug" defaultValue={sp.slug ?? slugs[0]?.id}>
                {slugs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="field">
                Part of the site
                <select className="input" name="area" defaultValue={sp.area ?? ''}>
                  {AREAS.map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Show
                <select className="input" name="filter" defaultValue={sp.filter ?? ''}>
                  <option value="">All words</option>
                  <option value="missing">Missing only</option>
                  <option value="draft">Machine drafts and unpublished edits</option>
                </select>
              </label>
              <label className="field">
                Search
                <input className="input" name="q" defaultValue={sp.q ?? ''} />
              </label>
            </>
          )}
          <button className="btn sm ghost" type="submit">
            Show
          </button>
        </form>
        <div className="tag" style={{ margin: 0 }}>
          {rows.length} words{pages > 1 ? ` · page ${page} of ${pages}` : ''}. Keep every {'{placeholder}'} as it is. Draft words and machine drafts reach visitors only after you publish and the
          language itself is published.
        </div>
        <TranslationEditor key={`${tab}-${lang}-${sp.slug ?? ''}-${page}`} lang={lang} rows={shown} hasDraft={Object.keys(draft).length > 0} multiline={tab === 'products'} />
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Array.from({ length: pages }, (_, n) => n + 1).map((n) => (
              <Link key={n} className={`btn sm ${n === page ? '' : 'ghost'}`} href={link({ area: sp.area ?? '', filter: sp.filter ?? '', q: sp.q ?? '', page: String(n) })} prefetch={false}>
                {n}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  } else body = <p className="muted">Add a language first.</p>;

  return (
    <AdminShell viewer={viewer} active="languages" file="admin-settings" title="Language Management" subtitle="Languages, translations and localized content. Changes apply without a redeploy.">
      <nav className="seg" aria-label="Language Management" style={{ flexWrap: 'wrap', alignSelf: 'flex-start' }}>
        {TABS.map(([k, label]) => (
          <Link key={k} aria-current={tab === k ? 'page' : undefined} className={tab === k ? 'on' : ''} href={`/admin/languages?tab=${k}${lang ? `&lang=${lang}` : ''}`} prefetch={false}>
            {label}
          </Link>
        ))}
      </nav>
      <section className="glass card">{body}</section>
    </AdminShell>
  );
}
