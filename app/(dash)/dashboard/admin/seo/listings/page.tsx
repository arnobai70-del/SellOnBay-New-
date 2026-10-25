import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { seoRows } from '@/lib/seo/report';
import { SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Listing titles and descriptions', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Every live listing with the title and description Google gets: automatic from the listing, or the admin's own words. */
export default async function SeoListings() {
  const viewer = await requireViewer({ path: '/dashboard/admin/seo/listings', roles: ['admin'] });
  const rows = (await seoRows()).filter((r) => r.kind === 'listing');
  const changed = rows.filter((r) => r.changed).length;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title="Listing titles and descriptions">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Every live listing in Google</h2>
            <p className="sub">
              Each listing gets a title and description automatically from its name, category and the seller&rsquo;s description, so nothing is left empty. Replace them for any listing with Edit.{' '}
              {changed} of {rows.length} listings have your own words.
            </p>
          </div>
          <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo">
            Back to SEO and blog
          </Link>
        </div>
        {rows.length === 0 && <p className="muted">No live listings yet.</p>}
        <div className="seo-pages">
          {rows.map((r) => (
            <div className="adm-card" key={r.path}>
              <div className="seo-row">
                <div>
                  <h3>{r.name}</h3>
                  <a className="muted" href={r.path} target="_blank" rel="noopener">
                    {SITE_URL.replace(/^https?:\/\//, '')}
                    {r.path}
                  </a>
                </div>
                <span className={r.changed ? 'chip mint' : 'chip'}>
                  <i />
                  {r.changed ? 'Changed' : 'Automatic'}
                </span>
              </div>
              <div className="pe-serp">
                <span className="pe-st">{r.title}</span>
                <span className="pe-sd">{r.description}</span>
              </div>
              <Link className="btn btn-dark btn-sm" href={`/dashboard/admin/seo/pages/edit?path=${encodeURIComponent(r.path)}`} style={{ justifySelf: 'start' }}>
                Edit title and description
              </Link>
              {r.kind === 'listing' && (
                <Link className="btn btn-line btn-sm" href={`/dashboard/admin/seo/product?slug=${encodeURIComponent(r.path.replace('/product/', ''))}`} style={{ justifySelf: 'start' }}>
                  Edit content, price and pictures
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashShell>
  );
}
