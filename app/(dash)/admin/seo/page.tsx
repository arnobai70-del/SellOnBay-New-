import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { allPosts, seoHints } from '@/lib/posts';
import { DEFAULT_CONTROLS, isPublic } from '@/lib/seo/controls';
import { allControls } from '@/lib/seo/controlStore';
import { HUBS } from '@/lib/seo/hubs';
import { hubView, realListings } from '@/lib/seo/hubStore';
import { lastLinkReport } from '@/lib/seo/linkCheck';
import { SEO_PAGES } from '@/lib/seo/pageList';
import { allPageSeo } from '@/lib/seo/pageMeta';
import { publicationGate, sitemapCounts, sitemapPlan } from '@/lib/seo/sitemapPlan';
import { getSeo } from '@/lib/seo/site';
import { getSettings } from '@/lib/settings';
import { seoWarnings } from '@/lib/seo/warnings';
import { SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('SEO and blog'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const day = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : '');

export default async function SeoAdmin() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/seo', roles: ['admin'], scope: 'content' });
  const [posts, seo, controls, saved, plan] = await Promise.all([allPosts(), getSeo(0), allControls(0), allPageSeo(0), sitemapPlan()]);
  const [hubViews, listings, linkReport] = await Promise.all([Promise.all(HUBS.map(hubView)), realListings(), lastLinkReport()]);
  const pagePaths = ['/', ...SEO_PAGES.map((p) => p.path)];
  const warn = seoWarnings(pagePaths, controls, saved);
  const examplesShown = (await getSettings()).showExamples;
  const n = sitemapCounts(plan);
  const gate = await publicationGate();
  const ctlOf = (path: string) => controls[path] ?? DEFAULT_CONTROLS;
  const closed = SEO_PAGES.filter((p) => !isPublic(p.path, ctlOf(p.path)));
  const live = posts.filter((p) => p.status === 'published');
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={tx('SEO and blog')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Posts'} />
            </h2>
            <p className="tag">
              <T s={'Guides and news at'} /> <Link href="/guides">/guides</Link>
              <T s={'. Each post has its own address, meta title and meta description, and goes into the sitemap and the feed when published.'} />
            </p>
          </div>
          <Link className="btn sm" href="/admin/seo/post">
            <T s={'Write a post'} />
          </Link>
        </div>
        {posts.length === 0 && (
          <p className="muted">
            <T s={'No posts yet. Posts that answer what buyers search for (for example “how to start an online shop”) bring visitors from Google.'} />
          </p>
        )}
        <ul className="sob-list">
          {posts.map((p) => {
            const hints = seoHints(p);
            return (
              <li key={p.id}>
                <div className="sob-grow">
                  <b>
                    <Link href={`/admin/seo/post?id=${p.id}`}>{p.title}</Link>
                  </b>
                  <small>
                    /blog/{p.slug} · {p.status === 'published' ? `published ${day(p.publishedAt)}` : 'draft'}
                    {p.noindex ? tx(' · kept out of Google') : ''} · {hints.length ? `${hints.length} SEO hint${hints.length > 1 ? 's' : ''}` : tx('SEO looks good')}
                  </small>
                </div>
                <span className={p.status === 'published' ? 'status st-ok' : 'status'}>
                  <i />
                  {p.status === 'published' ? tx('Live') : tx('Draft')}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Every page: words, title and description'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Set the meta title and meta description Google shows for each page, and rewrite the heading and intro visitors read (the whole text on the policy pages). Products and posts have their own.'
                }
              />
            </p>
          </div>
          <Link className="btn sm" href="/admin/seo/pages">
            <T s={'Edit pages'} />
          </Link>
        </div>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Every listing: title and description'} />
            </h2>
            <p className="tag">
              <T s={'Each live listing gets them automatically from its name, category and description. Replace them for any listing.'} />
            </p>
          </div>
          <Link className="btn sm" href="/admin/seo/listings">
            <T s={'Edit listings'} />
          </Link>
        </div>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Pages and sitemap'} />
            </h2>
            <p className="tag">
              <b>
                <T
                  s={'Publication gate: {ready} of {target} addresses ready{v2}.'}
                  v={{ ready: gate.ready, target: gate.target, v2: gate.complete ? ' (complete)' : ' (incomplete: nothing is invented to reach 25)' }}
                />
              </b>{' '}
              <T s={'Home page (E-commerce Templates) and each category need {v0} real, published products:'} v={{ v0: gate.categories[0]?.need ?? 4 }} />{' '}
              {gate.categories.map((c, i) => (
                <span key={c.slug}>
                  {i > 0 ? '; ' : ''}
                  {c.name} {c.have}/{c.need}
                  {c.slug !== 'ecommerce' ? (c.categoryPage ? '' : tx(', category page waiting')) : ''}
                </span>
              ))}
              .
            </p>
            <p className="tag">
              <T
                s={
                  'Commercial pages (category and product pages) in the sitemap: {primary}. Other pages (home, information, legal, blog): {additional}. Total sitemap addresses: {total}. There is no ceiling; every published, listed page is included.'
                }
                v={{ primary: n.primary, additional: n.additional, total: n.total }}
              />
            </p>
            <p className="tag">
              <T s={'Published template categories: {length} of 5 open,'} v={{ length: hubViews.length }} /> {hubViews.filter((v) => v.indexable).length}{' '}
              <T s={'in search. Real listings live: {length}. Draft pages:'} v={{ length: listings.length }} /> {pagePaths.filter((p) => ctlOf(p).status === 'draft').length}
              <T s={'. Archived pages:'} /> {pagePaths.filter((p) => ctlOf(p).status === 'archived').length}.
            </p>
            <p className="tag">
              <T s={'Without a saved meta title:'} /> {pagePaths.filter((p) => !saved[p]?.title).length}
              <T s={'. Without a saved meta description:'} /> {pagePaths.filter((p) => !saved[p]?.description).length}
              <T s={'. Without a featured picture: {length}. Without questions:'} v={{ length: warn.noPicture.length }} /> {pagePaths.filter((p) => !ctlOf(p).faqs.some((f) => !f.draft)).length}.
            </p>
            <p className="tag">
              <T
                s={'Same canonical address on two pages: {length}. Same meta title on two pages: {length2}. Same meta description on two pages: {length22}. Broken links at the last link check: {v3}.'}
                v={{
                  length: warn.duplicateCanonical.length,
                  length2: warn.duplicateTitle.length,
                  length22: warn.duplicateDescription.length,
                  v3: linkReport ? `${linkReport.broken.length} of ${linkReport.checked} (${new Date(linkReport.at).toISOString().slice(0, 10)})` : 'not checked yet',
                }}
              />
            </p>
            <p className="tag">
              <T
                s={'Made-up example listings are {v0}'}
                v={{
                  v0: examplesShown
                    ? 'shown on the shelves and product pages (never in the sitemap or the template categories). Turn them off in Settings once real sellers have listed.'
                    : 'hidden everywhere.',
                }}
              />
            </p>
            {closed.length > 0 && (
              <p className="tag">
                <T s={'Closed to visitors (kept, and shown to you only):'} />{' '}
                {closed.map((p, i) => (
                  <span key={p.path}>
                    {i > 0 ? ', ' : ''}
                    <Link href={`/admin/seo/pages/edit?path=${encodeURIComponent(p.path)}`}>
                      <T s={'{path} (restore)'} v={{ path: p.path }} />
                    </Link>
                  </span>
                ))}
                .
              </p>
            )}
          </div>
          <div className="sob-acts">
            <Link className="btn sm" href="/admin/seo/categories">
              <T s={'Template categories'} />
            </Link>
            <Link className="btn ghost sm" href="/admin/seo/navigation">
              <T s={'Top bar'} />
            </Link>
            <Link className="btn ghost sm" href="/admin/seo/redirects">
              <T s={'Redirects'} />
            </Link>
            <Link className="btn ghost sm" href="/admin/seo/robots">
              <T s={'robots.txt'} />
            </Link>
            <Link className="btn ghost sm" href="/admin/seo/links">
              <T s={'Link check'} />
            </Link>
            <a className="btn ghost sm" href="/sitemap.xml" target="_blank" rel="noopener">
              <T s={'Preview sitemap'} />
            </a>
          </div>
        </div>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'SEO check'} />
            </h2>
            <p className="tag">
              <T s={'Checks every page, topic and live listing for missing, too long, too short and repeated titles and descriptions, worst first.'} />
            </p>
          </div>
          <Link className="btn sm" href="/admin/seo/check">
            <T s={'Run the check'} />
          </Link>
        </div>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Home page in Google'} />
            </h2>
            <p className="tag">
              <T s={'The title and description search engines show for {SITE_URL}. Empty uses the built-in words.'} v={{ SITE_URL }} />
            </p>
          </div>
        </div>
        <div className="sob-item">
          <b>
            <T s={'Title: {v0}'} v={{ v0: seo.homeTitle || '(built-in)' }} />
          </b>
          <p className="muted">
            <T s={'Description: {v0}'} v={{ v0: seo.homeDescription || '(built-in)' }} />
          </p>
          <AdminForm
            endpoint="/api/admin/seo"
            fields={[
              { name: 'homeTitle', label: tx('Title (about 60 characters)'), kind: 'text', hint: tx('Empty = the built-in title.') },
              { name: 'homeDescription', label: tx('Description (about 150 to 160 characters)'), kind: 'textarea', hint: tx('Empty = the built-in description.') },
            ]}
            submit={tx('Save')}
            openLabel={tx('Change them')}
            tone="line"
          />
        </div>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Google and Bing'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'To see how the site does in search, add it to Google Search Console and Bing Webmaster Tools, choose the “HTML tag” check, and paste the tag or its code here. Then send the sitemap there: {SITE_URL}/sitemap.xml'
                }
                v={{ SITE_URL }}
              />
            </p>
          </div>
        </div>
        <div className="sob-item">
          <b>
            <T s={'Google Search Console: {v0}'} v={{ v0: seo.googleVerification ? 'code saved' : 'not set' }} />
          </b>
          <AdminForm
            endpoint="/api/admin/seo"
            fields={[{ name: 'googleVerification', label: tx('Tag or code from Google (empty removes it)'), kind: 'text' }]}
            submit={tx('Save')}
            openLabel={tx('Set the code')}
            tone="line"
          />
        </div>
        <div className="sob-item">
          <b>
            <T s={'Bing Webmaster Tools: {v0}'} v={{ v0: seo.bingVerification ? 'code saved' : 'not set' }} />
          </b>
          <AdminForm
            endpoint="/api/admin/seo"
            fields={[{ name: 'bingVerification', label: tx('Tag or code from Bing (empty removes it)'), kind: 'text' }]}
            submit={tx('Save')}
            openLabel={tx('Set the code')}
            tone="line"
          />
        </div>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'What is already in place'} />
            </h2>
          </div>
        </div>
        <ul className="sob-list">
          {[
            ['Sitemap', `${SITE_URL}/sitemap.xml lists every page, digital topic, live listing, category page and published post.`, '/sitemap.xml'],
            [tx('Robots file'), tx('Search engines are kept out of private pages (dashboard, orders, checkout, sign-in).'), '/robots.txt'],
            [tx('Blog feed'), `${live.length} published post${live.length === 1 ? '' : 's'} in the feed readers and some search tools use.`, '/blog/feed.xml'],
            [tx('Structured data'), 'Products carry Product data with real reviews; posts carry Article data and a breadcrumb.', null],
            [tx('Share cards'), tx('Every page has a title, description and picture for Google, Facebook, LinkedIn and X.'), null],
            [tx('Automatic words'), 'Pages, digital topics and listings all have their own title, description and canonical address; listings not live are kept out of search.', null],
            [tx('Category pages'), tx('A category gets its own page once it has 3 or more real products, so there are no thin pages.'), null],
          ].map(([t, d, href]) => (
            <li key={t}>
              <div className="sob-grow">
                <b>{t}</b>
                <small>{d}</small>
              </div>
              {href && (
                <a className="btn ghost sm" href={href} target="_blank" rel="noopener">
                  <T s={'Open'} />
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}
