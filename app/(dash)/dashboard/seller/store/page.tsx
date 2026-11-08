import type { Metadata } from 'next';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { StoreForm } from '@/components/glass/SellerForms';
import { SellerShell } from '@/components/glass/SellerShell';
import { sellerDashboard } from '@/lib/dashboard';
import { sellerStats, storeProfile } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Store and analytics', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The public store's words and the last 30 days of views and Buy clicks on the seller's listings (visitor analytics, no cookies). */
export default async function SellerStore() {
  const viewer = await requireViewer({ path: '/dashboard/seller/store', roles: ['seller', 'admin'] });
  const [v, store] = viewer ? await Promise.all([sellerDashboard(viewer.id), storeProfile(viewer.id, viewer.name)]) : [null, null];
  const stats = v ? await sellerStats(v.listings.map((l) => l.slug)) : new Map();
  const rows = (v?.listings ?? []).map((l) => ({ slug: l.slug, name: plainWords(l.name), ...(stats.get(l.slug) ?? { views: 0, people: 0, buys: 0 }) })).sort((a, b) => b.views - a.views);
  const total = rows.reduce((s, r) => ({ views: s.views + r.views, people: s.people + r.people, buys: s.buys + r.buys }), { views: 0, people: 0, buys: 0 });
  return (
    <SellerShell
      viewer={viewer}
      active="store"
      title="Store & analytics"
      subtitle="What buyers see on your store page, and how your listings are doing"
      handle={store?.username ? store.handle : undefined}
    >
      {v && store && (
        <>
          <div className="kpis">
            <Kpi label="Listing views (30 days)" value={total.views} note={`${total.people} different people`} />
            <Kpi label="Buy clicks (30 days)" value={total.buys} note={total.people ? `${Math.round((total.buys / total.people) * 100)}% of visitors` : 'No visitors yet'} />
            <Kpi label="Live listings" value={v.listings.filter((l) => l.status === 'live').length} note={`${v.listings.length} in all`} />
            <Kpi label="Rating" value={v.health.rating ?? '-'} note={v.health.ratingCount ? `${v.health.ratingCount} reviews` : 'No reviews yet'} />
          </div>
          <div className="grid2">
            <GlassCard as="section">
              <h2>Store profile</h2>
              <p className="tag">Keep emails, phone numbers and outside links out: buyers talk to you inside an order.</p>
              <div style={{ marginTop: 12 }}>
                <StoreForm
                  initial={{
                    username: store.username,
                    headline: store.headline,
                    bio: store.bio,
                    skills: store.skills,
                    customAvailable: store.customAvailable,
                    replyTime: store.replyTime,
                    storePaused: store.storePaused,
                  }}
                />
              </div>
            </GlassCard>
            <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
              <h2 style={{ padding: '0 14px 6px' }}>Listings, last 30 days</h2>
              <DataTable<(typeof rows)[number]>
                caption="Listings, last 30 days"
                rows={rows}
                rowKey={(r) => r.slug}
                empty="No listings yet."
                columns={[
                  { key: 'name', label: 'Website', cell: (r) => r.name },
                  { key: 'views', label: 'Views', cell: (r) => r.views },
                  { key: 'people', label: 'People', cell: (r) => r.people },
                  { key: 'buys', label: 'Buy clicks', cell: (r) => r.buys },
                ]}
              />
            </GlassCard>
          </div>
        </>
      )}
    </SellerShell>
  );
}
