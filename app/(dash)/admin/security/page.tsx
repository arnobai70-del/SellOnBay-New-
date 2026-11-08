import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { StatusPill } from '@/components/glass/StatusPill';
import { auditList, type AuditEntry } from '@/lib/admin/audit';
import { activeBlocks, clusters, recentLimitHits, type LimitHit } from '@/lib/guard';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Security and logs', robots: { index: false } };
export const dynamic = 'force-dynamic';

const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/*
 * Read-only security view: connections that hit the limits (only a hash of the address is ever kept), shared devices, blocks, and the audit log.
 * Blocking and lifting a block stay on the full security tool, where a reason is required.
 */
export default async function AdminSecurity() {
  const viewer = await requireViewer({ path: '/admin/security', roles: ['admin'], scope: 'super' });
  const [hits, groups, blocks, log] = await Promise.all([recentLimitHits(), clusters(), activeBlocks(), auditList(100)]);
  return (
    <AdminShell viewer={viewer} active="security" title="Security & logs" subtitle="Addresses are never stored: only a keyed hash, shortened here.">
      <div className="g-kpis">
        <Kpi label="Connections at a limit" value={hits.length} note="Last 24 hours" />
        <Kpi label="Shared devices or connections" value={groups.length} note="Look before you block" />
        <Kpi label="Active blocks" value={blocks.length} note={<Link href="/dashboard/admin/security">Block or lift</Link>} />
      </div>
      <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
        <h2 style={{ padding: '0 14px 6px' }}>Connections that hit a limit</h2>
        <DataTable<LimitHit>
          caption="Connections that hit a limit"
          rows={hits.slice(0, 50)}
          rowKey={(h) => h.ipHash}
          empty="None in the last 24 hours."
          columns={[
            { key: 'hash', label: 'Connection (hash)', cell: (h) => <code>{h.ipHash.slice(0, 10)}…</code> },
            {
              key: 'what',
              label: 'What',
              cell: (h) =>
                Object.entries(h.actions)
                  .map(([k, n]) => `${k} ${n}`)
                  .join(', '),
            },
            { key: 'total', label: 'Refused', cell: (h) => h.total },
            { key: 'last', label: 'Last', cell: (h) => when(h.last) },
            { key: 'state', label: 'State', cell: (h) => (h.blocked ? <StatusPill tone="bad">Blocked</StatusPill> : <StatusPill tone="wait">Watching</StatusPill>) },
          ]}
        />
      </GlassCard>
      <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
        <div className="g-row" style={{ padding: '0 14px 6px' }}>
          <h2>Audit log</h2>
          <Link href="/dashboard/admin/audit">Full log</Link>
        </div>
        <DataTable<AuditEntry>
          caption="Audit log"
          rows={log}
          rowKey={(e) => String(e.id)}
          empty="Nothing logged yet."
          columns={[
            { key: 'at', label: 'When', cell: (e) => when(e.at) },
            { key: 'action', label: 'Action', cell: (e) => e.action.replace(/_/g, ' ') },
            { key: 'target', label: 'On', cell: (e) => `${e.targetType} ${String(e.targetRef).slice(0, 24)}` },
          ]}
        />
      </GlassCard>
    </AdminShell>
  );
}
