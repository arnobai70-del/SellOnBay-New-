import type { Metadata } from 'next';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { buyerOrders, buyerWebsites } from '@/lib/glass/buyer';
import { buyerStatus } from '@/lib/glass/orderStatus';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'My websites', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The websites this buyer can download now. Files come only through the order's own signed link, which the server checks every time. */
export default async function BuyerWebsites() {
  const viewer = await requireViewer({ path: '/dashboard/buyer/websites', roles: ['buyer', 'seller'] });
  const sites = viewer ? await buyerWebsites(await buyerOrders(viewer.id)) : [];
  return (
    <BuyerShell
      viewer={viewer}
      active="websites"
      title="My websites"
      subtitle="Download files, follow the setup guide, rate and ask for changes"
      actions={
        <Button variant="ghost" href="/websites">
          Browse more websites
        </Button>
      }
    >
      {sites.length ? (
        sites.map((s) => (
          <GlassCard key={s.order.id} as="section">
            <div className="row">
              <div>
                <h2>{s.title}</h2>
                <div className="tag">
                  by {s.seller}
                  {s.stack ? ` · ${s.stack}` : ''} · Standard licence
                </div>
              </div>
              <StatusPill tone={buyerStatus(s.order.state).tone}>{buyerStatus(s.order.state).label}</StatusPill>
            </div>
            <div className="row" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
              <Button href={`/orders/${s.order.id}`}>Download files</Button>
              {s.docsUrl && (
                <Button variant="ghost" href={s.docsUrl} target="_blank" rel="noopener noreferrer nofollow">
                  Setup guide
                </Button>
              )}
              <Button variant="ghost" href="/dashboard/buyer/domains">
                Connect domain
              </Button>
              <Button variant="ghost" href="/dashboard/buyer/support">
                Get help
              </Button>
            </div>
          </GlassCard>
        ))
      ) : (
        <GlassCard>
          <h2>No websites yet</h2>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Websites you get show up here, ready to download.
          </p>
          <div style={{ marginTop: 14 }}>
            <Button href="/websites">Browse websites</Button>
          </div>
        </GlassCard>
      )}
    </BuyerShell>
  );
}
