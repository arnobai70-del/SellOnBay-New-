import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { StatusPill } from '@/components/glass/StatusPill';
import { ageText, opsQueues } from '@/lib/admin/opsQueues';
import { hasScope } from '@/lib/admin/scopes';
import { quickStatus } from '@/lib/admin/system';
import { adminCounts } from '@/lib/glass/admin';
import { getSettings } from '@/lib/settings';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Admin overview', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TONE = { ok: 'ok', warn: 'wait', bad: 'bad', off: 'draft' } as const;
const STATUS_TEXT = { ok: 'All systems normal', warn: 'Something needs a look', bad: 'Something is wrong', off: 'Not set up' } as const;

/* What waits for an admin today, by the permission that handles it, and the system's state in one word. */
export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const viewer = await requireViewer({ path: '/admin', roles: ['admin'] });
  const { denied } = await searchParams;
  const scopes = viewer?.scopes ?? ['super'];
  const [c, ops, status, settings] = await Promise.all([adminCounts(), opsQueues(), quickStatus(), getSettings()]);
  const mine = ops.filter((q) => hasScope(scopes, q.scope) && q.n > 0);
  return (
    <AdminShell
      viewer={viewer}
      active="overview"
      title="Admin overview"
      subtitle={settings.paymentsMode === 'beta_free' ? 'Free beta: requests are approved by hand and nothing is charged.' : 'Live payments are on.'}
    >
      {denied && (
        <GlassCard as="section" role="alert">
          Your admin account does not have permission for that page.
        </GlassCard>
      )}
      <div className="g-kpis">
        <Kpi label="Beta requests" value={c.beta} note={<Link href="/admin/orders">Waiting for a decision</Link>} />
        <Kpi label="Listings to review" value={c.listings} note={<Link href="/admin/listings">Review queue</Link>} />
        <Kpi label="Open disputes" value={c.disputes} note={<Link href="/admin/support">Disputes & support</Link>} />
        <Kpi label="ID checks" value={c.verifications} note={<Link href="/admin/users#verify">Sellers to verify</Link>} />
      </div>
      <div className="g-grid2">
        <GlassCard as="section">
          <h2>Waiting for you</h2>
          {mine.length ? (
            mine.map((q) => (
              <div key={q.key} className="g-li">
                <span style={{ flex: 1 }}>
                  <Link href={q.href}>{q.label}</Link>
                </span>
                <span className="g-tag">
                  {q.n}
                  {q.oldestAt ? ` · oldest ${ageText(q.oldestAt)}` : ''}
                </span>
              </div>
            ))
          ) : (
            <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
              Nothing is waiting for your permissions.
            </p>
          )}
        </GlassCard>
        <GlassCard as="section">
          <h2>System</h2>
          <p style={{ marginTop: 10 }}>
            <StatusPill tone={TONE[status]}>{STATUS_TEXT[status]}</StatusPill>
          </p>
          <div className="g-li">
            <span style={{ flex: 1 }}>Payouts to send</span>
            <Link href="/admin/finance">{c.payouts}</Link>
          </div>
          <div className="g-li">
            <span style={{ flex: 1 }}>Server health</span>
            <Link href="/admin/system">Open</Link>
          </div>
          <div className="g-li">
            <span style={{ flex: 1 }}>Visitors</span>
            <Link href="/admin/visitors">Open</Link>
          </div>
        </GlassCard>
      </div>
    </AdminShell>
  );
}
