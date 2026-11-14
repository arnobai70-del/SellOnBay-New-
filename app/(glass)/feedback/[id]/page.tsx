import { TopBand } from '@/components/glass/TopBand';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { betaFeedbackOf, betaRequest } from '@/lib/beta/service';
import { requireViewer } from '@/lib/supabase/viewer';
import { FeedbackForm } from './FeedbackForm';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Your feedback'), robots: { index: false } });
export const dynamic = 'force-dynamic';

export default async function Feedback({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer({ path: `/feedback/${id}` });
  const r = await betaRequest(id);
  if (!r || (viewer && r.buyerId !== viewer.id)) notFound();
  const done = await betaFeedbackOf(id);
  return (
    <PublicFrame file="account-access">
      <TopBand title={<T s={'How did it go?'} />} intro={<T s={'Two minutes of your time helps us make SellOnBay better.'} />} />
      <section className="glass ac" style={{ maxWidth: 640 }}>
        {done ? (
          <p role="status">
            <T s={'Thanks, we already have your feedback.'} />
          </p>
        ) : !r.decidedAt || r.declineReason ? (
          <p role="status">
            <T s={'Feedback opens after your request is approved.'} />
          </p>
        ) : (
          <FeedbackForm orderId={id} reviewHref={`/orders/${id}`} />
        )}
      </section>
    </PublicFrame>
  );
}
