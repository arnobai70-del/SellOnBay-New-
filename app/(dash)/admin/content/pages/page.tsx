import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { GlassCard } from '@/components/glass/GlassCard';
import { PAGES } from '@/lib/content/registry';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Pages', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Admin › Content › Pages (owner, 2026-11-08): every public page whose words an admin can change. Legal pages use the versioned legal documents. */
export default async function PagesAdmin() {
  const viewer = await requireViewer({ path: '/admin/content/pages', roles: ['admin'], scope: 'content' });
  return (
    <AdminShell viewer={viewer} active="pages" title="Pages" subtitle="Edit the words, buttons and sections of the public pages. Listings, prices and sellers come from the live data.">
      <GlassCard as="section">
        {PAGES.map((p) => (
          <div key={p.key} className="li">
            <span style={{ flex: 1 }}>
              <b>{p.label}</b>
              <span className="tag" style={{ display: 'block' }}>
                {p.legal ? 'Versioned legal document, published by a Super Admin' : p.path.startsWith('/') ? p.path : `${p.label}, on every page`}
              </span>
            </span>
            {p.legal ? <Link href="/admin/settings/legal">Open legal documents</Link> : <Link href={`/admin/content/pages/edit?key=${p.key}`}>Edit</Link>}
          </div>
        ))}
      </GlassCard>
    </AdminShell>
  );
}
