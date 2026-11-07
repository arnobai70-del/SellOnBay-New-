import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GlassCard } from '@/components/glass/GlassCard';
import { betaFeedbackOf, betaRequest } from '@/lib/beta/service';
import { requireViewer } from '@/lib/supabase/viewer';
import { FeedbackForm } from './FeedbackForm';

export const metadata: Metadata = { title: 'Your feedback', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Feedback({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer({ path: `/feedback/${id}` });
  const r = await betaRequest(id);
  if (!r || (viewer && r.buyerId !== viewer.id)) notFound();
  const done = await betaFeedbackOf(id);
  return (
    <>
      <div className="g-head">
        <h1>How did it go?</h1>
        <p className="g-lead">Two minutes of your time helps us make SellOnBay better.</p>
      </div>
      <GlassCard rise={false}>
        {done ? (
          <p role="status">Thanks, we already have your feedback.</p>
        ) : !r.decidedAt || r.declineReason ? (
          <p role="status">Feedback opens after your request is approved.</p>
        ) : (
          <FeedbackForm orderId={id} reviewHref={`/orders/${id}`} />
        )}
      </GlassCard>
    </>
  );
}
