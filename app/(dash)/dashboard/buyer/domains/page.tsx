import type { Metadata } from 'next';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { buyerDomains, buyerOrders } from '@/lib/glass/buyer';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'My domains', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* No registrar is connected yet (owner, 2026-11-07): domains are registered by hand, in the buyer's own name, so this page shows what we hold and what is on its way. */
export default async function BuyerDomains() {
  const viewer = await requireViewer({ path: '/dashboard/buyer/domains', roles: ['buyer', 'seller'] });
  const domains = viewer ? await buyerDomains(viewer.id, await buyerOrders(viewer.id)) : [];
  return (
    <BuyerShell viewer={viewer} active="domains" title="Domains" subtitle="Registered in your own name" actions={<Button href="/domains">Find a new domain</Button>}>
      {domains.length ? (
        domains.map((d) => (
          <GlassCard key={d.name} as="section" className="g-row">
            <div>
              <h2>{d.name}</h2>
              <div className="g-tag">
                {d.site ? `For ${d.site}` : 'Not connected to a website yet'}
                {d.expires ? ` · renews ${d.expires}` : ''}
              </div>
            </div>
            <StatusPill tone={d.status === 'active' ? 'ok' : 'wait'}>{d.status === 'active' ? 'Active' : 'Being registered'}</StatusPill>
          </GlassCard>
        ))
      ) : (
        <GlassCard>
          <h2>No domains yet</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Ask for a domain when you request a website, or use one you already own.
          </p>
        </GlassCard>
      )}
      <GlassCard as="section">
        <h2>How domains work here</h2>
        <ul className="g-list">
          <li>✓ We check availability by hand and register it in your own name</li>
          <li>✓ We email you before it expires</li>
          <li>✓ The domain is yours: ask us for the transfer code any time after 60 days</li>
        </ul>
      </GlassCard>
    </BuyerShell>
  );
}
