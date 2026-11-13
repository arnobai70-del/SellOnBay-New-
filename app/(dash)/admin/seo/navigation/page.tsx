import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { NavEditor } from '@/components/NavEditor';
import { MARKET_MENU } from '@/lib/marketMenu';
import { NAV_LOCKED } from '@/lib/navConfig';
import { navConfig } from '@/lib/seo/navStore';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Top bar categories'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Which categories the top bar shows and in what order. Hiding one removes it from the bar only; its pages and links keep working. */
export default async function Navigation() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/seo/navigation', roles: ['admin'], scope: 'content' });
  const cfg = await navConfig(0);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={tx('Top bar categories')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Top bar categories'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Choose which categories the top bar and the phone menu show, and their order. A hidden category is only left out of the bar: its pages still work, and it comes back when you show it again. Help is always shown. The look of the bar does not change.'
                }
              />
            </p>
          </div>
          <Link className="btn ghost sm" href="/admin/seo">
            <T s={'Back to SEO and blog'} />
          </Link>
        </div>
        <NavEditor rows={MARKET_MENU.map((e) => ({ key: e.key, label: e.label, locked: NAV_LOCKED.includes(e.key) }))} hidden={cfg.hidden} order={cfg.order} />
      </div>
    </DashShell>
  );
}
