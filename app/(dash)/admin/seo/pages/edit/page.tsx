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

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Edit a page'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* One page at a time: what Google shows (meta title and description) and what visitors read (heading, intro, policy text). */
export default async function EditPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const { path = '' } = await searchParams;
  const viewer = await requireViewer({ path: `/admin/seo/pages/edit?path=${encodeURIComponent(path)}`, roles: ['admin'], scope: 'content' });
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
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>{page.name}</h2>
            <p className="tag">
              <a href={path} target="_blank" rel="noopener">
                {SITE_URL.replace(/^https?:\/\//, '')}
                {path}
              </a>
            </p>
          </div>
          <Link className="btn ghost sm" href={isListing ? '/admin/seo/listings' : '/admin/seo/pages'}>
            {isListing ? tx('All listings') : tx('All pages')}
          </Link>
        </div>
        <h3 className="sob-pw-h">
          <T s={'In Google'} />
        </h3>
        <div className="sob-pe-serp">
          <span className="sob-pe-st">{s.title || `${page.title} · ${SITE_NAME}`}</span>
          <span className="sob-pe-sd">{s.description || page.description || tx('The site-wide description (this page has none of its own yet).')}</span>
        </div>
        {home ? (
          <p className="tag">
            <T s={'The home page’s meta title and description are set on'} />{' '}
            <Link href="/admin/seo">
              <T s={'SEO and blog'} />
            </Link>
            <T s={', under Home page in Google.'} />
          </p>
        ) : (
          <AdminForm
            endpoint="/api/admin/seo/pages"
            fixed={{ path }}
            open
            fields={[
              {
                name: 'title',
                label: tx('Meta title'),
                kind: 'text',
                value: s.title,
                max: PAGE_SEO_MAX.title,
                hint: `About ${PAGE_SEO_GOOD.title} characters show in Google. Empty = "${page.title} · ${SITE_NAME}".`,
              },
              {
                name: 'description',
                label: tx('Meta description'),
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
        <div className="glass card sob-sec">
          <div className="row sob-hd">
            <div>
              <h2>
                <T s={'Listing content, price and pictures'} />
              </h2>
              <p className="tag">
                <T s={'Change the name, description, category, price, delivery, links and extras, and an app’s screenshots.'} />
              </p>
            </div>
            <Link className="btn sm" href={`/admin/seo/product?slug=${encodeURIComponent(product.id)}`}>
              <T s={'Edit the listing'} />
            </Link>
          </div>
        </div>
      )}
      {product && (
        <div className="glass card sob-sec">
          <div className="row sob-hd">
            <div>
              <h2>
                <T s={'Address'} />
              </h2>
              <p className="tag">
                <T
                  s={
                    'The listing’s address is /product/{id}. Changing it keeps its orders, downloads and licences, moves your saved search words with it, and sends the old address to the new one with a 301. After saving, open the listing again from the listings page.'
                  }
                  v={{ id: product.id }}
                />
              </p>
            </div>
          </div>
          <AdminForm
            endpoint="/api/admin/seo/slug"
            fixed={{ slug: product.id }}
            fields={[{ name: 'newSlug', label: tx('New address ending'), kind: 'text', value: product.id, max: 61, hint: tx('Lowercase letters, numbers and dashes.') }]}
            submit="Change the address"
            openLabel="Change the address"
            tone="line"
          />
        </div>
      )}
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'On the page'} />
            </h2>
            <p className="tag">
              {isListing
                ? tx("The listing's own words (name, description, pictures) are the seller's; change them from the seller's listing form.")
                : page.words
                  ? page.words.body
                    ? tx('The heading and the whole text of this page. Leave a box empty to keep the built-in words.')
                    : tx('The heading and the line under it. The rest of this page is built from live parts (lists, prices, forms) and stays as it is.')
                  : tx('This page is built from live parts (products, developers, counts), so only its meta title and description can be changed here.')}
            </p>
          </div>
        </div>
        {page.words && <PageWordsForm path={path} saved={w} builtIn={page.words} hasIntro={!page.words.body} hasBody={!!page.words.body} max={PAGE_WORDS_MAX} />}
      </div>
      {
        <div className="glass card sob-sec">
          <div className="row sob-hd">
            <div>
              <h2>
                <T s={'Publishing, search and questions'} />
              </h2>
              <p className="tag">
                <T
                  s={'Now: {v0}; {v1}; {v2} the sitemap.'}
                  v={{
                    v0: isPublic(path, ctl) ? 'visitors can open it' : 'a 404 for visitors',
                    v1: ctl.index ? 'search engines may list it' : 'kept out of search',
                    v2: inSitemap(path, ctl) ? 'in' : 'not in',
                  }}
                />
              </p>
              {sameCanonical.length > 0 && (
                <p className="tag">
                  <T s={'Warning: the same canonical address is set on {v0}.'} v={{ v0: sameCanonical.join(', ') }} />
                </p>
              )}
              {sameTitle.length > 0 && (
                <p className="tag">
                  <T s={'Warning: the same meta title is used on {v0}.'} v={{ v0: sameTitle.join(', ') }} />
                </p>
              )}
              {(!s.title || !s.description) && (
                <p className="tag">
                  <T s={'Missing: {v0} (the built-in words are used).'} v={{ v0: [!s.title && 'a saved meta title', !s.description && 'a saved meta description'].filter(Boolean).join(' and ') }} />
                </p>
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
