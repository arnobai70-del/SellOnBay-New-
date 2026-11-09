import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicFrame } from '@/components/glass/PublicFrame';
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
    <PublicFrame file="account-access">
      <header className="pagehead">
        <h1>How did it go?</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          Two minutes of your time helps us make SellOnBay better.
        </p>
      </header>
      <section className="glass ac" style={{ maxWidth: 640 }}>
        {done ? (
          <p role="status">Thanks, we already have your feedback.</p>
        ) : !r.decidedAt || r.declineReason ? (
          <p role="status">Feedback opens after your request is approved.</p>
        ) : (
          <FeedbackForm orderId={id} reviewHref={`/orders/${id}`} />
        )}
      </section>
    </PublicFrame>
  );
}
