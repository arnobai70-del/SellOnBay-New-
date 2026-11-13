import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { GlassCard } from '@/components/glass/GlassCard';
import { PAGES } from '@/lib/content/registry';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Pages'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Admin › Content › Pages (owner, 2026-11-08): every public page whose words an admin can change. Legal pages use the versioned legal documents. */
export default async function PagesAdmin() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/content/pages', roles: ['admin'], scope: 'content' });
  return (
    <AdminShell viewer={viewer} active="pages" title={tx('Pages')} subtitle="Edit the words, buttons and sections of the public pages. Listings, prices and sellers come from the live data.">
      <GlassCard as="section">
        {PAGES.map((p) => (
          <div key={p.key} className="li">
            <span style={{ flex: 1 }}>
              <b>{p.label}</b>
              <span className="tag" style={{ display: 'block' }}>
                {p.legal ? tx('Versioned legal document, published by a Super Admin') : p.path.startsWith('/') ? p.path : `${p.label}, on every page`}
              </span>
            </span>
            {p.legal ? (
              <Link href="/admin/settings/legal">
                <T s={'Open legal documents'} />
              </Link>
            ) : (
              <Link href={`/admin/content/pages/edit?key=${p.key}`}>
                <T s={'Edit'} />
              </Link>
            )}
          </div>
        ))}
      </GlassCard>
    </AdminShell>
  );
}
