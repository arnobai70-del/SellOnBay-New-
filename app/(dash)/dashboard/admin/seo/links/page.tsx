import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { lastLinkReport } from '@/lib/seo/linkCheck';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Link check', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Opens every sitemap address and top-bar link once and shows which ones do not answer 200. */
export default async function Links() {
  const viewer = await requireViewer({ path: '/dashboard/admin/seo/links', roles: ['admin'] });
  const r = await lastLinkReport();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title="Link check">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Link check</h2>
            <p className="sub">
              Opens every address in the sitemap and every link in the top bar from this server, without following redirects. A sitemap address that does not answer 200 should not be there; a menu
              link that does not answer is broken. It can take a minute.
            </p>
          </div>
          <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo">
            Back to SEO and blog
          </Link>
        </div>
        <div className="adm-card">
          <AdminForm endpoint="/api/admin/seo/links" fields={[]} submit="Run the check" openLabel="Run the check" tone="dark" />
        </div>
        {!r && <p className="muted">The check has not run yet.</p>}
        {r && (
          <div className="adm-card">
            <h3>Last run: {new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')} UTC</h3>
            <p className="muted">
              {r.checked} addresses opened, {r.ok} answered 200, {r.redirects} redirected, {r.broken.length} broken.
            </p>
            {r.broken.length > 0 && (
              <ul className="lst">
                {r.broken.map((b) => (
                  <li key={b.path}>
                    <div className="grow">
                      <b>{b.path}</b>
                      <small>
                        {b.status || 'no answer'} · from the {b.from}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {r.redirected.length > 0 && (
              <>
                <h3>Redirected</h3>
                <ul className="lst">
                  {r.redirected.map((b) => (
                    <li key={b.path}>
                      <div className="grow">
                        <b>{b.path}</b>
                        <small>
                          {b.status} · from the {b.from}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </DashShell>
  );
}
