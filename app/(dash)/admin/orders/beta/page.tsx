import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { DashShell } from '@/components/DashShell';
import { allBetaFeedback, betaRequests } from '@/lib/beta/service';
import { getOrder } from '@/lib/orders/service';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Beta requests', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Free beta requests and the feedback that comes back. This screen moves into Orders & payments with the admin redesign (Phase 6). */
export default async function BetaRequests() {
  const viewer = await requireViewer({ path: '/admin/orders/beta', roles: ['admin'], scope: ['delivery', 'support', 'finance'] });
  const [all, feedback] = await Promise.all([betaRequests(), allBetaFeedback()]);
  const rows = await Promise.all(all.map(async (r) => ({ r, o: await getOrder(r.orderId), f: feedback.find((x) => x.orderId === r.orderId) })));
  return (
    <DashShell role="admin" active="admin-beta" title="Beta requests" name={viewer?.name} signedIn={!!viewer} viewerRole={viewer ? 'admin' : undefined}>
      <div className="glass card sob-sec">
        {!rows.length && <p className="muted">No requests yet.</p>}
        {rows.map(({ r, o, f }) => (
          <div key={r.orderId} className="sob-item" style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
            <b>
              <Link href={`/admin/orders/${r.orderId}`}>{o?.title ?? r.productKey}</Link>
            </b>
            <p className="muted" style={{ fontSize: 14 }}>
              {r.name} · {r.email} · {r.country}
              {r.company ? ` · ${r.company}` : ''}
              {r.domain ? ` · domain ${r.domain}` : ''} · {new Date(r.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
            </p>
            <p style={{ fontSize: 14 }}>{r.useFor}</p>
            {r.decidedAt ? (
              <p className="muted" style={{ fontSize: 14 }}>
                {r.declineReason ? `Declined: ${r.declineReason}` : 'Approved'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <ActionButton endpoint={`/api/admin/beta/${r.orderId}`} label="Approve" body={{ decision: 'approve' }} />
                <ActionButton endpoint={`/api/admin/beta/${r.orderId}`} label="Decline" tone="line" body={{ decision: 'decline' }} note={{ label: 'Reason for the buyer', required: true }} />
              </div>
            )}
            {f && (
              <p style={{ fontSize: 14, marginTop: 8 }}>
                Feedback: {f.rating} of 5.{f.worked ? ` Worked: ${f.worked}.` : ''}
                {f.improve ? ` Improve: ${f.improve}.` : ''}
              </p>
            )}
          </div>
        ))}
      </div>
    </DashShell>
  );
}
