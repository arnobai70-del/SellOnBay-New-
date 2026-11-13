import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { seoRows } from '@/lib/seo/report';
import { SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Listing titles and descriptions'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Every live listing with the title and description Google gets: automatic from the listing, or the admin's own words. */
export default async function SeoListings() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/seo/listings', roles: ['admin'], scope: 'content' });
  const rows = (await seoRows()).filter((r) => r.kind === 'listing');
  const changed = rows.filter((r) => r.changed).length;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={tx('Listing titles and descriptions')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Every live listing in Google'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Each listing gets a title and description automatically from its name, category and the seller’s description, so nothing is left empty. Replace them for any listing with Edit. {changed} of {length} listings have your own words.'
                }
                v={{ changed, length: rows.length }}
              />
            </p>
          </div>
          <Link className="btn ghost sm" href="/admin/seo">
            <T s={'Back to SEO and blog'} />
          </Link>
        </div>
        {rows.length === 0 && (
          <p className="muted">
            <T s={'No live listings yet.'} />
          </p>
        )}
        <div className="sob-seo-pages">
          {rows.map((r) => (
            <div className="sob-item" key={r.path}>
              <div className="sob-seo-row">
                <div>
                  <h3>{r.name}</h3>
                  <a className="muted" href={r.path} target="_blank" rel="noopener">
                    {SITE_URL.replace(/^https?:\/\//, '')}
                    {r.path}
                  </a>
                </div>
                <span className={r.changed ? 'status st-ok' : 'status'}>
                  <i />
                  {r.changed ? tx('Changed') : tx('Automatic')}
                </span>
              </div>
              <div className="sob-pe-serp">
                <span className="sob-pe-st">{r.title}</span>
                <span className="sob-pe-sd">{r.description}</span>
              </div>
              <Link className="btn sm" href={`/admin/seo/pages/edit?path=${encodeURIComponent(r.path)}`} style={{ justifySelf: 'start' }}>
                <T s={'Edit title and description'} />
              </Link>
              {r.kind === 'listing' && (
                <Link className="btn ghost sm" href={`/admin/seo/product?slug=${encodeURIComponent(r.path.replace('/product/', ''))}`} style={{ justifySelf: 'start' }}>
                  <T s={'Edit content, price and pictures'} />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashShell>
  );
}
