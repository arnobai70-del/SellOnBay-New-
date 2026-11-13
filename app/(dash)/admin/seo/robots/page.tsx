import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { BASE_DISALLOW } from '@/lib/seo/robotsRules';
import { robotsExtra } from '@/lib/seo/robotsStore';
import { SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'robots.txt', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The robots.txt file: the private parts are always kept out; an admin can add more paths. */
export default async function Robots() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/seo/robots', roles: ['admin'], scope: 'content' });
  const extra = await robotsExtra();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={tx('robots.txt')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'robots.txt'} />
            </h2>
            <p className="tag">
              <T s={'Live at'} />{' '}
              <a href="/robots.txt">
                <T s={'{SITE_URL}/robots.txt'} v={{ SITE_URL }} />
              </a>
              <T
                s={
                  ', with the sitemap address in it. To keep a page out of Google, use that page’s own noindex or archive switch, not this list: a page blocked here cannot be crawled, so Google never sees its noindex. Pages, the sitemap and the files pages need cannot be blocked here.'
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
            <T s={'Always kept out (private and working parts)'} />
          </h3>
          <p className="muted">{BASE_DISALLOW.join('  ')}</p>
        </div>
        <div className="sob-item">
          <h3>
            <T s={'Extra paths kept out'} />
          </h3>
          <p className="muted">{extra.length ? extra.join('  ') : tx('None.')}</p>
          <AdminForm
            endpoint="/api/admin/seo/robots"
            open
            fields={[{ name: 'paths', label: 'Paths, one per line', kind: 'textarea', value: extra.join('\n'), max: 4000, hint: 'For example /internal-tools/' }]}
            submit="Save robots.txt"
          />
        </div>
      </div>
    </DashShell>
  );
}
