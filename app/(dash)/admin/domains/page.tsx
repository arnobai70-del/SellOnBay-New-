import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { betaRequests } from '@/lib/beta/service';
import { orderCode } from '@/lib/payments/rules';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Domains', robots: { index: false } };
export const dynamic = 'force-dynamic';

/*
 * No registrar is connected (owner, 2026-11-07: "Check availability" and manual registration). Domains buyers asked for are listed here; after
 * registering one at the registrar in the buyer's own name, record it so it shows in their dashboard.
 */
export default async function AdminDomains() {
  const viewer = await requireViewer({ path: '/admin/domains', roles: ['admin'], scope: 'support' });
  const [requests, held] = await Promise.all([
    betaRequests(),
    supabaseConfigured ? createAdminClient().from('domains').select('name, order_id, expires_at, registrar_ref').order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ]);
  const recorded = (held.data ?? []) as { name: string; order_id: string | null; expires_at: string | null; registrar_ref: string | null }[];
  const names = new Set(recorded.map((d) => d.name));
  const asked = requests.filter((r) => r.domain && !r.declineReason && !names.has(r.domain.toLowerCase()));
  return (
    <AdminShell viewer={viewer} active="domains" title="Domains" subtitle="Registered by hand, always in the buyer's own name. No registrar is connected yet.">
      <GlassCard as="section">
        <h2>Asked for, not recorded yet ({asked.length})</h2>
        {asked.length ? (
          asked.map((r) => (
            <div key={r.orderId} className="g-li" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
              <span>
                <b>{r.domain}</b> · for {r.name} ({r.country}) · order <Link href={`/dashboard/admin/orders/${r.orderId}`}>{orderCode(r.orderId)}</Link>{' '}
                {r.decidedAt ? <StatusPill tone="ok">Approved</StatusPill> : <StatusPill tone="wait">Request waiting</StatusPill>}
              </span>
              <AdminForm
                endpoint="/api/admin/domains"
                openLabel="Record as registered"
                submit="Record the domain"
                tone="line"
                fixed={{ orderId: r.orderId, name: r.domain }}
                fields={[
                  { name: 'expiresAt', label: 'Expires on (YYYY-MM-DD)', kind: 'text', required: true },
                  { name: 'registrarRef', label: 'Registrar reference (optional)', kind: 'text' },
                ]}
              />
            </div>
          ))
        ) : (
          <p className="g-muted" style={{ marginTop: 8 }}>
            Nothing waiting.
          </p>
        )}
      </GlassCard>
      <GlassCard as="section">
        <h2>Recorded domains ({recorded.length})</h2>
        {recorded.length ? (
          recorded.map((d) => (
            <div key={d.name} className="g-li">
              <span style={{ flex: 1 }}>{d.name}</span>
              <span className="g-tag">{d.expires_at ? `Expires ${d.expires_at}` : 'No expiry recorded'}</span>
            </div>
          ))
        ) : (
          <p className="g-muted" style={{ marginTop: 8 }}>
            None yet.
          </p>
        )}
      </GlassCard>
    </AdminShell>
  );
}
