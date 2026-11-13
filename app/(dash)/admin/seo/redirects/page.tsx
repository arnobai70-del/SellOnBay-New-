import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { listRedirects } from '@/lib/seo/redirectStore';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Redirects'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Address changes: an old address sends visitors and search engines to a new one. Account, checkout, payment, admin and download addresses cannot be redirected. */
export default async function Redirects() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/seo/redirects', roles: ['admin'], scope: 'content' });
  const list = await listRedirects();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={tx('Redirects')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Redirects'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Use 301 when a page moved for good (search engines move their listing to the new address) and 302 for a short change. A listing’s address is changed from its Edit page, which adds the 301 for you. A redirect cannot start at a live page of the site, at the home page, or at an account, checkout, payment, admin or download address.'
                }
              />
            </p>
          </div>
          <Link className="btn ghost sm" href="/admin/seo">
            <T s={'Back to SEO and blog'} />
          </Link>
        </div>
        <div className="sob-item">
          <h3>
            <T s={'Add a redirect'} />
          </h3>
          <AdminForm
            endpoint="/api/admin/seo/redirects"
            open
            fields={[
              { name: 'from', label: tx('Old address'), kind: 'text', required: true, hint: tx('A path, for example /old-page') },
              { name: 'to', label: tx('New address'), kind: 'text', required: true, hint: tx('A path like /new-page, or an https address') },
              {
                name: 'code',
                label: tx('Kind'),
                kind: 'select',
                options: [
                  ['301', '301: moved for good'],
                  ['302', '302: moved for now'],
                ],
              },
            ]}
            submit="Save redirect"
          />
        </div>
        {list.length === 0 && (
          <p className="muted">
            <T s={'No redirects yet.'} />
          </p>
        )}
        {list.map((r) => (
          <div className="sob-item" key={r.from}>
            <div className="sob-seo-row">
              <div>
                <h3>{r.from}</h3>
                <span className="muted">
                  <T s={'{code} to {to}'} v={{ code: r.code, to: r.to }} />
                </span>
              </div>
              <AdminForm endpoint="/api/admin/seo/redirects" fixed={{ remove: r.from }} fields={[]} submit="Remove" openLabel="Remove" tone="line" />
            </div>
          </div>
        ))}
      </div>
    </DashShell>
  );
}
