import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { sellerByHandle } from '@/lib/glass/catalog';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await sellerByHandle((await params).username);
  if (!s) return { title: 'Not found', robots: { index: false } };
  const description = (s.headline || s.about || `Full-stack websites by ${s.name}, with a live demo and escrow protection.`).slice(0, 160);
  return { title: `${s.name}: seller store`, description, alternates: { canonical: `/sellers/${s.handle}` }, openGraph: { title: s.name, description, url: `/sellers/${s.handle}` } };
}

export default async function SellerStore({ params }: Props) {
  const s = await sellerByHandle((await params).username);
  if (!s) notFound();
  const { paymentsMode } = await getSettings();
  return (
    <div style={{ paddingTop: 40 }}>
      <GlassCard as="section" rise={false}>
        <h1>{s.name}</h1>
        {s.headline && <div className="g-tag">{s.headline}</div>}
        <div className="g-row" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          {s.verified && <StatusPill tone="ok">Verified seller</StatusPill>}
          {s.customAvailable && <StatusPill tone="info">Available for customization</StatusPill>}
        </div>
        <p className="g-muted" style={{ marginTop: 12, fontSize: 14 }}>
          {s.websites.length} {s.websites.length === 1 ? 'website' : 'websites'} · {s.sold} sold
          {s.reviews > 0 ? ` · ★ ${s.rating.toFixed(1)} from ${s.reviews} verified ${s.reviews === 1 ? 'buyer' : 'buyers'}` : ''}
          {s.joined ? ` · member since ${new Date(s.joined).getUTCFullYear()}` : ''}
        </p>
        {s.about && (
          <p className="g-muted" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
            {s.about}
          </p>
        )}
        {s.skills.length > 0 && (
          <div className="g-row" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
            {s.skills.map((x) => (
              <StatusPill key={x} tone="draft">
                {x}
              </StatusPill>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <Button variant="ghost" size="sm" href="/report-abuse">
            Report this seller
          </Button>
        </div>
      </GlassCard>
      <section className="g-sec">
        <h2>Websites by {s.name}</h2>
        <div className="g-grid3" style={{ marginTop: 18 }}>
          {s.websites.map((p) => (
            <WebsiteCard key={p.id} p={p} reveal />
          ))}
        </div>
      </section>
      <section className="g-sec">
        <GlassCard>
          <h2>Request customization</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            {paymentsMode === 'beta_free' ? 'Paid custom work is available after beta.' : 'Paid through escrow, like a website. Ask from any website of this seller.'}
          </p>
        </GlassCard>
      </section>
    </div>
  );
}
