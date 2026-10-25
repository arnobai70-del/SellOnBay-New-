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

export const metadata: Metadata = { title: 'SEO and blog', robots: { index: false } };
export const dynamic = 'force-dynamic';

const day = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : '');

export default async function SeoAdmin() {
  const viewer = await requireViewer({ path: '/dashboard/admin/seo', roles: ['admin'] });
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
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title="SEO and blog">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Posts</h2>
            <p className="sub">
              Guides and news at <Link href="/blog">/blog</Link>. Each post has its own address, meta title and meta description, and goes into the sitemap and the feed when published.
            </p>
          </div>
          <Link className="btn btn-dark btn-sm" href="/dashboard/admin/seo/post">
            Write a post
          </Link>
        </div>
        {posts.length === 0 && <p className="muted">No posts yet. Posts that answer what buyers search for (for example &ldquo;how to start an online shop&rdquo;) bring visitors from Google.</p>}
        <ul className="lst">
          {posts.map((p) => {
            const hints = seoHints(p);
            return (
              <li key={p.id}>
                <div className="grow">
                  <b>
                    <Link href={`/dashboard/admin/seo/post?id=${p.id}`}>{p.title}</Link>
                  </b>
                  <small>
                    /blog/{p.slug} · {p.status === 'published' ? `published ${day(p.publishedAt)}` : 'draft'}
                    {p.noindex ? ' · kept out of Google' : ''} · {hints.length ? `${hints.length} SEO hint${hints.length > 1 ? 's' : ''}` : 'SEO looks good'}
                  </small>
                </div>
                <span className={p.status === 'published' ? 'chip mint' : 'chip'}>
                  <i />
                  {p.status === 'published' ? 'Live' : 'Draft'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Every page: words, title and description</h2>
            <p className="sub">
              Set the meta title and meta description Google shows for each page, and rewrite the heading and intro visitors read (the whole text on the policy pages). Products and posts have their
              own.
            </p>
          </div>
          <Link className="btn btn-dark btn-sm" href="/dashboard/admin/seo/pages">
            Edit pages
          </Link>
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Every listing: title and description</h2>
            <p className="sub">Each live listing gets them automatically from its name, category and description. Replace them for any listing.</p>
          </div>
          <Link className="btn btn-dark btn-sm" href="/dashboard/admin/seo/listings">
            Edit listings
          </Link>
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Pages and sitemap</h2>
            <p className="sub">
              <b>
                Publication gate: {gate.ready} of {gate.target} addresses ready{gate.complete ? ' (complete)' : ' (incomplete: nothing is invented to reach 25)'}.
              </b>{' '}
              Home page (E-commerce Templates) and each category need {gate.categories[0]?.need ?? 4} real, published products:{' '}
              {gate.categories.map((c, i) => (
                <span key={c.slug}>
                  {i > 0 ? '; ' : ''}
                  {c.name} {c.have}/{c.need}
                  {c.slug !== 'ecommerce' ? (c.categoryPage ? '' : ', category page waiting') : ''}
                </span>
              ))}
              .
            </p>
            <p className="sub">
              Commercial pages (category and product pages) in the sitemap: {n.primary}. Other pages (home, information, legal, blog): {n.additional}. Total sitemap addresses: {n.total}. There is no
              ceiling; every published, listed page is included.
            </p>
            <p className="sub">
              Published template categories: {hubViews.length} of 5 open, {hubViews.filter((v) => v.indexable).length} in search. Real listings live: {listings.length}. Draft pages:{' '}
              {pagePaths.filter((p) => ctlOf(p).status === 'draft').length}. Archived pages: {pagePaths.filter((p) => ctlOf(p).status === 'archived').length}.
            </p>
            <p className="sub">
              Without a saved meta title: {pagePaths.filter((p) => !saved[p]?.title).length}. Without a saved meta description: {pagePaths.filter((p) => !saved[p]?.description).length}. Without a
              featured picture: {warn.noPicture.length}. Without questions: {pagePaths.filter((p) => !ctlOf(p).faqs.some((f) => !f.draft)).length}.
            </p>
            <p className="sub">
              Same canonical address on two pages: {warn.duplicateCanonical.length}. Same meta title on two pages: {warn.duplicateTitle.length}. Same meta description on two pages:{' '}
              {warn.duplicateDescription.length}. Broken links at the last link check:{' '}
              {linkReport ? `${linkReport.broken.length} of ${linkReport.checked} (${new Date(linkReport.at).toISOString().slice(0, 10)})` : 'not checked yet'}.
            </p>
            <p className="sub">
              Made-up example listings are{' '}
              {examplesShown
                ? 'shown on the shelves and product pages (never in the sitemap or the template categories). Turn them off in Settings once real sellers have listed.'
                : 'hidden everywhere.'}
            </p>
            {closed.length > 0 && (
              <p className="sub">
                Closed to visitors (kept, and shown to you only):{' '}
                {closed.map((p, i) => (
                  <span key={p.path}>
                    {i > 0 ? ', ' : ''}
                    <Link href={`/dashboard/admin/seo/pages/edit?path=${encodeURIComponent(p.path)}`}>{p.path} (restore)</Link>
                  </span>
                ))}
                .
              </p>
            )}
          </div>
          <div className="adm-btns">
            <Link className="btn btn-dark btn-sm" href="/dashboard/admin/seo/categories">
              Template categories
            </Link>
            <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo/navigation">
              Top bar
            </Link>
            <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo/redirects">
              Redirects
            </Link>
            <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo/robots">
              robots.txt
            </Link>
            <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo/links">
              Link check
            </Link>
            <a className="btn btn-line btn-sm" href="/sitemap.xml" target="_blank" rel="noopener">
              Preview sitemap
            </a>
          </div>
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>SEO check</h2>
            <p className="sub">Checks every page, topic and live listing for missing, too long, too short and repeated titles and descriptions, worst first.</p>
          </div>
          <Link className="btn btn-dark btn-sm" href="/dashboard/admin/seo/check">
            Run the check
          </Link>
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Home page in Google</h2>
            <p className="sub">The title and description search engines show for {SITE_URL}. Empty uses the built-in words.</p>
          </div>
        </div>
        <div className="adm-card">
          <b>Title: {seo.homeTitle || '(built-in)'}</b>
          <p className="muted">Description: {seo.homeDescription || '(built-in)'}</p>
          <AdminForm
            endpoint="/api/admin/seo"
            fields={[
              { name: 'homeTitle', label: 'Title (about 60 characters)', kind: 'text', hint: 'Empty = the built-in title.' },
              { name: 'homeDescription', label: 'Description (about 150 to 160 characters)', kind: 'textarea', hint: 'Empty = the built-in description.' },
            ]}
            submit="Save"
            openLabel="Change them"
            tone="line"
          />
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Google and Bing</h2>
            <p className="sub">
              To see how the site does in search, add it to Google Search Console and Bing Webmaster Tools, choose the &ldquo;HTML tag&rdquo; check, and paste the tag or its code here. Then send the
              sitemap there: {SITE_URL}/sitemap.xml
            </p>
          </div>
        </div>
        <div className="adm-card">
          <b>Google Search Console: {seo.googleVerification ? 'code saved' : 'not set'}</b>
          <AdminForm
            endpoint="/api/admin/seo"
            fields={[{ name: 'googleVerification', label: 'Tag or code from Google (empty removes it)', kind: 'text' }]}
            submit="Save"
            openLabel="Set the code"
            tone="line"
          />
        </div>
        <div className="adm-card">
          <b>Bing Webmaster Tools: {seo.bingVerification ? 'code saved' : 'not set'}</b>
          <AdminForm
            endpoint="/api/admin/seo"
            fields={[{ name: 'bingVerification', label: 'Tag or code from Bing (empty removes it)', kind: 'text' }]}
            submit="Save"
            openLabel="Set the code"
            tone="line"
          />
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>What is already in place</h2>
          </div>
        </div>
        <ul className="lst">
          {[
            ['Sitemap', `${SITE_URL}/sitemap.xml lists every page, digital topic, live listing, category page and published post.`, '/sitemap.xml'],
            ['Robots file', 'Search engines are kept out of private pages (dashboard, orders, checkout, sign-in).', '/robots.txt'],
            ['Blog feed', `${live.length} published post${live.length === 1 ? '' : 's'} in the feed readers and some search tools use.`, '/blog/feed.xml'],
            ['Structured data', 'Products carry Product data with real reviews; posts carry Article data and a breadcrumb.', null],
            ['Share cards', 'Every page has a title, description and picture for Google, Facebook, LinkedIn and X.', null],
            ['Automatic words', 'Pages, digital topics and listings all have their own title, description and canonical address; listings not live are kept out of search.', null],
            ['Category pages', 'A category gets its own page once it has 3 or more real products, so there are no thin pages.', null],
          ].map(([t, d, href]) => (
            <li key={t}>
              <div className="grow">
                <b>{t}</b>
                <small>{d}</small>
              </div>
              {href && (
                <a className="btn btn-line btn-sm" href={href} target="_blank" rel="noopener">
                  Open
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}
