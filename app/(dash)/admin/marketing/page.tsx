import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { usd } from '@/lib/glass/orderStatus';
import { couponLive, couponSplit, type Coupon } from '@/lib/marketing/coupons';
import { getSettings } from '@/lib/settings';
import { savedCoupons } from '@/lib/site/contentStore';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Marketing', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Coupons (the platform pays the discount; sellers always get their share of the list price), and the ways to the other growth tools. */
export default async function AdminMarketing() {
  const viewer = await requireViewer({ path: '/admin/marketing', roles: ['admin'], scope: 'content' });
  const [coupons, settings] = await Promise.all([savedCoupons(0), getSettings()]);
  const today = new Date().toISOString().slice(0, 10);
  const example = couponSplit(4900, 10);
  return (
    <AdminShell viewer={viewer} active="marketing" title="Marketing" subtitle="Coupons, promotions, SEO and visitors">
      <GlassCard as="section">
        <h2>Coupons</h2>
        <p className="g-tag">
          SellOnBay pays the discount: on a $49 website with 10% off, the buyer pays {usd(example.buyerPays)}, the seller still gets {usd(example.seller)} and SellOnBay keeps {usd(example.platform)}.
          {settings.paymentsMode === 'beta_free' ? ' Coupons apply at checkout once live payments start; in the beta nothing is charged.' : ''}
        </p>
        <div style={{ marginTop: 12 }}>
          <AdminForm
            endpoint="/api/admin/coupons"
            openLabel="Add a coupon"
            submit="Add coupon"
            tone="line"
            fixed={{ action: 'add' }}
            fields={[
              { name: 'code', label: 'Code (letters, numbers, dashes)', kind: 'text', required: true, max: 24 },
              { name: 'percentOff', label: 'Percent off (1 to 90)', kind: 'text', required: true },
              { name: 'endsOn', label: 'Last day (YYYY-MM-DD, optional)', kind: 'text' },
              { name: 'maxUses', label: 'Most uses (optional)', kind: 'text' },
            ]}
          />
        </div>
      </GlassCard>
      <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
        <DataTable<Coupon>
          caption="Coupons"
          rows={coupons}
          rowKey={(c) => c.code}
          empty="No coupons yet."
          columns={[
            { key: 'code', label: 'Code', cell: (c) => <b>{c.code}</b> },
            { key: 'off', label: 'Off', cell: (c) => `${c.percentOff}%` },
            { key: 'ends', label: 'Last day', cell: (c) => c.endsOn ?? 'No end' },
            { key: 'uses', label: 'Most uses', cell: (c) => c.maxUses ?? 'No limit' },
            { key: 'state', label: 'State', cell: (c) => (couponLive(c, today) ? <StatusPill tone="ok">On</StatusPill> : <StatusPill tone="draft">Off</StatusPill>) },
            {
              key: 'act',
              label: 'Actions',
              hideLabel: true,
              cell: (c) => (
                <span style={{ display: 'flex', gap: 8 }}>
                  <ActionButton endpoint="/api/admin/coupons" label={c.active ? 'Turn off' : 'Turn on'} tone="line" body={{ action: 'toggle', code: c.code }} />
                  <ActionButton endpoint="/api/admin/coupons" label="Remove" tone="line" body={{ action: 'remove', code: c.code }} />
                </span>
              ),
            },
          ]}
        />
      </GlassCard>
      <GlassCard as="section">
        <h2>More growth tools</h2>
        {(
          [
            ['Promotions', '/dashboard/admin/promotions'],
            ['SEO and blog', '/dashboard/admin/seo'],
            ['Site builder', '/dashboard/admin/site'],
            ['Visitors', '/admin/visitors'],
          ] as const
        ).map(([l, h]) => (
          <div key={h} className="g-li">
            <Link href={h}>{l}</Link>
          </div>
        ))}
      </GlassCard>
    </AdminShell>
  );
}
