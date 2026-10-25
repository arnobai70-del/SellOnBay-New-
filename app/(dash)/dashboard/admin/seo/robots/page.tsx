import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { BASE_DISALLOW } from '@/lib/seo/robotsRules';
import { robotsExtra } from '@/lib/seo/robotsStore';
import { SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'robots.txt', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The robots.txt file: the private parts are always kept out; an admin can add more paths. */
export default async function Robots() {
  const viewer = await requireViewer({ path: '/dashboard/admin/seo/robots', roles: ['admin'] });
  const extra = await robotsExtra();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title="robots.txt">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>robots.txt</h2>
            <p className="sub">
              Live at <a href="/robots.txt">{SITE_URL}/robots.txt</a>, with the sitemap address in it. To keep a page out of Google, use that page&rsquo;s own noindex or archive switch, not this list:
              a page blocked here cannot be crawled, so Google never sees its noindex. Pages, the sitemap and the files pages need cannot be blocked here.
            </p>
          </div>
          <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo">
            Back to SEO and blog
          </Link>
        </div>
        <div className="adm-card">
          <h3>Always kept out (private and working parts)</h3>
          <p className="muted">{BASE_DISALLOW.join('  ')}</p>
        </div>
        <div className="adm-card">
          <h3>Extra paths kept out</h3>
          <p className="muted">{extra.length ? extra.join('  ') : 'None.'}</p>
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
