import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { DEFAULT_CONTROLS, inSitemap, isPublic } from '@/lib/seo/controls';
import { allControls } from '@/lib/seo/controlStore';
import { PAGE_SEO_GOOD, PAGE_SEO_MAX, SEO_PAGES } from '@/lib/seo/pageList';
import { allPageSeo } from '@/lib/seo/pageMeta';
import { allPageWords } from '@/lib/seo/pageWords';
import { getSeo } from '@/lib/seo/site';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Page titles and descriptions', robots: { index: false } };
export const dynamic = 'force-dynamic';

const LAYOUT_DESCRIPTION = 'The site-wide description';

export default async function SeoPages() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/seo/pages', roles: ['admin'], scope: 'content' });
  const [saved, seo, words, controls] = await Promise.all([allPageSeo(0), getSeo(0), allPageWords(0), allControls(0)]);
  const wordsChanged = (path: string) => !!(words[path]?.heading || words[path]?.intro || words[path]?.body);
  const changed = SEO_PAGES.filter((p) => saved[p.path]?.title || saved[p.path]?.description || wordsChanged(p.path)).length;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={tx('Page titles and descriptions')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Every page: words and Google'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'For each page: the title and description search engines and share cards show, and with Edit page the heading, intro and (for policy pages) the whole text visitors read. Leave a box empty to use the built-in words. A saved title is shown exactly as you write it. Changes show on the page within a minute; Google picks them up the next time it visits. {changed} of {v1} pages changed.'
                }
                v={{ changed, v1: SEO_PAGES.length + 1 }}
              />
            </p>
          </div>
          <Link className="btn ghost sm" href="/admin/seo">
            <T s={'Back to SEO and blog'} />
          </Link>
        </div>

        <div className="sob-seo-pages">
          <div className="sob-item">
            <div className="sob-seo-row">
              <div>
                <h3>
                  <T s={'Home page'} />
                </h3>
                <a className="muted" href="/" target="_blank" rel="noopener">
                  {SITE_URL.replace(/^https?:\/\//, '')}/
                </a>
              </div>
              <span className={seo.homeTitle || seo.homeDescription ? 'status st-ok' : 'status'}>
                <i />
                {seo.homeTitle || seo.homeDescription ? 'Changed' : 'Built-in'}
              </span>
            </div>
            <p className="muted">
              <T s={'Set on'} />{' '}
              <Link href="/admin/seo">
                <T s={'SEO and blog'} />
              </Link>
              <T s={', under Home page in Google.'} />
            </p>
            <Link className="btn sm" href={`/admin/seo/pages/edit?path=${encodeURIComponent('/')}`} style={{ justifySelf: 'start' }}>
              <T s={'Edit publishing, search and questions'} />
            </Link>
          </div>
          {SEO_PAGES.map((p) => {
            const s = saved[p.path] ?? { title: '', description: '' };
            const ctl = controls[p.path] ?? DEFAULT_CONTROLS;
            const isChanged = !!(s.title || s.description) || wordsChanged(p.path);
            const shownTitle = s.title || `${p.title} · ${SITE_NAME}`;
            const shownDesc = s.description || p.description;
            return (
              <div className="sob-item" key={p.path}>
                <div className="sob-seo-row">
                  <div>
                    <h3>{p.name}</h3>
                    <a className="muted" href={p.path} target="_blank" rel="noopener">
                      {SITE_URL.replace(/^https?:\/\//, '')}
                      {p.path}
                    </a>
                  </div>
                  <span className={isChanged ? 'status st-ok' : 'status'}>
                    <i />
                    {isChanged ? 'Changed' : 'Built-in'}
                  </span>
                </div>
                <p className="muted">
                  {isPublic(p.path, ctl) ? 'Published' : ctl.status === 'draft' ? 'Draft' : 'Archived'} · {ctl.index ? 'Indexable' : 'Noindex'} ·{' '}
                  {inSitemap(p.path, ctl) ? 'In sitemap' : 'Not in sitemap'} · {ctl.faqs.filter((f) => !f.draft).length} <T s={'questions'} />
                </p>
                <div className="sob-pe-serp">
                  <span className="sob-pe-st">{shownTitle}</span>
                  <span className="sob-pe-sd">{shownDesc || `${LAYOUT_DESCRIPTION} (this page has none of its own yet).`}</span>
                </div>
                <AdminForm
                  endpoint="/api/admin/seo/pages"
                  fixed={{ path: p.path }}
                  fields={[
                    {
                      name: 'title',
                      label: 'Meta title',
                      kind: 'text',
                      value: s.title,
                      max: PAGE_SEO_MAX.title,
                      hint: `About ${PAGE_SEO_GOOD.title} characters show in Google. Empty = "${p.title} · ${SITE_NAME}".`,
                    },
                    {
                      name: 'description',
                      label: 'Meta description',
                      kind: 'textarea',
                      value: s.description,
                      max: PAGE_SEO_MAX.description,
                      hint: `About ${PAGE_SEO_GOOD.description} characters show. Empty = the built-in words.`,
                    },
                  ]}
                  submit="Save"
                  openLabel="Quick edit: meta"
                  tone="line"
                />
                <Link className="btn sm" href={`/admin/seo/pages/edit?path=${encodeURIComponent(p.path)}`} style={{ justifySelf: 'start' }}>
                  {p.words ? (p.words.body ? 'Edit page: words and text' : 'Edit page: heading and intro') : 'Edit page'}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </DashShell>
  );
}
