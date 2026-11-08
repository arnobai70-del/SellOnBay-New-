import type { Metadata } from 'next';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Request received', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function CheckoutSuccess({ searchParams }: { searchParams: Promise<{ order?: string; n?: string }> }) {
  await requireViewer({ path: '/checkout/success' });
  const { order, n } = await searchParams;
  const count = Math.max(1, Math.min(5, Number(n) || 1));
  const steps = [
    ['Request received', 'No payment was taken.', 'Done', 'ok'],
    ['We review it', 'We email you with our answer.', 'Waiting', 'wait'],
    ['Files and domain steps', 'They unlock once it is approved.', 'Next', 'draft'],
    ['Your feedback', 'A week later we ask how it went.', 'Next', 'draft'],
  ] as const;
  return (
    <>
      <div className="g-head" style={{ alignItems: 'center', textAlign: 'center' }}>
        <h1>Request received, we&apos;ll review it shortly.</h1>
        <p className="g-lead">{count > 1 ? `${count} requests are` : 'Your request is'} with our team. Websites are free for early users during the beta.</p>
        {typeof order === 'string' && /^[0-9a-f-]{36}$/i.test(order) && <p className="tag">Order {orderCode(order)}</p>}
      </div>
      <GlassCard as="section" rise={false}>
        <h2>What happens next</h2>
        {steps.map(([t, d, s, tone]) => (
          <div key={t} className="li">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{t}</div>
              <div className="tag">{d}</div>
            </div>
            <StatusPill tone={tone}>{s}</StatusPill>
          </div>
        ))}
      </GlassCard>
      <div className="row" style={{ marginTop: 18, justifyContent: 'center' }}>
        <Button href="/dashboard/buyer">Go to my dashboard</Button>
        <Button variant="ghost" href="/websites">
          Browse more websites
        </Button>
      </div>
    </>
  );
}
