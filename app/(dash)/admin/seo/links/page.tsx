import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { lastLinkReport } from '@/lib/seo/linkCheck';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Link check'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Opens every sitemap address and top-bar link once and shows which ones do not answer 200. */
export default async function Links() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/seo/links', roles: ['admin'], scope: 'content' });
  const r = await lastLinkReport();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={tx('Link check')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Link check'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Opens every address in the sitemap and every link in the top bar from this server, without following redirects. A sitemap address that does not answer 200 should not be there; a menu link that does not answer is broken. It can take a minute.'
                }
              />
            </p>
          </div>
          <Link className="btn ghost sm" href="/admin/seo">
            <T s={'Back to SEO and blog'} />
          </Link>
        </div>
        <div className="sob-item">
          <AdminForm endpoint="/api/admin/seo/links" fields={[]} submit={tx('Run the check')} openLabel={tx('Run the check')} tone="dark" />
        </div>
        {!r && (
          <p className="muted">
            <T s={'The check has not run yet.'} />
          </p>
        )}
        {r && (
          <div className="sob-item">
            <h3>
              <T s={'Last run: {v0} UTC'} v={{ v0: new Date(r.at).toISOString().slice(0, 16).replace('T', ' ') }} />
            </h3>
            <p className="muted">
              <T s={'{checked} addresses opened, {ok} answered 200, {redirects} redirected, {length} broken.'} v={{ checked: r.checked, ok: r.ok, redirects: r.redirects, length: r.broken.length }} />
            </p>
            {r.broken.length > 0 && (
              <ul className="sob-list">
                {r.broken.map((b) => (
                  <li key={b.path}>
                    <div className="sob-grow">
                      <b>{b.path}</b>
                      <small>
                        <T s={'{v0} · from the {from}'} v={{ v0: b.status || 'no answer', from: b.from }} />
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {r.redirected.length > 0 && (
              <>
                <h3>
                  <T s={'Redirected'} />
                </h3>
                <ul className="sob-list">
                  {r.redirected.map((b) => (
                    <li key={b.path}>
                      <div className="sob-grow">
                        <b>{b.path}</b>
                        <small>
                          <T s={'{status} · from the {from}'} v={{ status: b.status, from: b.from }} />
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
