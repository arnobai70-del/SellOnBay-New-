import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Button } from '@/components/glass/Button';
import { DashboardShell } from '@/components/glass/DashboardShell';
import { DataTable, type Column } from '@/components/glass/DataTable';
import { Field } from '@/components/glass/Field';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassPage } from '@/components/glass/GlassPage';
import { Kpi } from '@/components/glass/Kpi';
import { PublicFooter } from '@/components/glass/PublicFooter';
import { PublicNav } from '@/components/glass/PublicNav';
import { Seg } from '@/components/glass/Seg';
import { StatusPill, type PillTone } from '@/components/glass/StatusPill';
import { PreviewControls } from './Demo';

export const metadata: Metadata = { title: 'Design preview', robots: { index: false, follow: false } };

/*
 * The glass UI's components and shells with sample data, to compare with design-reference/. Development only: a production build answers 404, so the sample
 * data can never be seen on the live site. The links in the menus lead to pages that later phases build. Removed in Phase 7.
 */
type Row = { id: string; item: string; amount: string; method: string; status: string; tone: PillTone };
const ROWS: Row[] = [
  { id: 'SOB-1045', item: 'alexblog.net', amount: '$13.99', method: 'bKash', status: 'Verifying payment', tone: 'wait' },
  { id: 'SOB-1042', item: 'Commerce Kit', amount: '$59.00', method: 'Bank', status: 'In review', tone: 'info' },
  { id: 'SOB-1030', item: 'Studio Portfolio', amount: '$39.00', method: 'bKash', status: 'Completed', tone: 'ok' },
  { id: 'SOB-1012', item: 'Agency Studio', amount: '$29.00', method: 'Bank', status: 'Refunded', tone: 'bad' },
];
const COLUMNS: Column<Row>[] = [
  { key: 'id', label: 'Order', cell: (r) => <b style={{ fontWeight: 500 }}>{r.id}</b> },
  { key: 'item', label: 'Item', cell: (r) => r.item },
  { key: 'amount', label: 'Amount', cell: (r) => r.amount },
  { key: 'method', label: 'Method', cell: (r) => r.method },
  { key: 'status', label: 'Status', cell: (r) => <StatusPill tone={r.tone}>{r.status}</StatusPill> },
  {
    key: 'invoice',
    label: 'Invoice',
    hideLabel: true,
    align: 'right',
    cell: () => (
      <Button variant="ghost" size="sm">
        Invoice PDF
      </Button>
    ),
  },
];

function Kit() {
  return (
    <>
      <div className="g-kpis">
        <Kpi label="Websites owned" value="3" note="All ready to download" />
        <Kpi label="In review" value="1" note="31h left to approve" />
        <Kpi label="Domains" value="3" note="1 expires soon" />
        <Kpi label="Open tickets" value="1" note="Seller replied" />
      </div>
      <GlassCard as="section" pad={false} style={{ padding: '8px 8px 4px' }}>
        <DataTable caption="Sample orders" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />
      </GlassCard>
      <div className="g-grid2">
        <GlassCard as="section">
          <h2>Buttons and status</h2>
          <div className="g-row" style={{ marginTop: 14, justifyContent: 'flex-start' }}>
            <Button>Primary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="warn">Warning</Button>
            <Button size="sm">Small</Button>
            <Button disabled>Disabled</Button>
            <Button variant="ghost" href="/design-preview">
              Link
            </Button>
          </div>
          <div className="g-row" style={{ marginTop: 14, justifyContent: 'flex-start' }}>
            <StatusPill tone="ok">Completed</StatusPill>
            <StatusPill tone="wait">Waiting</StatusPill>
            <StatusPill tone="bad">Refunded</StatusPill>
            <StatusPill tone="info">In review</StatusPill>
            <StatusPill tone="draft">Draft</StatusPill>
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Tabs and switches</h2>
          <div style={{ marginTop: 6 }}>
            <PreviewControls />
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Form fields</h2>
          <div className="g-stack" style={{ marginTop: 14 }}>
            <Field label="Full name" placeholder="Your name" hint="Domains are registered with these details." />
            <Field label="Email" type="email" defaultValue="not-an-email" error="Enter a valid email address." />
            <Field as="select" label="Category" defaultValue="SaaS">
              <option>SaaS</option>
              <option>E-commerce</option>
              <option>Portfolio</option>
            </Field>
            <Field as="textarea" label="Message" />
          </div>
        </GlassCard>
        <GlassCard as="section" lift>
          <h2>Card with lift and sheen</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Hover it. Below this grid are cards that reveal as you scroll, where the browser supports that.
          </p>
        </GlassCard>
      </div>
      <div className="g-grid3">
        {['One', 'Two', 'Three'].map((t) => (
          <GlassCard key={t} as="section" reveal>
            <h3>Reveal on scroll: {t}</h3>
          </GlassCard>
        ))}
      </div>
    </>
  );
}

const SHELLS = [
  { key: 'public', label: 'Public', href: '/design-preview' },
  { key: 'buyer', label: 'Buyer', href: '/design-preview?shell=buyer' },
  { key: 'seller', label: 'Seller', href: '/design-preview?shell=seller' },
  { key: 'admin', label: 'Admin', href: '/design-preview?shell=admin' },
];

export default async function DesignPreview({ searchParams }: { searchParams: Promise<{ shell?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { shell } = await searchParams;
  const picker = <Seg label="Shell to preview" value={shell === 'buyer' || shell === 'seller' || shell === 'admin' ? shell : 'public'} items={SHELLS} />;

  if (shell === 'buyer')
    return (
      <DashboardShell
        role="buyer"
        active="orders"
        title="Orders & payments"
        subtitle="Every purchase, its payment and its invoice"
        actions={picker}
        name="Alex"
        badges={{ orders: 1, domains: 1, support: 1, notifications: 3 }}
        unread={3}
      >
        <Kit />
      </DashboardShell>
    );
  if (shell === 'seller')
    return (
      <DashboardShell
        role="seller"
        active="websites"
        title="My websites"
        subtitle="Your listings, reviewer feedback and new uploads"
        actions={picker}
        name="Ayesha Rahman"
        badges={{ websites: 1, customization: 1, support: 1, notifications: 2 }}
        unread={2}
        sideCard="Your public store and the switch to buying go here (Phase 5)."
      >
        <Kit />
      </DashboardShell>
    );
  if (shell === 'admin')
    return (
      <DashboardShell
        role="admin"
        active="overview"
        title="Good morning, Admin"
        subtitle="Sample numbers"
        actions={picker}
        name="Super admin"
        badges={{ orders: 4, listings: 2, support: 3, security: 1 }}
        unread={7}
        sideCard="System health goes here (Phase 6)."
      >
        <Kit />
      </DashboardShell>
    );

  return (
    <GlassPage>
      <div className="g-wrap">
        <PublicNav showCart />
        <main id="main" className="g-stack" style={{ paddingTop: 40 }}>
          <div className="g-row">
            <h1 style={{ fontSize: 'clamp(34px, 4.6vw, 48px)', fontWeight: 300 }}>
              <span className="g-hl">
                <span>Design preview</span>
              </span>
            </h1>
            {picker}
          </div>
          <Kit />
        </main>
        <PublicFooter />
      </div>
    </GlassPage>
  );
}
