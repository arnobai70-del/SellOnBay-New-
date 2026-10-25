import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { listRedirects } from '@/lib/seo/redirectStore';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Redirects', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Address changes: an old address sends visitors and search engines to a new one. Account, checkout, payment, admin and download addresses cannot be redirected. */
export default async function Redirects() {
  const viewer = await requireViewer({ path: '/dashboard/admin/seo/redirects', roles: ['admin'] });
  const list = await listRedirects();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title="Redirects">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Redirects</h2>
            <p className="sub">
              Use 301 when a page moved for good (search engines move their listing to the new address) and 302 for a short change. A listing&rsquo;s address is changed from its Edit page, which adds
              the 301 for you. A redirect cannot start at a live page of the site, at the home page, or at an account, checkout, payment, admin or download address.
            </p>
          </div>
          <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo">
            Back to SEO and blog
          </Link>
        </div>
        <div className="adm-card">
          <h3>Add a redirect</h3>
          <AdminForm
            endpoint="/api/admin/seo/redirects"
            open
            fields={[
              { name: 'from', label: 'Old address', kind: 'text', required: true, hint: 'A path, for example /old-page' },
              { name: 'to', label: 'New address', kind: 'text', required: true, hint: 'A path like /new-page, or an https address' },
              {
                name: 'code',
                label: 'Kind',
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
        {list.length === 0 && <p className="muted">No redirects yet.</p>}
        {list.map((r) => (
          <div className="adm-card" key={r.from}>
            <div className="seo-row">
              <div>
                <h3>{r.from}</h3>
                <span className="muted">
                  {r.code} to {r.to}
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
