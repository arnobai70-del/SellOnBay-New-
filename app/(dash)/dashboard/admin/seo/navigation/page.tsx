import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { NavEditor } from '@/components/NavEditor';
import { MARKET_MENU } from '@/lib/marketMenu';
import { NAV_LOCKED } from '@/lib/navConfig';
import { navConfig } from '@/lib/seo/navStore';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Top bar categories', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Which categories the top bar shows and in what order. Hiding one removes it from the bar only; its pages and links keep working. */
export default async function Navigation() {
  const viewer = await requireViewer({ path: '/dashboard/admin/seo/navigation', roles: ['admin'] });
  const cfg = await navConfig(0);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title="Top bar categories">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Top bar categories</h2>
            <p className="sub">
              Choose which categories the top bar and the phone menu show, and their order. A hidden category is only left out of the bar: its pages still work, and it comes back when you show it
              again. Help is always shown. The look of the bar does not change.
            </p>
          </div>
          <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo">
            Back to SEO and blog
          </Link>
        </div>
        <NavEditor rows={MARKET_MENU.map((e) => ({ key: e.key, label: e.label, locked: NAV_LOCKED.includes(e.key) }))} hidden={cfg.hidden} order={cfg.order} />
      </div>
    </DashShell>
  );
}
