import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { PageControlsForm } from '@/components/PageControlsForm';
import { PageWordsForm } from '@/components/PageWordsForm';
import { PAGE_SEO_GOOD, PAGE_SEO_MAX, PAGE_WORDS_MAX, seoPage } from '@/lib/seo/pageList';
import { DEFAULT_CONTROLS, inSitemap, isLocked, isPublic, keywordIdeas } from '@/lib/seo/controls';
import { allControls } from '@/lib/seo/controlStore';
import type { Product } from '@/lib/data';
import { productFaqs } from '@/lib/seo/productFaq';
import { realListings } from '@/lib/seo/hubStore';
import { listingPage } from '@/lib/seo/listingMeta';
import { allPageSeo } from '@/lib/seo/pageMeta';
import { allPageWords } from '@/lib/seo/pageWords';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Edit a page', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* One page at a time: what Google shows (meta title and description) and what visitors read (heading, intro, policy text). */
export default async function EditPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path = '' } = await searchParams;
  const viewer = await requireViewer({ path: `/dashboard/admin/seo/pages/edit?path=${encodeURIComponent(path)}`, roles: ['admin'] });
  const home = path === '/';
  const page = home ? { path: '/', name: 'Home page', title: SITE_NAME, description: '', words: undefined } : (seoPage(path) ?? (await listingPage(path)));
  if (!page) notFound();
  const isListing = 'product' in page;
  const product = 'product' in page ? (page as { product: Product }).product : undefined;
  const listings = (await realListings()).map((l) => ({ id: l.id, name: l.name }));
  const [seo, words, controls] = await Promise.all([allPageSeo(0), allPageWords(0), allControls(0)]);
  const s = seo[path] ?? { title: '', description: '' };
  const ctl = controls[path] ?? DEFAULT_CONTROLS;
  const sameCanonical = ctl.canonical
    ? Object.entries(controls)
        .filter(([p, o]) => p !== path && o.canonical === ctl.canonical)
        .map(([p]) => p)
    : [];
  const sameTitle = s.title
    ? Object.entries(seo)
        .filter(([p, o]) => p !== path && o.title === s.title)
        .map(([p]) => p)
    : [];
  const w = words[path] ?? { heading: '', intro: '', body: '' };
  const ideas = keywordIdeas([page.title, page.description, w.heading, w.intro, ctl.content, ...ctl.faqs.flatMap((f) => [f.q, f.a]), product?.desc ?? ''].join(' . '));
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={page.name}>
      <div className="dp">
        <div className="hd">
          <div>
            <h2>{page.name}</h2>
            <p className="sub">
              <a href={path} target="_blank" rel="noopener">
                {SITE_URL.replace(/^https?:\/\//, '')}
                {path}
              </a>
            </p>
          </div>
          <Link className="btn btn-line btn-sm" href={isListing ? '/dashboard/admin/seo/listings' : '/dashboard/admin/seo/pages'}>
            {isListing ? 'All listings' : 'All pages'}
          </Link>
        </div>
        <h3 className="pw-h">In Google</h3>
        <div className="pe-serp">
          <span className="pe-st">{s.title || `${page.title} · ${SITE_NAME}`}</span>
          <span className="pe-sd">{s.description || page.description || 'The site-wide description (this page has none of its own yet).'}</span>
        </div>
        {home ? (
          <p className="sub">
            The home page&rsquo;s meta title and description are set on <Link href="/dashboard/admin/seo">SEO and blog</Link>, under Home page in Google.
          </p>
        ) : (
          <AdminForm
            endpoint="/api/admin/seo/pages"
            fixed={{ path }}
            open
            fields={[
              {
                name: 'title',
                label: 'Meta title',
                kind: 'text',
                value: s.title,
                max: PAGE_SEO_MAX.title,
                hint: `About ${PAGE_SEO_GOOD.title} characters show in Google. Empty = "${page.title} · ${SITE_NAME}".`,
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
            submit="Save meta title and description"
          />
        )}
      </div>
      {product && (
        <div className="dp">
          <div className="hd">
            <div>
              <h2>Listing content, price and pictures</h2>
              <p className="sub">Change the name, description, category, price, delivery, links and extras, and an app&rsquo;s screenshots.</p>
            </div>
            <Link className="btn btn-dark btn-sm" href={`/dashboard/admin/seo/product?slug=${encodeURIComponent(product.id)}`}>
              Edit the listing
            </Link>
          </div>
        </div>
      )}
      {product && (
        <div className="dp">
          <div className="hd">
            <div>
              <h2>Address</h2>
              <p className="sub">
                The listing&rsquo;s address is /product/{product.id}. Changing it keeps its orders, downloads and licences, moves your saved search words with it, and sends the old address to the new
                one with a 301. After saving, open the listing again from the listings page.
              </p>
            </div>
          </div>
          <AdminForm
            endpoint="/api/admin/seo/slug"
            fixed={{ slug: product.id }}
            fields={[{ name: 'newSlug', label: 'New address ending', kind: 'text', value: product.id, max: 61, hint: 'Lowercase letters, numbers and dashes.' }]}
            submit="Change the address"
            openLabel="Change the address"
            tone="line"
          />
        </div>
      )}
      <div className="dp">
        <div className="hd">
          <div>
            <h2>On the page</h2>
            <p className="sub">
              {isListing
                ? "The listing's own words (name, description, pictures) are the seller's; change them from the seller's listing form."
                : page.words
                  ? page.words.body
                    ? 'The heading and the whole text of this page. Leave a box empty to keep the built-in words.'
                    : 'The heading and the line under it. The rest of this page is built from live parts (lists, prices, forms) and stays as it is.'
                  : 'This page is built from live parts (products, developers, counts), so only its meta title and description can be changed here.'}
            </p>
          </div>
        </div>
        {page.words && <PageWordsForm path={path} saved={w} builtIn={page.words} hasIntro={!page.words.body} hasBody={!!page.words.body} max={PAGE_WORDS_MAX} />}
      </div>
      {
        <div className="dp">
          <div className="hd">
            <div>
              <h2>Publishing, search and questions</h2>
              <p className="sub">
                Now: {isPublic(path, ctl) ? 'visitors can open it' : 'a 404 for visitors'}; {ctl.index ? 'search engines may list it' : 'kept out of search'}; {inSitemap(path, ctl) ? 'in' : 'not in'}{' '}
                the sitemap.
              </p>
              {sameCanonical.length > 0 && <p className="sub">Warning: the same canonical address is set on {sameCanonical.join(', ')}.</p>}
              {sameTitle.length > 0 && <p className="sub">Warning: the same meta title is used on {sameTitle.join(', ')}.</p>}
              {(!s.title || !s.description) && (
                <p className="sub">Missing: {[!s.title && 'a saved meta title', !s.description && 'a saved meta description'].filter(Boolean).join(' and ')} (the built-in words are used).</p>
              )}
            </div>
          </div>
          <PageControlsForm
            path={path}
            saved={ctl}
            locked={isLocked(path)}
            listings={listings.filter((l) => l.id !== product?.id)}
            ideas={ideas}
            suggested={product ? productFaqs(product) : undefined}
            shown={{ title: s.title || `${page.title} · ${SITE_NAME}`, description: s.description || page.description, host: SITE_URL.replace(/^https?:\/\//, '') }}
          />
        </div>
      }
    </DashShell>
  );
}
