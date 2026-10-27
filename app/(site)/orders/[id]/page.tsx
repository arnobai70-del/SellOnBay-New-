import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { OrderView } from '@/components/OrderView';
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

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Order({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { id } = await params;
  const { paid } = await searchParams;
  const o = await orderFor(id);
  if (!o) notFound();
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
          <ConversationPanel type="order" id={o.id} me="buyer" />
        </div>
      )}
    </>
  );
}
