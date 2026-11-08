import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { BetaOrderView } from '@/components/glass/BetaOrderView';
import { OrderView } from '@/components/OrderView';
import { betaFeedbackOf, betaRequest } from '@/lib/beta/service';
import { plainWords } from '@/lib/glass/words';
import { reviewOfOrder } from '@/lib/reviews';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getViewerId } from '@/lib/supabase/viewer';
import { deliveryOf } from '@/lib/apps';
import { productByKey } from '@/lib/catalog';
import { orderFor } from '@/lib/commerce/access';
import { publicView } from '@/lib/commerce/types';
import { viewExtras } from '@/lib/commerce/viewExtras';
import { extrasOf } from '@/lib/orders/extra';
import { orderEvents } from '@/lib/orders/service';
import { ConversationPanel } from '@/components/ConversationPanel';
import { RevisionPanel } from '@/components/RevisionPanel';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Order({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { id } = await params;
  const { paid } = await searchParams;
  const o = await orderFor(id);
  if (!o) notFound();
  // A free beta request has no payment to show (owner, 2026-11-07).
  if (o.state === 'beta_requested' || o.state === 'beta_approved' || o.state === 'beta_declined') {
    const [r, fb, rev] = await Promise.all([betaRequest(id), betaFeedbackOf(id), reviewOfOrder(id)]);
    return <BetaOrderView id={id} title={plainWords(o.title)} state={o.state} reason={r?.declineReason} domain={r?.domain} reviewed={!!rev} feedbackDone={!!fb} />;
  }
  if (!o.fundedAt) redirect(`/pay/${id}`);
  const p = o.productKey ? await productByKey(o.productKey) : undefined;
  const dv = p ? deliveryOf(p) : null;
  const kind = o.kind !== 'product' ? 'hire' : o.deliveryType === 'repo_access' ? 'repo' : dv === null ? 'web' : dv;
  const me = supabaseConfigured ? await getViewerId() : null;
  return (
    <>
      <OrderView
        initial={publicView(o, await orderEvents(o.id), await extrasOf(o.id), await viewExtras(o))}
        kind={kind}
        paidNow={paid === '1'}
        realtime={supabaseConfigured && !!(await getViewerId())}
        files={dv === 'download' ? p?.app?.rows : undefined}
      />
      {/* SellOnBay 2.0 (D-B): the buyer talks to SellOnBay about the order, never directly to the seller. */}
      {me && me === o.buyerId && (
        <div className="wrap" style={{ paddingBottom: 48 }}>
          {o.fundedAt && (
            <p>
              <a className="btn btn-line btn-sm" href={`/api/orders/${o.id}/receipt`}>
                Download receipt (PDF)
              </a>
            </p>
          )}
          <RevisionPanel orderId={o.id} />
          <ConversationPanel type="order" id={o.id} me="buyer" />
        </div>
      )}
    </>
  );
}
