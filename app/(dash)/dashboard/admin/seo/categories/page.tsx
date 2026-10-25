import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { platformOf } from '@/lib/apps';
import { DEFAULT_CONTROLS, isPublic } from '@/lib/seo/controls';
import { allControls } from '@/lib/seo/controlStore';
import { HUB_LIMIT, HUBS, hubPath } from '@/lib/seo/hubs';
import { allocation, hubOf, hubPublicPath, hubPublicSlug, hubView, realListings } from '@/lib/seo/hubStore';
import { listingPath } from '@/lib/seo/listingMeta';
import { SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Template categories', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The five template categories and which real listings each shows. Examples never appear. Everything here is a setting, not code. */
export default async function Categories() {
  const viewer = await requireViewer({ path: '/dashboard/admin/seo/categories', roles: ['admin'] });
  const [views, a, listings, ctl] = await Promise.all([Promise.all(HUBS.map(hubView)), allocation(0), realListings(), allControls(0)]);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title="Template categories">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Five template categories</h2>
            <p className="sub">
              Each category shows real seller listings only. Listings join by the category the seller chose, or where you put them below. A category is listed in the sitemap and open to search once it
              shows at least 3 listings; before that its page opens but stays out of search.
            </p>
          </div>
          <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo">
            Back to SEO and blog
          </Link>
        </div>
        {views.map((v) => (
          <div className="adm-card" key={v.hub.slug}>
            <div className="seo-row">
              <div>
                <h3>{v.hub.name}</h3>
                <a className="muted" href={hubPublicPath(v.hub, a)} target="_blank" rel="noopener">
                  {SITE_URL.replace(/^https?:\/\//, '')}
                  {hubPublicPath(v.hub, a)}
                </a>
              </div>
              <span className={v.indexable ? 'chip mint' : 'chip'}>
                <i />
                {v.indexable ? 'In search' : 'Kept out of search'}
              </span>
            </div>
            <p className="muted">
              Showing {v.products.length} of {v.limit} places. {v.eligible} listing{v.eligible === 1 ? '' : 's'} qualify.
              {v.products.length < v.limit ? ` Missing: ${v.limit - v.products.length} real listing${v.limit - v.products.length === 1 ? '' : 's'}.` : ''}
            </p>
            <AdminForm
              endpoint="/api/admin/seo/alloc"
              fixed={{ hub: v.hub.slug }}
              fields={[{ name: 'limit', label: 'How many listings this category shows', kind: 'text', value: String(v.limit), hint: `1 to 12. Default ${HUB_LIMIT}.` }]}
              submit="Save"
              openLabel="Change how many"
              tone="line"
            />
            <AdminForm
              endpoint="/api/admin/seo/alloc"
              fixed={{ hub: v.hub.slug }}
              fields={[
                {
                  name: 'slug',
                  label: 'Address ending (SEO slug)',
                  kind: 'text',
                  value: hubPublicSlug(v.hub, a),
                  max: 61,
                  hint: `The page is at /templates/<ending>. The built-in ending is ${v.hub.slug}. Changing it sends the old address to the new one with a 301.`,
                },
              ]}
              submit="Save"
              openLabel="Change the address"
              tone="line"
            />
            <Link className="btn btn-dark btn-sm" href={`/dashboard/admin/seo/pages/edit?path=${encodeURIComponent(hubPath(v.hub))}`} style={{ justifySelf: 'start' }}>
              Edit page, search settings and questions
            </Link>
          </div>
        ))}
      </div>
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Live listings</h2>
            <p className="sub">Put each real listing in a category, leave it automatic, or keep it out of all of them. The made-up examples are not listed here.</p>
          </div>
        </div>
        {listings.length === 0 && <p className="muted">No seller listing is live yet, so every category is waiting for real products.</p>}
        {listings.map((p) => {
          const path = listingPath(p.id);
          const now = hubOf({ id: p.id, cat: p.cat, platform: platformOf(p) }, a);
          return (
            <div className="adm-card" key={p.id}>
              <div className="seo-row">
                <div>
                  <h3>{p.name}</h3>
                  <span className="muted">
                    {p.cat} · {isPublic(path, ctl[path] ?? DEFAULT_CONTROLS) ? 'page published' : 'page unpublished'} · now in: {now ? now.name : 'no category'}
                  </span>
                </div>
                <Link className="btn btn-line btn-sm" href={`/dashboard/admin/seo/pages/edit?path=${encodeURIComponent(path)}`}>
                  Edit page
                </Link>
                <Link className="btn btn-line btn-sm" href={`/dashboard/admin/seo/product?slug=${encodeURIComponent(p.id)}`}>
                  Edit listing
                </Link>
              </div>
              <AdminForm
                endpoint="/api/admin/seo/alloc"
                fixed={{ productId: p.id }}
                fields={[
                  {
                    name: 'to',
                    label: 'Category',
                    kind: 'select',
                    options: [['auto', 'Automatic (by its own category)'], ...HUBS.map((h): [string, string] => [h.slug, h.name]), ['none', 'None']],
                    value: a.assign[p.id] ?? 'auto',
                  },
                ]}
                submit="Save"
                openLabel="Change category"
                tone="line"
              />
            </div>
          );
        })}
      </div>
    </DashShell>
  );
}
